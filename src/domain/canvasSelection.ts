import type { HarnessAssembly } from "./types";

export function sameCanvasSelection(current: string[], next: string[]) {
  return current.length === next.length && current.every((id, index) => id === next[index]);
}

export function deleteCanvasSelection(harness: HarnessAssembly, selectedIds: string[], selectedAccessoryIds: string[] = []) {
  const selected = new Set(selectedIds);
  const selectedAccessories = new Set(selectedAccessoryIds);
  const segmentById = new Map(harness.segments.map((segment) => [segment.id, segment]));
  const removedNodeIds = new Set(harness.nodes.filter((node) => selected.has(node.id)).map((node) => node.id));
  const removedSegmentIds = new Set(harness.segments
    .filter((segment) => removedNodeIds.has(segment.fromNodeId) || removedNodeIds.has(segment.toNodeId))
    .map((segment) => segment.id));
  const replacementSegments: HarnessAssembly["segments"] = [];

  harness.nodes = harness.nodes.filter((node) => !removedNodeIds.has(node.id));
  harness.conductors = harness.conductors.flatMap((conductor) => {
    if (removedNodeIds.has(conductor.from.nodeId) || removedNodeIds.has(conductor.to.nodeId)) return [];
    if (!conductor.routeSegmentIds.some((segmentId) => removedSegmentIds.has(segmentId))) return [conductor];
    if (conductor.cableRunId) return [];
    const lengthMm = conductor.routeSegmentIds.reduce((total, segmentId) => total + (segmentById.get(segmentId)?.lengthMm ?? 0), 0);
    const replacement = {
      id: crypto.randomUUID(),
      fromNodeId: conductor.from.nodeId,
      toNodeId: conductor.to.nodeId,
      lengthMm: Math.max(1, lengthMm),
      label: `${conductor.reference} ROUTE`,
    };
    replacementSegments.push(replacement);
    return [{ ...conductor, routeSegmentIds: [replacement.id] }];
  });
  harness.segments = [
    ...harness.segments.filter((segment) => !removedSegmentIds.has(segment.id)),
    ...replacementSegments,
  ];
  harness.accessories = harness.accessories.filter((accessory) => (
    !selectedAccessories.has(accessory.id)
    && (!accessory.nodeId || !removedNodeIds.has(accessory.nodeId))
    && (!accessory.segmentId || !removedSegmentIds.has(accessory.segmentId))
  ));
  harness.drawingAnnotations = (harness.drawingAnnotations ?? []).filter((annotation) => !selected.has(annotation.id));
}

export function sameCanvasEntitySelection(
  currentId: string | null,
  currentType: string | null,
  nextId: string,
  nextType: "node" | "accessory" | "annotation",
) {
  return currentId === nextId && currentType === nextType;
}
