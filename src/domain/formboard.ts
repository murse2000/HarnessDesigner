import type { HarnessAssembly, Point } from "./types";

export interface FormboardLayout {
  nodes: Record<string, Point>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export function buildFormboardLayout(harness: HarnessAssembly): FormboardLayout {
  const sourceNodes = new Map(harness.nodes.map((node) => [node.id, node]));
  const adjacency = new Map<string, Array<{ nodeId: string; lengthMm: number }>>();
  for (const segment of harness.segments) {
    adjacency.set(segment.fromNodeId, [...(adjacency.get(segment.fromNodeId) ?? []), { nodeId: segment.toNodeId, lengthMm: segment.lengthMm }]);
    adjacency.set(segment.toNodeId, [...(adjacency.get(segment.toNodeId) ?? []), { nodeId: segment.fromNodeId, lengthMm: segment.lengthMm }]);
  }
  const nodes: Record<string, Point> = {};
  let componentOffset = 0;
  for (const root of harness.nodes) {
    if (nodes[root.id]) continue;
    nodes[root.id] = { x: componentOffset, y: 0 };
    const queue = [root.id];
    while (queue.length) {
      const currentId = queue.shift()!;
      const current = nodes[currentId];
      for (const edge of adjacency.get(currentId) ?? []) {
        if (nodes[edge.nodeId]) continue;
        const source = sourceNodes.get(currentId)?.position ?? { x: 0, y: 0 };
        const target = sourceNodes.get(edge.nodeId)?.position ?? { x: source.x + 1, y: source.y };
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const magnitude = Math.hypot(dx, dy) || 1;
        nodes[edge.nodeId] = { x: current.x + (dx / magnitude) * edge.lengthMm, y: current.y + (dy / magnitude) * edge.lengthMm };
        queue.push(edge.nodeId);
      }
    }
    const placed = Object.values(nodes);
    componentOffset = Math.max(...placed.map((point) => point.x), componentOffset) + 100;
  }
  const points = Object.values(nodes);
  return {
    nodes,
    bounds: {
      minX: points.length ? Math.min(...points.map((point) => point.x)) : 0,
      minY: points.length ? Math.min(...points.map((point) => point.y)) : 0,
      maxX: points.length ? Math.max(...points.map((point) => point.x)) : 0,
      maxY: points.length ? Math.max(...points.map((point) => point.y)) : 0,
    },
  };
}
