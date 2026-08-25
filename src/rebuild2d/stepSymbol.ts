import type { ModelAsset } from "../domain/types";
import { projectStepEdges } from "../three/stepProjection";
import type { ParsedDxf2D } from "./dxfSymbol";

export type StepDrawingRotation = {
  x: number;
  y: number;
  z: number;
};

export function projectStepDrawing(asset: ModelAsset, rotation: StepDrawingRotation): ParsedDxf2D {
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
    unsupported: [],
  };
}
