import type { ModelAsset } from "../domain/types";
import { projectStepEdges } from "../three/stepProjection";
import { Euler, MathUtils, Vector3 } from "three";
import { normalizeRectangle, type ParsedDxf2D, type Rectangle2D } from "./dxfSymbol";
import type { PartDrawing2D } from "./model";

export type StepDrawingRotation = {
  x: number;
  y: number;
  z: number;
};

export type StepRenderMode = "shaded" | "technical";

export type StepProjectedSurface = {
  meshIndex: number;
  meshName: string;
  points: Array<{ x: number; y: number }>;
  depth: number;
  brightness: number;
};

export type ParsedStepDrawing2D = ParsedDxf2D & {
  surfaces: StepProjectedSurface[];
};

export function projectStepDrawing(asset: ModelAsset, rotation: StepDrawingRotation): ParsedStepDrawing2D {
  const segments = projectStepEdges(asset, "front", 1, {
    cableAxis: "+z",
    rollDeg: 0,
    rotationXDeg: rotation.x,
    rotationYDeg: rotation.y,
    rotationZDeg: rotation.z,
  });
  if (segments.length === 0) throw new Error("현재 각도에서 생성할 수 있는 STEP 2D 선이 없습니다.");

  const paths = segments.map((segment) => ({
    points: [{ x: segment.x1, y: segment.y1 }, { x: segment.x2, y: segment.y2 }],
    closed: false,
    layer: "STEP_PROJECTION",
    sourceType: "STEP_EDGE",
  }));
  const xs = segments.flatMap((segment) => [segment.x1, segment.x2]);
  const ys = segments.flatMap((segment) => [segment.y1, segment.y2]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    sourceName: `${asset.sourceName} · STEP 투영`,
    bounds: { x: minX, y: minY, width: Math.max(0.001, maxX - minX), height: Math.max(0.001, maxY - minY) },
    paths,
    surfaces: projectStepSurfaces(asset, rotation),
    unsupported: [],
  };
}

export function stepSurfaceDefaultColor(asset: ModelAsset, meshIndex: number) {
  const color = asset.meshes[meshIndex]?.color;
  if (!color) return "#cfd6da";
  return `#${color.map((value) => Math.round(Math.min(1, Math.max(0, value)) * 255).toString(16).padStart(2, "0")).join("")}`;
}

export function stepSurfaceFill(asset: ModelAsset, meshIndex: number, colors: Record<string, string>, brightness: number) {
  return shadeColor(colors[String(meshIndex)] ?? stepSurfaceDefaultColor(asset, meshIndex), brightness);
}

export function extractStepShadedPartDrawing(
  parsed: ParsedStepDrawing2D,
  asset: ModelAsset,
  colors: Record<string, string>,
  selection: Rectangle2D,
  symbolScale: number,
  outlineStrength: number,
): PartDrawing2D {
  const bounds = normalizeRectangle(selection);
  if (bounds.width <= 0 || bounds.height <= 0) throw new Error("추출할 STEP 투영 영역을 선택하세요.");
  const outlineWidth = Math.max(bounds.width, bounds.height) / 420 * Math.max(0.5, outlineStrength);
  const surfaces = parsed.surfaces.map((surface) => {
    const fill = stepSurfaceFill(asset, surface.meshIndex, colors, surface.brightness);
    const points = surface.points.map((point) => `${point.x.toFixed(4)},${point.y.toFixed(4)}`).join(" ");
    return `<polygon points="${points}" fill="${fill}"/>`;
  }).join("");
  const edges = parsed.paths.map((path) => {
    const points = path.points.map((point) => `${point.x.toFixed(4)},${point.y.toFixed(4)}`).join(" ");
    return `<polyline points="${points}" fill="none" stroke="#314a59" stroke-width="${outlineWidth.toFixed(4)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}" preserveAspectRatio="none">${surfaces}${edges}</svg>`;
  return {
    sourceName: parsed.sourceName,
    widthMm: bounds.width * symbolScale,
    heightMm: bounds.height * symbolScale,
    paths: [],
    imageDataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    unsupportedEntities: [],
  };
}

export function preferStepShadedDrawing(drawing: PartDrawing2D): PartDrawing2D {
  const state = drawing.editorState;
  const asset = state?.stepAsset;
  if (!state || !asset) return drawing;
  const selection = normalizeRectangle(state.selection);
  const symbolScale = drawing.widthMm / selection.width;
  return {
    ...extractStepShadedPartDrawing(
      projectStepDrawing(asset, state.stepRotation ?? { x: 0, y: 0, z: 0 }),
      asset,
      state.stepSurfaceColors ?? {},
      selection,
      symbolScale,
      drawing.outlineStrength ?? 1,
    ),
    editorState: state,
  };
}

function projectStepSurfaces(asset: ModelAsset, rotation: StepDrawingRotation): StepProjectedSurface[] {
  const euler = new Euler(
    MathUtils.degToRad(rotation.x),
    MathUtils.degToRad(rotation.y),
    MathUtils.degToRad(rotation.z),
    "XYZ",
  );
  const surfaces: StepProjectedSurface[] = [];

  asset.meshes.forEach((mesh, meshIndex) => {
    const triangleCount = mesh.indices.length ? Math.floor(mesh.indices.length / 3) : Math.floor(mesh.positions.length / 9);
    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      const indices = mesh.indices.length
        ? [mesh.indices[triangle * 3], mesh.indices[triangle * 3 + 1], mesh.indices[triangle * 3 + 2]]
        : [triangle * 3, triangle * 3 + 1, triangle * 3 + 2];
      const points = indices.map((index) => new Vector3(
        mesh.positions[index * 3],
        mesh.positions[index * 3 + 1],
        mesh.positions[index * 3 + 2],
      ).applyEuler(euler));
      if (points.some((point) => !Number.isFinite(point.x + point.y + point.z))) continue;
      const normal = new Vector3().subVectors(points[1], points[0]).cross(new Vector3().subVectors(points[2], points[0])).normalize();
      if (!Number.isFinite(normal.z)) continue;
      surfaces.push({
        meshIndex,
        meshName: mesh.name,
        points: points.map((point) => ({ x: point.x, y: -point.y })),
        depth: points.reduce((sum, point) => sum + point.z, 0) / 3,
        brightness: 0.58 + Math.abs(normal.z) * 0.42,
      });
    }
  });
  return surfaces.sort((left, right) => left.depth - right.depth);
}

function shadeColor(color: string, brightness: number) {
  const normalized = /^#[0-9a-f]{6}$/i.test(color) ? color.slice(1) : "cfd6da";
  const channels = [0, 2, 4].map((offset) => Math.round(parseInt(normalized.slice(offset, offset + 2), 16) * brightness));
  return `#${channels.map((value) => Math.min(255, Math.max(0, value)).toString(16).padStart(2, "0")).join("")}`;
}
