import type { ModelAsset, ModelMesh, SymbolAsset } from "../domain/types";
import { MathUtils, Quaternion, Vector3 } from "three";
import type { ModelCableAxis, ModelPlacement } from "./modelPlacement";

export type StepProjectionView = "front" | "back" | "left" | "right" | "top" | "bottom";

export interface StepProjectionSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

type VectorTuple = [number, number, number];
type FaceEdge = { from: VectorTuple; to: VectorTuple; normals: VectorTuple[] };
type ProjectionPlacement = Pick<ModelPlacement, "cableAxis" | "rollDeg">;

const viewAxes: Record<StepProjectionView, { horizontal: VectorTuple; vertical: VectorTuple; direction: VectorTuple }> = {
  front: { horizontal: [1, 0, 0], vertical: [0, -1, 0], direction: [0, 0, 1] },
  back: { horizontal: [-1, 0, 0], vertical: [0, -1, 0], direction: [0, 0, -1] },
  left: { horizontal: [0, 0, 1], vertical: [0, -1, 0], direction: [-1, 0, 0] },
  right: { horizontal: [0, 0, -1], vertical: [0, -1, 0], direction: [1, 0, 0] },
  top: { horizontal: [1, 0, 0], vertical: [0, 0, 1], direction: [0, 1, 0] },
  bottom: { horizontal: [1, 0, 0], vertical: [0, 0, -1], direction: [0, -1, 0] },
};

