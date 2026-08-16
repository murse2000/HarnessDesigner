import type { SymbolAsset } from "../domain/types";

const xmlEscape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export interface CadImportResult {
  asset: SymbolAsset;
  warnings: string[];
}

export function importSvg(source: string, sourceName: string): CadImportResult {
  const document = new DOMParser().parseFromString(source, "image/svg+xml");
  if (document.querySelector("parsererror")) throw new Error("SVG 문법을 해석할 수 없습니다.");
  const root = document.documentElement;
  for (const node of root.querySelectorAll("script, foreignObject, iframe, audio, video")) node.remove();
  for (const element of root.querySelectorAll("*")) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith("on") || ((name === "href" || name.endsWith(":href")) && !value.startsWith("#"))) element.removeAttribute(attribute.name);
    }
  }
  const viewBox = root.getAttribute("viewBox") || `0 0 ${Number.parseFloat(root.getAttribute("width") || "100") || 100} ${Number.parseFloat(root.getAttribute("height") || "100") || 100}`;
  root.setAttribute("viewBox", viewBox);
  root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  root.removeAttribute("width");
  root.removeAttribute("height");
  return { asset: { id: crypto.randomUUID(), name: sourceName.replace(/\.svg$/i, ""), sourceFormat: "svg", sourceName, viewBox, svg: new XMLSerializer().serializeToString(root) }, warnings: [] };
}

export function importDxf(source: string, sourceName: string): CadImportResult {
  const raw = source.replaceAll("\r", "").split("\n");
  const pairs: Array<{ code: number; value: string }> = [];
  for (let index = 0; index + 1 < raw.length; index += 2) {
    const code = Number.parseInt(raw[index].trim(), 10);
    if (!Number.isNaN(code)) pairs.push({ code, value: raw[index + 1].trim() });
  }
  const entities: string[] = [];
  const warnings = new Set<string>();
  const points: Array<{ x: number; y: number }> = [];
  let index = 0;
  while (index < pairs.length) {
    if (pairs[index].code !== 0) { index += 1; continue; }
    const type = pairs[index].value.toUpperCase();
    const fields: Array<{ code: number; value: string }> = [];
    index += 1;
    while (index < pairs.length && pairs[index].code !== 0) fields.push(pairs[index++]);
    const values = (code: number) => fields.filter((item) => item.code === code).map((item) => Number.parseFloat(item.value));
    const first = (code: number, fallback = 0) => values(code)[0] ?? fallback;
    if (type === "LINE") {
      const x1 = first(10), y1 = -first(20), x2 = first(11), y2 = -first(21); points.push({ x: x1, y: y1 }, { x: x2, y: y2 });
      entities.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);
    } else if (type === "CIRCLE") {
      const cx = first(10), cy = -first(20), r = Math.abs(first(40)); points.push({ x: cx - r, y: cy - r }, { x: cx + r, y: cy + r });
      entities.push(`<circle cx="${cx}" cy="${cy}" r="${r}"/>`);
    } else if (type === "ARC") {
      const cx = first(10), cy = -first(20), r = Math.abs(first(40)); const start = first(50) * Math.PI / 180; const end = first(51) * Math.PI / 180;
      const x1 = cx + r * Math.cos(start), y1 = cy - r * Math.sin(start), x2 = cx + r * Math.cos(end), y2 = cy - r * Math.sin(end); const large = ((first(51) - first(50) + 360) % 360) > 180 ? 1 : 0;
      points.push({ x: cx - r, y: cy - r }, { x: cx + r, y: cy + r }); entities.push(`<path d="M ${x1} ${y1} A ${r} ${r} 0 ${large} 0 ${x2} ${y2}"/>`);
    } else if (type === "LWPOLYLINE" || type === "POLYLINE") {
      const xs = values(10), ys = values(20).map((value) => -value); const coords = xs.map((x, pointIndex) => `${x},${ys[pointIndex] ?? 0}`);
      xs.forEach((x, pointIndex) => points.push({ x, y: ys[pointIndex] ?? 0 }));
      entities.push(`<polyline points="${coords.join(" ")}" ${first(70) & 1 ? 'fill="none"' : ""}/>`);
    } else if (type === "TEXT" || type === "MTEXT") {
      const x = first(10), y = -first(20); const text = fields.find((item) => item.code === 1)?.value ?? ""; points.push({ x, y }); entities.push(`<text x="${x}" y="${y}" font-size="${Math.max(first(40, 2.5), 1)}">${xmlEscape(text)}</text>`);
    } else if (!["SECTION", "ENDSEC", "EOF", "TABLE", "ENDTAB", "BLOCK", "ENDBLK"].includes(type)) warnings.add(`지원하지 않는 DXF 요소: ${type}`);
  }
  if (!entities.length) throw new Error("가져올 수 있는 2D DXF 요소가 없습니다.");
  const minX = Math.min(...points.map((point) => point.x)), maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y)), maxY = Math.max(...points.map((point) => point.y));
  const pad = Math.max((maxX - minX + maxY - minY) * 0.025, 2);
  const viewBox = `${minX - pad} ${minY - pad} ${Math.max(maxX - minX + pad * 2, 10)} ${Math.max(maxY - minY + pad * 2, 10)}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><g fill="none" stroke="currentColor" stroke-width="0.5" vector-effect="non-scaling-stroke">${entities.join("")}</g></svg>`;
  return { asset: { id: crypto.randomUUID(), name: sourceName.replace(/\.dxf$/i, ""), sourceFormat: "dxf", sourceName, viewBox, svg }, warnings: [...warnings] };
}

export function importCad(source: string, sourceName: string): CadImportResult {
  if (sourceName.toLowerCase().endsWith(".svg")) return importSvg(source, sourceName);
  if (sourceName.toLowerCase().endsWith(".dxf")) return importDxf(source, sourceName);
  throw new Error("DXF 또는 SVG 파일만 가져올 수 있습니다.");
}
