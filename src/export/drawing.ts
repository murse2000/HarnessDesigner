import type { BomRow, HarnessAssembly, ProjectDocument } from "../domain/types";
import type { DrawingTemplate } from "../preferences";

const esc = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export function buildHarnessSvg(project: ProjectDocument, harness: HarnessAssembly, _template?: DrawingTemplate): string {
  const width = 1120;
  const height = 760;
  const nodes = new Map(harness.nodes.map((node) => [node.id, node]));
  const segmentSvg = harness.segments.map((segment) => {
    const from = nodes.get(segment.fromNodeId)?.position;
    const to = nodes.get(segment.toNodeId)?.position;
    if (!from || !to) return "";
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    return `<g><path d="M ${from.x} ${from.y} L ${to.x} ${to.y}" stroke="#203c58" stroke-width="12" fill="none" stroke-linecap="round"/><path d="M ${from.x} ${from.y} L ${to.x} ${to.y}" stroke="#eef3f7" stroke-width="6" fill="none" stroke-dasharray="8 5"/><text x="${midX}" y="${midY - 13}" class="dim" text-anchor="middle">${esc(segment.label)} · ${segment.lengthMm} mm</text></g>`;
  }).join("");
  const nodeSvg = harness.nodes.map((node) => {
    const connector = node.kind === "connector";
    return `<g transform="translate(${node.position.x - 52} ${node.position.y - 34})"><rect width="104" height="68" rx="${connector ? 5 : 34}" fill="#fff" stroke="#1f4668" stroke-width="2"/><rect width="104" height="20" rx="4" fill="#dce8f2"/><text x="52" y="15" text-anchor="middle" class="ref">${esc(node.reference)}</text><text x="52" y="45" text-anchor="middle" class="label">${esc(node.label)}</text><text x="52" y="59" text-anchor="middle" class="meta">${node.pins.length ? `${node.pins.length} PIN` : node.kind.toUpperCase()}</text></g>`;
  }).join("");
  const pinRows = harness.conductors.slice(0, 20).map((wire, index) => {
    const y = 548 + index * 18;
    const fromNode = nodes.get(wire.from.nodeId);
    const toNode = nodes.get(wire.to.nodeId);
    const fromPin = fromNode?.pins.find((pin) => pin.id === wire.from.pinId)?.number ?? "-";
    const toPin = toNode?.pins.find((pin) => pin.id === wire.to.pinId)?.number ?? "-";
    return `<text x="42" y="${y}" class="table">${esc(wire.reference)}</text><text x="135" y="${y}" class="table">${esc(`${fromNode?.reference ?? "?"}:${fromPin}`)}</text><text x="280" y="${y}" class="table">${esc(`${toNode?.reference ?? "?"}:${toPin}`)}</text><text x="425" y="${y}" class="table">${esc(wire.color)}</text><text x="510" y="${y}" class="table">${esc(wire.gauge)}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>text{font-family:'Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo',sans-serif;fill:#18334c}.title{font-size:19px;font-weight:700}.subtitle{font-size:11px}.ref{font-size:12px;font-weight:700}.label{font-size:10px;font-weight:600}.meta{font-size:8px}.dim{font-size:10px;font-weight:600;paint-order:stroke;stroke:#fff;stroke-width:3px}.table{font-size:10px}</style><rect width="100%" height="100%" fill="#fff"/><rect x="20" y="20" width="1080" height="720" fill="none" stroke="#172d42" stroke-width="2"/><text x="42" y="53" class="title">${esc(project.projectNumber)} · ${esc(harness.number)} ${esc(harness.name)}</text><text x="42" y="72" class="subtitle">REV ${esc(harness.revision)} · ${esc(project.name)} · A3 LANDSCAPE · mm</text><line x1="40" y1="90" x2="1080" y2="90" stroke="#a8bac9"/>${segmentSvg}${nodeSvg}<g><rect x="34" y="516" width="620" height="${Math.max(48, harness.conductors.slice(0, 20).length * 18 + 36)}" fill="#f8fafc" stroke="#6f879b"/><text x="42" y="536" class="ref">WIRE</text><text x="135" y="536" class="ref">FROM</text><text x="280" y="536" class="ref">TO</text><text x="425" y="536" class="ref">COLOR</text><text x="510" y="536" class="ref">GAUGE</text>${pinRows}</g><g transform="translate(820 665)"><rect width="260" height="60" fill="#fff" stroke="#172d42"/><text x="10" y="20" class="ref">HARNESS DESIGNER</text><text x="10" y="38" class="subtitle">${esc(project.projectNumber)} / ${esc(harness.number)}</text><text x="200" y="38" class="ref">REV ${esc(harness.revision)}</text></g></svg>`;
}

export function buildHarnessDxf(project: ProjectDocument, harness: HarnessAssembly): string {
  const nodes = new Map(harness.nodes.map((node) => [node.id, node]));
  const pairs: Array<string | number> = [0, "SECTION", 2, "HEADER", 9, "$ACADVER", 1, "AC1032", 0, "ENDSEC", 0, "SECTION", 2, "ENTITIES"];
  for (const segment of harness.segments) {
    const from = nodes.get(segment.fromNodeId)?.position;
    const to = nodes.get(segment.toNodeId)?.position;
    if (!from || !to) continue;
    pairs.push(0, "LINE", 8, "HARNESS", 10, from.x, 20, -from.y, 30, 0, 11, to.x, 21, -to.y, 31, 0);
    pairs.push(0, "TEXT", 8, "DIMENSIONS", 10, (from.x + to.x) / 2, 20, -(from.y + to.y) / 2 + 12, 40, 8, 1, `${segment.lengthMm} mm`);
  }
  for (const node of harness.nodes) {
    pairs.push(0, "LWPOLYLINE", 8, "CONNECTORS", 90, 4, 70, 1, 10, node.position.x - 50, 20, -node.position.y - 30, 10, node.position.x + 50, 20, -node.position.y - 30, 10, node.position.x + 50, 20, -node.position.y + 30, 10, node.position.x - 50, 20, -node.position.y + 30);
    pairs.push(0, "TEXT", 8, "LABELS", 10, node.position.x - 35, 20, -node.position.y, 40, 10, 1, `${node.reference} ${node.label}`);
  }
  pairs.push(0, "TEXT", 8, "TITLE", 10, 20, 20, 20, 40, 12, 1, `${project.projectNumber} ${harness.number} REV ${harness.revision}`, 0, "ENDSEC", 0, "EOF");
  return pairs.join("\r\n") + "\r\n";
}

export function svgToCanvas(svg: string, width: number, height: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) { reject(new Error("Canvas를 만들 수 없습니다.")); return; }
      context.fillStyle = "#fff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("SVG 렌더링에 실패했습니다.")); };
    image.src = url;
  });
}

