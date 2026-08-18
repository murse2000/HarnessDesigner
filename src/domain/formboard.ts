import type { FormboardFixture, FormboardLayoutState, HarnessAssembly, HarnessSegment, Point } from "./types";

export interface FormboardLayout {
  nodes: Record<string, Point>;
  routes: Record<string, Point[]>;
  fixtures: FormboardFixture[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface FormboardSegmentMetric {
  segmentId: string;
  targetLengthMm: number;
  drawingLengthMm: number;
  errorMm: number;
  valid: boolean;
  bendClearanceValid: boolean;
}

export interface FormboardCableGeometry {
  jacketPoints: Point[];
  sourceFanoutPoints: Point[];
  targetFanoutPoints: Point[];
}

function automaticNodePositions(harness: HarnessAssembly) {
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
  return nodes;
}

export function createFormboardState(harness: HarnessAssembly): FormboardLayoutState {
  return { nodePositions: automaticNodePositions(harness), segmentRoutes: {}, fixtures: [] };
}

export function formboardSegmentPoints(layout: Pick<FormboardLayout, "nodes" | "routes">, segment: HarnessSegment): Point[] {
  const from = layout.nodes[segment.fromNodeId];
  const to = layout.nodes[segment.toNodeId];
  return from && to ? [from, ...(layout.routes[segment.id] ?? []), to] : [];
}

export function formboardNodeRouteAngle(harness: HarnessAssembly, layout: Pick<FormboardLayout, "nodes" | "routes">, nodeId: string): number | null {
  const connected = harness.segments.filter((segment) => segment.fromNodeId === nodeId || segment.toNodeId === nodeId);
  if (connected.length !== 1) return null;
  const segment = connected[0];
  const points = formboardSegmentPoints(layout, segment);
  if (points.length < 2) return null;
  const nodeAtStart = segment.fromNodeId === nodeId;
  const origin = nodeAtStart ? points[0] : points.at(-1)!;
  const candidates = nodeAtStart ? points.slice(1) : points.slice(0, -1).reverse();
  const adjacent = candidates.find((point) => Math.hypot(point.x - origin.x, point.y - origin.y) > 0.001);
  return adjacent ? Math.atan2(adjacent.y - origin.y, adjacent.x - origin.x) * 180 / Math.PI : null;
}

export function formboardPathLength(points: Point[]) {
  return points.slice(1).reduce((total, point, index) => total + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0);
}

function formboardPathPoint(points: Point[], distanceMm: number): Point {
  if (!points.length) return { x: 0, y: 0 };
  let travelled = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (travelled + length >= distanceMm) {
      const ratio = length ? (distanceMm - travelled) / length : 0;
      return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
    }
    travelled += length;
  }
  return points.at(-1)!;
}

function formboardPathSlice(points: Point[], startMm: number, endMm: number): Point[] {
  const total = formboardPathLength(points);
  const start = Math.min(Math.max(startMm, 0), total);
  const end = Math.min(Math.max(endMm, start), total);
  const result = [formboardPathPoint(points, start)];
  let travelled = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    travelled += Math.hypot(points[index + 1].x - points[index].x, points[index + 1].y - points[index].y);
    if (travelled > start && travelled < end) result.push(points[index + 1]);
  }
  const last = formboardPathPoint(points, end);
  if (Math.hypot(last.x - result.at(-1)!.x, last.y - result.at(-1)!.y) > 0.001) result.push(last);
  return result;
}

export function formboardCableGeometry(points: Point[], sourceBreakoutMm: number, targetBreakoutMm: number): FormboardCableGeometry | null {
  const total = formboardPathLength(points);
  if (points.length < 2 || total <= 0) return null;
  const source = Math.min(Math.max(sourceBreakoutMm, 0), total);
  const target = Math.min(Math.max(targetBreakoutMm, 0), total - source);
  return {
    sourceFanoutPoints: formboardPathSlice(points, 0, source),
    jacketPoints: formboardPathSlice(points, source, total - target),
    targetFanoutPoints: formboardPathSlice(points, total - target, total),
  };
}

export function formboardFanoutPoints(points: Point[], offsetMm: number, spreadAt: "source" | "target"): Point[] {
  const from = points[0];
  const to = points.at(-1);
  if (!from || !to) return points;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const normal = { x: -dy / length, y: dx / length };
  return points.map((point, index) => {
    const ratio = points.length === 1 ? 0 : index / (points.length - 1);
    const weight = spreadAt === "source" ? 1 - ratio : ratio;
    return { x: point.x + normal.x * offsetMm * weight, y: point.y + normal.y * offsetMm * weight };
  });
}

export function fitFormboardSegmentRoute(from: Point, to: Point, targetLengthMm: number): Point[] | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const directLength = Math.hypot(dx, dy);
  if (directLength > targetLengthMm + 0.01) return null;
  if (Math.abs(directLength - targetLengthMm) <= 0.01) return [];
  const height = Math.sqrt(Math.max(0, targetLengthMm ** 2 - directLength ** 2)) / 2;
  const normalX = directLength ? -dy / directLength : 0;
  const normalY = directLength ? dx / directLength : 1;
  return [{ x: (from.x + to.x) / 2 + normalX * height, y: (from.y + to.y) / 2 + normalY * height }];
}

export function formboardSegmentMetrics(harness: HarnessAssembly, layout = buildFormboardLayout(harness), toleranceMm = 1): FormboardSegmentMetric[] {
  return harness.segments.map((segment) => {
    const points = formboardSegmentPoints(layout, segment);
    const drawingLengthMm = formboardPathLength(points);
    const errorMm = drawingLengthMm - segment.lengthMm;
    const shortestLeg = points.slice(1).reduce((shortest, point, index) => Math.min(shortest, Math.hypot(point.x - points[index].x, point.y - points[index].y)), Number.POSITIVE_INFINITY);
    return {
      segmentId: segment.id,
      targetLengthMm: segment.lengthMm,
      drawingLengthMm,
      errorMm,
      valid: points.length >= 2 && Math.abs(errorMm) <= toleranceMm,
      bendClearanceValid: !segment.bendRadiusMm || points.length <= 2 || shortestLeg >= segment.bendRadiusMm * 2,
    };
  });
}

export function buildFormboardLayout(harness: HarnessAssembly): FormboardLayout {
  const automatic = automaticNodePositions(harness);
  const nodes = Object.fromEntries(harness.nodes.map((node) => [node.id, harness.formboard?.nodePositions[node.id] ?? automatic[node.id] ?? { x: 0, y: 0 }]));
  const routes = Object.fromEntries(harness.segments.map((segment) => [segment.id, harness.formboard?.segmentRoutes[segment.id] ?? []]));
  const fixtures = harness.formboard?.fixtures ?? [];
  const points = [...Object.values(nodes), ...Object.values(routes).flat(), ...fixtures.map((fixture) => fixture.position)];
  return {
    nodes,
    routes,
    fixtures,
    bounds: {
      minX: points.length ? Math.min(...points.map((point) => point.x)) : 0,
      minY: points.length ? Math.min(...points.map((point) => point.y)) : 0,
      maxX: points.length ? Math.max(...points.map((point) => point.x)) : 0,
      maxY: points.length ? Math.max(...points.map((point) => point.y)) : 0,
    },
  };
}
