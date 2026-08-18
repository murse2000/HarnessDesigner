import type { AccessoryPlacement, HarnessAssembly, PartSnapshot, Point } from "./types";

export interface AccessoryDrawingPlacement {
  id: string;
  partNumber: string;
  category: PartSnapshot["category"];
  quantity: number;
  note: string;
  position: Point;
  width?: number;
  height?: number;
}

export function updateAccessoryDrawingSize(accessory: AccessoryPlacement, size: { width: number; height: number }) {
  accessory.drawingWidth = Math.round(size.width);
  accessory.drawingHeight = Math.round(size.height);
}

export function buildAccessoryDrawingPlacements(harness: HarnessAssembly, parts: PartSnapshot[]): AccessoryDrawingPlacement[] {
  const partById = new Map(parts.map((part) => [part.id, part]));
  const nodeById = new Map(harness.nodes.map((node) => [node.id, node]));
  const segmentById = new Map(harness.segments.map((segment) => [segment.id, segment]));
  const anchorCounts = new Map<string, number>();
  const fallback = harness.nodes[0]?.position;

  return harness.accessories.flatMap((accessory, index) => {
    const part = partById.get(accessory.partId);
    if (!part) return [];
    const anchorKey = accessory.nodeId ? `node:${accessory.nodeId}` : accessory.segmentId ? `segment:${accessory.segmentId}` : "unplaced";
    const anchorIndex = anchorCounts.get(anchorKey) ?? 0;
    anchorCounts.set(anchorKey, anchorIndex + 1);
    const node = accessory.nodeId ? nodeById.get(accessory.nodeId) : undefined;
    const segment = accessory.segmentId ? segmentById.get(accessory.segmentId) : undefined;
    const from = segment ? nodeById.get(segment.fromNodeId)?.position : undefined;
    const to = segment ? nodeById.get(segment.toNodeId)?.position : undefined;
    const position = accessory.drawingPosition ?? (node
      ? { x: node.position.x - 58, y: node.position.y - 52 - anchorIndex * 24 }
      : from && to
        ? { x: (from.x + to.x) / 2 - 58, y: (from.y + to.y) / 2 + 22 + anchorIndex * 24 }
        : fallback
          ? { x: fallback.x - 58 + index * 124, y: fallback.y - 82 }
          : undefined);
    return position ? [{
      id: accessory.id,
      partNumber: part.partNumber,
      category: part.category,
      quantity: accessory.quantity,
      note: accessory.note,
      position,
      width: part.category === "label" ? accessory.drawingWidth ?? 116 : undefined,
      height: part.category === "label" ? accessory.drawingHeight ?? 24 : undefined,
    }] : [];
  });
}
