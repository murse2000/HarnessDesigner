import type { PartDrawing2D } from "./model";
import { normalizeRectangle, type Rectangle2D } from "./dxfSymbol";

export type ParsedRaster2D = {
  sourceName: string;
  sourceType: "image";
  bounds: Rectangle2D;
  paths: [];
  unsupported: [];
  imageDataUrl: string;
  pageNumber: number;
  pageCount: number;
};

export async function parseImageDrawing(data: Blob, sourceName: string): Promise<ParsedRaster2D> {
  const imageDataUrl = await readBlobAsDataUrl(data);
  const image = await loadImage(imageDataUrl);
  if (image.naturalWidth <= 0 || image.naturalHeight <= 0) throw new Error("이미지 크기를 확인할 수 없습니다.");
  return {
    sourceName,
    sourceType: "image",
    bounds: { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight },
    paths: [],
    unsupported: [],
    imageDataUrl,
    pageNumber: 1,
    pageCount: 1,
  };
}

export async function extractRasterPartDrawing(
  parsed: ParsedRaster2D,
  selection: Rectangle2D,
  symbolScale: number,
): Promise<PartDrawing2D> {
  if (!Number.isFinite(symbolScale) || symbolScale <= 0) {
    throw new Error("심벌 크기를 계산할 수 없습니다.");
  }
  const normalized = normalizeRectangle(selection);
  if (normalized.width <= 0 || normalized.height <= 0) throw new Error("추출할 도면 영역을 선택하세요.");
  const image = await loadImage(parsed.imageDataUrl);
  const canvas = window.document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(normalized.width));
  canvas.height = Math.max(1, Math.round(normalized.height));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("이미지 도면을 자를 수 없습니다.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    image,
    normalized.x,
    normalized.y,
    normalized.width,
    normalized.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return {
    sourceName: parsed.sourceName,
    widthMm: normalized.width * symbolScale,
    heightMm: normalized.height * symbolScale,
    paths: [],
    imageDataUrl: canvas.toDataURL("image/png"),
    unsupportedEntities: [],
  };
}

function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("이미지를 읽을 수 없습니다."));
    reader.onerror = () => reject(new Error("이미지를 읽을 수 없습니다."));
    reader.readAsDataURL(blob);
  });
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("도면 이미지를 불러올 수 없습니다."));
    image.src = source;
  });
}
