import type { ModelAsset, PartPreview, PartSnapshot, SymbolAsset } from "./types";

const previewWidth = 320;
const previewHeight = 220;

function svgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function createDrawingPreview(asset: SymbolAsset): PartPreview {
  const svg = asset.svg.replaceAll("currentColor", "#45657f");
  return { kind: "drawing", dataUrl: svgDataUrl(svg), sourceName: asset.sourceName };
}

export function selectStoredPreview(part: PartSnapshot): PartPreview | undefined {
  if (part.preview?.kind === "photo") return part.preview;
  if (part.modelAssetId && part.preview?.kind === "model") return part.preview;
  if (part.symbolAssetId && part.preview?.kind === "drawing") return part.preview;
  return !part.modelAssetId && !part.symbolAssetId ? part.preview : undefined;
}

export async function createPhotoPreview(bytes: Uint8Array, sourceName: string): Promise<PartPreview> {
  const extension = sourceName.split(".").pop()?.toLowerCase();
  const mime = extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg";
  const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const bitmap = await createImageBitmap(new Blob([source], { type: mime }), { imageOrientation: "from-image" });
  const scale = Math.min(1, 640 / bitmap.width, 480 / bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("이미지 미리보기를 생성할 수 없습니다.");
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return { kind: "photo", dataUrl: canvas.toDataURL("image/jpeg", 0.84), sourceName };
}

type ProjectedPoint = { x: number; y: number; depth: number };

function projectPoint(x: number, y: number, z: number): ProjectedPoint {
  return { x: (x - z) * 0.866, y: (x + z) * 0.5 - y, depth: x + z + y * 0.25 };
}

function meshColor(color: [number, number, number] | undefined, shade: number) {
  const source = color ?? [0.46, 0.6, 0.7];
  const channel = (value: number) => Math.max(0, Math.min(255, Math.round(value * shade * 255)));
  return `rgb(${channel(source[0])} ${channel(source[1])} ${channel(source[2])})`;
}

export function createModelPreview(asset: ModelAsset): PartPreview | undefined {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const mesh of asset.meshes) {
    for (let index = 0; index + 2 < mesh.positions.length; index += 3) {
      const point = projectPoint(mesh.positions[index], mesh.positions[index + 1], mesh.positions[index + 2]);
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
  }
  if (!Number.isFinite(minX)) return undefined;

  const scale = Math.min((previewWidth - 32) / Math.max(maxX - minX, 0.001), (previewHeight - 32) / Math.max(maxY - minY, 0.001));
  const offsetX = (previewWidth - (minX + maxX) * scale) / 2;
  const offsetY = (previewHeight - (minY + maxY) * scale) / 2;
  const polygons: { points: string; depth: number; fill: string }[] = [];

  for (const mesh of asset.meshes) {
    const triangleCount = mesh.indices.length ? Math.floor(mesh.indices.length / 3) : Math.floor(mesh.positions.length / 9);
    const triangleBudget = Math.max(12, Math.floor(900 / Math.max(asset.meshes.length, 1)));
    const stride = Math.max(1, Math.ceil(triangleCount / triangleBudget));
    for (let triangle = 0; triangle < triangleCount; triangle += stride) {
      const vertexIndices = mesh.indices.length
        ? [mesh.indices[triangle * 3], mesh.indices[triangle * 3 + 1], mesh.indices[triangle * 3 + 2]]
        : [triangle * 3, triangle * 3 + 1, triangle * 3 + 2];
      const vertices = vertexIndices.map((index) => {
        const start = index * 3;
        return [mesh.positions[start], mesh.positions[start + 1], mesh.positions[start + 2]] as const;
      });
      if (vertices.some((vertex) => vertex.some((value) => !Number.isFinite(value)))) continue;
      const points = vertices.map(([x, y, z]) => projectPoint(x, y, z));
      const [a, b, c] = vertices;
      const ux = b[0] - a[0]; const uy = b[1] - a[1]; const uz = b[2] - a[2];
      const vx = c[0] - a[0]; const vy = c[1] - a[1]; const vz = c[2] - a[2];
      const nx = uy * vz - uz * vy; const ny = uz * vx - ux * vz; const nz = ux * vy - uy * vx;
      const normalLength = Math.hypot(nx, ny, nz) || 1;
      const shade = 0.52 + Math.abs((nx * 0.35 + ny * 0.75 + nz * 0.55) / normalLength) * 0.48;
      polygons.push({
        points: points.map((point) => `${(point.x * scale + offsetX).toFixed(1)},${(point.y * scale + offsetY).toFixed(1)}`).join(" "),
        depth: points.reduce((sum, point) => sum + point.depth, 0) / 3,
        fill: meshColor(mesh.color, shade),
      });
    }
  }
  if (!polygons.length) return undefined;
  polygons.sort((left, right) => left.depth - right.depth);
  const faces = polygons.map((polygon) => `<polygon points="${polygon.points}" fill="${polygon.fill}" stroke="#476177" stroke-width="0.35"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${previewWidth}" height="${previewHeight}" viewBox="0 0 ${previewWidth} ${previewHeight}"><rect width="100%" height="100%" rx="8" fill="#e9eef3"/><path d="M16 190H304M40 208L144 178M176 208L280 178" stroke="#c1ced8" stroke-width="1"/>${faces}</svg>`;
  return { kind: "model", dataUrl: svgDataUrl(svg), sourceName: asset.sourceName };
}