const dot = (left: VectorTuple, right: VectorTuple) => left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
const subtract = (left: VectorTuple, right: VectorTuple): VectorTuple => [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
const cross = (left: VectorTuple, right: VectorTuple): VectorTuple => [left[1] * right[2] - left[2] * right[1], left[2] * right[0] - left[0] * right[2], left[0] * right[1] - left[1] * right[0]];

function normalized(value: VectorTuple): VectorTuple | null {
  const length = Math.hypot(...value);
  return length > 1e-9 ? [value[0] / length, value[1] / length, value[2] / length] : null;
}

function pointKey(point: VectorTuple) {
  return point.map((value) => Math.round(value * 10000)).join(",");
}

function edgeKey(from: VectorTuple, to: VectorTuple) {
  const left = pointKey(from);
  const right = pointKey(to);
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

function cableAxisVector(axis: ModelCableAxis) {
  if (axis === "+x") return new Vector3(1, 0, 0);
  if (axis === "-x") return new Vector3(-1, 0, 0);
  if (axis === "+y") return new Vector3(0, 1, 0);
  if (axis === "-y") return new Vector3(0, -1, 0);
  if (axis === "-z") return new Vector3(0, 0, -1);
  return new Vector3(0, 0, 1);
}

function placementRotation(placement?: ProjectionPlacement) {
  if (!placement) return null;
  const direction = new Vector3(0, 0, 1);
  const alignment = new Quaternion().setFromUnitVectors(cableAxisVector(placement.cableAxis), direction);
  const roll = new Quaternion().setFromAxisAngle(direction, MathUtils.degToRad(placement.rollDeg));
  return roll.multiply(alignment);
}

function meshEdges(mesh: ModelMesh, scale: number, rotation: Quaternion | null): FaceEdge[] {
  const edges = new Map<string, FaceEdge>();
  const triangleCount = mesh.indices.length ? Math.floor(mesh.indices.length / 3) : Math.floor(mesh.positions.length / 9);
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const indices = mesh.indices.length
      ? [mesh.indices[triangle * 3], mesh.indices[triangle * 3 + 1], mesh.indices[triangle * 3 + 2]]
      : [triangle * 3, triangle * 3 + 1, triangle * 3 + 2];
    const points = indices.map((index): VectorTuple => {
      const point = new Vector3(mesh.positions[index * 3] * scale, mesh.positions[index * 3 + 1] * scale, mesh.positions[index * 3 + 2] * scale);
      if (rotation) point.applyQuaternion(rotation);
      return [point.x, point.y, point.z];
    });
    if (points.some((point) => point.some((value) => !Number.isFinite(value)))) continue;
    const normal = normalized(cross(subtract(points[1], points[0]), subtract(points[2], points[0])));
    if (!normal) continue;
    for (const [from, to] of [[points[0], points[1]], [points[1], points[2]], [points[2], points[0]]] as Array<[VectorTuple, VectorTuple]>) {
      const key = edgeKey(from, to);
      const existing = edges.get(key);
      if (existing) existing.normals.push(normal);
      else edges.set(key, { from, to, normals: [normal] });
    }
  }
  return [...edges.values()];
}

function projectedSegment(edge: FaceEdge, view: StepProjectionView): StepProjectionSegment {
  const axes = viewAxes[view];
  return {
    x1: dot(edge.from, axes.horizontal),
    y1: dot(edge.from, axes.vertical),
    x2: dot(edge.to, axes.horizontal),
    y2: dot(edge.to, axes.vertical),
  };
}

function visibleFeature(edge: FaceEdge, view: StepProjectionView) {
  const facing = edge.normals.map((normal) => dot(normal, viewAxes[view].direction));
  if (edge.normals.length === 1) return facing[0] >= -1e-6;
  if (facing.some((value) => value > 1e-6) && facing.some((value) => value < -1e-6)) return true;
  if (!facing.some((value) => value >= -1e-6)) return false;
  const threshold = Math.cos(30 * Math.PI / 180);
  return edge.normals.some((normal, index) => edge.normals.slice(index + 1).some((other) => dot(normal, other) < threshold));
}

function projectedKey(segment: StepProjectionSegment) {
  const point = (x: number, y: number) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
  const left = point(segment.x1, segment.y1);
  const right = point(segment.x2, segment.y2);
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

export function projectStepEdges(asset: ModelAsset, view: StepProjectionView, scale = 1, placement?: ProjectionPlacement): StepProjectionSegment[] {
  const segments = new Map<string, StepProjectionSegment>();
  const rotation = placementRotation(placement);
  for (const mesh of asset.meshes) {
    for (const edge of meshEdges(mesh, scale, rotation)) {
      if (!visibleFeature(edge, view)) continue;
      const segment = projectedSegment(edge, view);
      if (Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1) < 0.01) continue;
      segments.set(projectedKey(segment), segment);
    }
  }
  return [...segments.values()];
}

export function createStepProjectionSymbol(asset: ModelAsset, view: StepProjectionView, scale = 1, id: string = crypto.randomUUID(), placement?: ProjectionPlacement): SymbolAsset {
  const segments = projectStepEdges(asset, view, scale, placement);
  if (!segments.length) throw new Error("선택한 방향에서 생성할 수 있는 STEP 2D 외곽선이 없습니다.");
  const xs = segments.flatMap((segment) => [segment.x1, segment.x2]);
  const ys = segments.flatMap((segment) => [segment.y1, segment.y2]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padding = Math.max(1, (maxX - minX + maxY - minY) * 0.025);
  const viewBox = `${minX - padding} ${minY - padding} ${Math.max(1, maxX - minX + padding * 2)} ${Math.max(1, maxY - minY + padding * 2)}`;
  const lines = segments.map((segment) => `<line x1="${segment.x1.toFixed(4)}" y1="${segment.y1.toFixed(4)}" x2="${segment.x2.toFixed(4)}" y2="${segment.y2.toFixed(4)}"/>`).join("");
  return {
    id,
    name: `${asset.name} ${view}`,
    sourceFormat: "svg",
    sourceName: `${asset.sourceName.replace(/\.(step|stp)$/i, "")}_${view}.svg`,
    viewBox,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" data-step-view="${view}"><g fill="none" stroke="currentColor" stroke-width="0.35" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round">${lines}</g></svg>`,
  };
}
