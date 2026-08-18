import type { HarnessAssembly, HarnessSegment } from "../domain/types";

export interface HarnessPoint3 {
  x: number;
  y: number;
  z: number;
}

export type HarnessRoutePoint3 = NonNullable<HarnessSegment["threeDRoute"]>["controlPoints"][number];

export function positionHarnessRoutePoint(start: HarnessPoint3, end: HarnessPoint3, point: HarnessRoutePoint3): HarnessPoint3 {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const horizontalLength = Math.hypot(dx, dz);
  const sideX = horizontalLength > 0.001 ? -dz / horizontalLength : 0;
  const sideZ = horizontalLength > 0.001 ? dx / horizontalLength : 1;
  return {
    x: start.x + dx * point.t + sideX * point.offsetX,
    y: start.y + dy * point.t + point.offsetY,
    z: start.z + dz * point.t + sideZ * point.offsetX,
  };
}

export function projectHarnessRoutePoint(start: HarnessPoint3, end: HarnessPoint3, position: HarnessPoint3): HarnessRoutePoint3 {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dy * dy + dz * dz;
  const rawT = lengthSquared > 0.001 ? ((position.x - start.x) * dx + (position.y - start.y) * dy + (position.z - start.z) * dz) / lengthSquared : 0.5;
  const t = Math.min(0.95, Math.max(0.05, rawT));
  const horizontalLength = Math.hypot(dx, dz);
  const sideX = horizontalLength > 0.001 ? -dz / horizontalLength : 0;
  const sideZ = horizontalLength > 0.001 ? dx / horizontalLength : 1;
  const baseline = { x: start.x + dx * t, y: start.y + dy * t, z: start.z + dz * t };
  return {
    t,
    offsetX: (position.x - baseline.x) * sideX + (position.z - baseline.z) * sideZ,
    offsetY: position.y - baseline.y,
  };
}

export function getCompactCoilLayout(cableLengthMm: number, displayLengthMm: number) {
  const excessLengthMm = Math.max(cableLengthMm - displayLengthMm, 0);
  if (!excessLengthMm) return null;
  const turns = Math.min(3, Math.max(1, Math.ceil(excessLengthMm / 1500)));
  const radiusMm = Math.min(36, Math.max(8, excessLengthMm / (2 * Math.PI * turns)));
  return { turns, radiusMm };
}

export function layoutHarnessNodes(harness: HarnessAssembly, maxSegmentDisplayLengthMm?: number): Map<string, HarnessPoint3> {
  const nodes = new Map(harness.nodes.map((node) => [node.id, node]));
  const connected = new Map<string, { otherId: string; lengthMm: number }[]>();
  for (const segment of harness.segments) {
    connected.set(segment.fromNodeId, [...(connected.get(segment.fromNodeId) ?? []), { otherId: segment.toNodeId, lengthMm: segment.lengthMm }]);
    connected.set(segment.toNodeId, [...(connected.get(segment.toNodeId) ?? []), { otherId: segment.fromNodeId, lengthMm: segment.lengthMm }]);
  }

  const positions = new Map<string, HarnessPoint3>();
  let componentIndex = 0;
  for (const root of harness.nodes) {
    if (positions.has(root.id)) continue;
    positions.set(root.id, { x: componentIndex * 1000, y: 5, z: 0 });
    componentIndex += 1;
    const queue = [root.id];
    while (queue.length) {
      const currentId = queue.shift()!;
      const current = nodes.get(currentId)!;
      const currentPosition = positions.get(currentId)!;
      for (const edge of connected.get(currentId) ?? []) {
        if (positions.has(edge.otherId)) continue;
        const other = nodes.get(edge.otherId);
        if (!other) continue;
        const dx = other.position.x - current.position.x;
        const dz = other.position.y - current.position.y;
        const layoutDistance = Math.hypot(dx, dz);
        const unitX = layoutDistance > 0.001 ? dx / layoutDistance : 1;
        const unitZ = layoutDistance > 0.001 ? dz / layoutDistance : 0;
        const displayLength = maxSegmentDisplayLengthMm ? Math.min(edge.lengthMm, maxSegmentDisplayLengthMm) : edge.lengthMm;
        positions.set(other.id, {
          x: currentPosition.x + unitX * displayLength,
          y: 5,
          z: currentPosition.z + unitZ * displayLength,
        });
        queue.push(other.id);
      }
    }
  }
  for (const node of harness.nodes) {
    if (node.threeDPosition) positions.set(node.id, { ...node.threeDPosition });
  }
  return positions;
}