export function buildBomSvgPages(project: ProjectDocument, rows: BomRow[], _template?: DrawingTemplate): string[] {
  const pageSize = 31;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  return Array.from({ length: pages }, (_, pageIndex) => {
    const pageRows = rows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
    const lines = pageRows.map((row, index) => {
      const y = 158 + index * 18;
      return `<text x="40" y="${y}">${pageIndex * pageSize + index + 1}</text><text x="75" y="${y}" class="strong">${esc(row.partNumber)}</text><text x="245" y="${y}">${esc(row.manufacturer)}</text><text x="395" y="${y}">${esc(row.description.slice(0, 42))}</text><text x="740" y="${y}">${esc(row.specification)}</text><text x="890" y="${y}" text-anchor="middle">${row.unit}</text><text x="970" y="${y}" text-anchor="end" class="strong">${row.quantity.toLocaleString(undefined, { maximumFractionDigits: 3 })}</text><text x="990" y="${y}">${esc(row.harnesses.join(", ").slice(0, 20))}</text>`;
    }).join("");
    const gridLines = Array.from({ length: pageRows.length + 2 }, (_, index) => `<line x1="30" y1="${118 + index * 18}" x2="1090" y2="${118 + index * 18}"/>`).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="760" viewBox="0 0 1120 760"><style>text{font-family:'Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo',sans-serif;fill:#18334c;font-size:10px}.title{font-size:20px;font-weight:700}.meta{font-size:10px;fill:#52687a}.head{font-size:10px;font-weight:700}.strong{font-weight:700}line{stroke:#b4c0ca;stroke-width:.6}</style><rect width="1120" height="760" fill="#fff"/><rect x="20" y="20" width="1080" height="720" fill="none" stroke="#172d42" stroke-width="2"/><text x="40" y="55" class="title">${esc(project.projectNumber)} · PROJECT BOM / 프로젝트 전체 BOM</text><text x="40" y="76" class="meta">${esc(project.name)} · REV ${esc(project.revision)} · ${rows.length} ITEMS · PAGE ${pageIndex + 1}/${pages}</text><rect x="30" y="100" width="1060" height="${36 + pageRows.length * 18}" fill="#fff" stroke="#73899b"/><rect x="30" y="100" width="1060" height="36" fill="#e8eef3"/><text x="40" y="122" class="head">NO</text><text x="75" y="122" class="head">PART NUMBER / 품번</text><text x="245" y="122" class="head">MANUFACTURER</text><text x="395" y="122" class="head">DESCRIPTION / 설명</text><text x="740" y="122" class="head">SPEC.</text><text x="890" y="122" class="head" text-anchor="middle">UNIT</text><text x="970" y="122" class="head" text-anchor="end">QTY</text><text x="990" y="122" class="head">HARNESS</text>${gridLines}${lines}<g transform="translate(790 665)"><rect width="300" height="60" fill="#fff" stroke="#172d42"/><text x="10" y="21" class="strong">HARNESS DESIGNER</text><text x="10" y="41">${esc(project.projectNumber)} / BOM</text><text x="235" y="41" class="strong">REV ${esc(project.revision)}</text></g></svg>`;
  });
}
