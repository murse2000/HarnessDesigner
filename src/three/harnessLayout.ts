import type { HarnessAssembly } from "../domain/types";

export interface HarnessPoint3 {
  x: number;
  y: number;
  z: number;
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
  return positions;
}
