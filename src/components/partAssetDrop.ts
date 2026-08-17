export type AssetDropZone = "photo" | "model";

type DropRect = Pick<DOMRect, "left" | "right" | "top" | "bottom">;

export function assetDropZoneAtPoint(
  point: { x: number; y: number },
  photoRect?: DropRect,
  modelRect?: DropRect,
): AssetDropZone | null {
  const contains = (rect?: DropRect) =>
    Boolean(
      rect &&
        point.x >= rect.left &&
        point.x <= rect.right &&
        point.y >= rect.top &&
        point.y <= rect.bottom,
    );
  if (contains(photoRect)) return "photo";
  if (contains(modelRect)) return "model";
  return null;
}
