import type { Point } from "./types";

export type CanvasLayoutCommand = "alignLeft" | "alignCenter" | "alignTop" | "alignMiddle" | "distributeHorizontal" | "distributeVertical";

export function arrangeCanvasPoints(points: Record<string, Point>, command: CanvasLayoutCommand): Record<string, Point> {
  const entries = Object.entries(points);
  if (entries.length < 2) return structuredClone(points);
  const next = structuredClone(points);
  const xs = entries.map(([, point]) => point.x);
  const ys = entries.map(([, point]) => point.y);
  if (command === "alignLeft") entries.forEach(([id]) => { next[id].x = Math.min(...xs); });
  if (command === "alignCenter") entries.forEach(([id]) => { next[id].x = (Math.min(...xs) + Math.max(...xs)) / 2; });
  if (command === "alignTop") entries.forEach(([id]) => { next[id].y = Math.min(...ys); });
  if (command === "alignMiddle") entries.forEach(([id]) => { next[id].y = (Math.min(...ys) + Math.max(...ys)) / 2; });
  if (command === "distributeHorizontal" && entries.length > 2) distribute(next, entries, "x");
  if (command === "distributeVertical" && entries.length > 2) distribute(next, entries, "y");
  return next;
}

function distribute(points: Record<string, Point>, entries: Array<[string, Point]>, axis: "x" | "y") {
  const sorted = [...entries].sort(([, left], [, right]) => left[axis] - right[axis]);
  const start = sorted[0][1][axis];
  const end = sorted.at(-1)![1][axis];
  sorted.forEach(([id], index) => { points[id][axis] = start + (end - start) * index / (sorted.length - 1); });
}

export function nudgeCanvasPoints(points: Record<string, Point>, delta: Point): Record<string, Point> {
  return Object.fromEntries(Object.entries(points).map(([id, point]) => [id, { x: point.x + delta.x, y: point.y + delta.y }]));
}
