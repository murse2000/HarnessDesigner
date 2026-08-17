import type { BomRow, DrawingTableKind, HarnessAssembly, Point, ProjectDocument } from "../domain/types";
import { buildHarnessDrawingSummary } from "../domain/drawingSummary";
import { buildFormboardLayout } from "../domain/formboard";
import type { DrawingTemplate } from "../preferences";

const esc = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function safeImageDataUrl(value?: string): string | undefined {
  return value && /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(value) ? value.replaceAll("\n", "").replaceAll("\r", "") : undefined;
}

function svgDrawingAnnotation(annotation: NonNullable<HarnessAssembly["drawingAnnotations"]>[number]): string {
  const { x, y } = annotation.position;
  if (annotation.kind === "image") {
    const imageDataUrl = safeImageDataUrl(annotation.imageDataUrl);
    const cx = x + annotation.width / 2; const cy = y + annotation.height / 2;
    const transform = annotation.flippedX || annotation.flippedY ? ` transform="translate(${cx} ${cy}) scale(${annotation.flippedX ? -1 : 1} ${annotation.flippedY ? -1 : 1}) translate(${-cx} ${-cy})"` : "";
    return imageDataUrl ? `<g><rect x="${x}" y="${y}" width="${annotation.width}" height="${annotation.height}" class="annotation-box"/><image href="${imageDataUrl}" x="${x + 3}" y="${y + 3}" width="${Math.max(1, annotation.width - 6)}" height="${Math.max(1, annotation.height - 6)}" preserveAspectRatio="xMidYMid meet"${transform}/></g>` : "";
  }
  if (annotation.kind === "label") return `<g><rect x="${x}" y="${y}" width="${annotation.width}" height="${annotation.height}" rx="${annotation.height / 2}" class="annotation-label-box"/><text x="${x + annotation.width / 2}" y="${y + annotation.height / 2 + 4}" text-anchor="middle" class="annotation-label">${esc(annotation.text)}</text></g>`;
  if (annotation.kind === "rectangle") return `<rect x="${x}" y="${y}" width="${annotation.width}" height="${annotation.height}" fill="${annotation.fillColor ?? "#fff"}" stroke="${annotation.strokeColor ?? "#1f668f"}" stroke-width="2"/>`;
  if (annotation.kind === "ellipse") return `<ellipse cx="${x + annotation.width / 2}" cy="${y + annotation.height / 2}" rx="${annotation.width / 2}" ry="${annotation.height / 2}" fill="${annotation.fillColor ?? "#fff"}" stroke="${annotation.strokeColor ?? "#1f668f"}" stroke-width="2"/>`;
  if (annotation.kind === "arrow") return `<g stroke="${annotation.strokeColor ?? "#1f668f"}" fill="${annotation.strokeColor ?? "#1f668f"}"><line x1="${x}" y1="${y + annotation.height / 2}" x2="${x + annotation.width - 14}" y2="${y + annotation.height / 2}" stroke-width="2"/><path d="M ${x + annotation.width - 14} ${y + annotation.height / 2 - 8} L ${x + annotation.width} ${y + annotation.height / 2} L ${x + annotation.width - 14} ${y + annotation.height / 2 + 8} Z"/></g>`;
  const lines = annotation.text.split(/\r?\n/).slice(0, Math.max(1, Math.floor((annotation.height - 16) / 14)));
  const text = lines.map((line, index) => `<tspan x="${x + 10}" dy="${index === 0 ? 0 : 14}">${esc(line)}</tspan>`).join("");
  return `<g><rect x="${x}" y="${y}" width="${annotation.width}" height="${annotation.height}" class="annotation-box"/><text x="${x + 10}" y="${y + 18}" class="annotation-text">${text}</text></g>`;
}

const exportTableDefaults: Record<DrawingTableKind, Point> = {
  notes: { x: 34, y: 400 },
  materials: { x: 344, y: 400 },
  lengths: { x: 714, y: 400 },
};

function exportTablePosition(harness: HarnessAssembly, kind: DrawingTableKind): Point {
  const base = exportTableDefaults[kind];
  const offset = harness.drawingTableOffsets?.[kind];
  return { x: base.x + (offset?.x ?? 0), y: base.y + (offset?.y ?? 0) };
}

function svgSummaryTable(title: string, x: number, y: number, width: number, headers: string[], rows: string[][], columns: number[]): string {
  const visibleRows = rows.slice(0, 5);
  const rowHeight = 14;
  const headerHeight = 34;
  const height = headerHeight + Math.max(1, visibleRows.length) * rowHeight;
  const headerText = headers.map((value, index) => `<text x="${columns[index] + 5}" y="29" class="table-head">${esc(value)}</text>`).join("");
  const verticals = columns.slice(1).map((value) => `<line x1="${value}" y1="18" x2="${value}" y2="${height}" class="table-line"/>`).join("");
  const rowSvg = (visibleRows.length ? visibleRows : [["-", "NONE"]]).map((row, rowIndex) => {
    const rowY = headerHeight + rowIndex * rowHeight;
    return `<line x1="0" y1="${rowY}" x2="${width}" y2="${rowY}" class="table-line"/>${row.map((value, columnIndex) => `<text x="${columns[columnIndex] + 5}" y="${rowY + 11}" class="table">${esc(value)}</text>`).join("")}`;
  }).join("");
  return `<g transform="translate(${x} ${y})"><rect width="${width}" height="${height}" class="table-box"/><text x="6" y="13" class="table-title">${esc(title)}</text><line x1="0" y1="18" x2="${width}" y2="18" class="table-line"/>${headerText}${verticals}${rowSvg}</g>`;
}

export function buildHarnessSvg(project: ProjectDocument, harness: HarnessAssembly, _template?: DrawingTemplate): string {
  const width = 1120;
  const height = 760;
  const nodes = new Map(harness.nodes.map((node) => [node.id, node]));
  const parts = new Map(project.parts.map((part) => [part.id, part]));
  const summary = buildHarnessDrawingSummary(project, harness);
  const releaseStatus = harness.releaseStatus === "released" ? "RELEASED" : harness.releaseStatus === "inReview" ? "IN REVIEW" : "DRAFT";
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
  const annotationSvg = [...(harness.drawingAnnotations ?? [])].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)).map(svgDrawingAnnotation).join("");
  const lengthById = new Map(summary.lengths.map((row) => [row.id, row.lengthMm]));
  const pinRows = harness.conductors.slice(0, 5).map((wire, index) => {
    const y = 548 + index * 18;
    const fromNode = nodes.get(wire.from.nodeId);
    const toNode = nodes.get(wire.to.nodeId);
    const fromPin = fromNode?.pins.find((pin) => pin.id === wire.from.pinId)?.number ?? "-";
    const toPin = toNode?.pins.find((pin) => pin.id === wire.to.pinId)?.number ?? "-";
    const startTerminal = parts.get(wire.startTermination.terminalPartId ?? "")?.partNumber ?? "UNASSIGNED";
    const endTerminal = parts.get(wire.endTermination.terminalPartId ?? "")?.partNumber ?? "UNASSIGNED";
    return `<text x="42" y="${y}" class="table">${esc(wire.reference)}</text><text x="115" y="${y}" class="table">${esc(`${fromNode?.reference ?? "?"}:${fromPin}`)}</text><text x="195" y="${y}" class="table">${esc(`${toNode?.reference ?? "?"}:${toPin}`)}</text><text x="275" y="${y}" class="table">${esc(wire.color)}</text><text x="320" y="${y}" class="table">${esc(wire.gauge)}</text><text x="405" y="${y}" class="table">${lengthById.get(wire.id) ?? "-"} mm</text><text x="485" y="${y}" class="table">${esc(`${startTerminal} / ${endTerminal}`)}</text>`;
  }).join("");
  const notesPosition = exportTablePosition(harness, "notes");
  const materialPosition = exportTablePosition(harness, "materials");
  const lengthPosition = exportTablePosition(harness, "lengths");
  const notesTable = svgSummaryTable("NOTES", notesPosition.x, notesPosition.y, 300, ["NO.", "NOTE"], (summary.notes.length ? summary.notes : ["NO NOTES"]).map((note, index) => [String(index + 1), note]), [0, 34]);
  const materialTable = svgSummaryTable("MANUFACTURING SUMMARY", materialPosition.x, materialPosition.y, 360, ["TYPE", "PART NO.", "QTY", "STATUS"], summary.materials.map((row) => [row.type, row.partNumber, `${row.quantity} ${row.unit}`, row.present ? "YES" : "NO"]), [0, 105, 235, 285]);
  const lengthTable = svgSummaryTable("CUT LENGTH", lengthPosition.x, lengthPosition.y, 366, ["REF", "PART NO.", "FROM-TO", "LENGTH"], summary.lengths.map((row) => [row.reference, row.partNumber, `${row.from}-${row.to}`, `${row.lengthMm} mm`]), [0, 65, 175, 280]);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>text{font-family:'Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo',sans-serif;fill:#18334c}.title{font-size:19px;font-weight:700}.subtitle{font-size:11px}.ref{font-size:12px;font-weight:700}.label{font-size:10px;font-weight:600}.meta{font-size:8px}.dim{font-size:10px;font-weight:600;paint-order:stroke;stroke:#fff;stroke-width:3px}.table{font-size:8px}.table-head{font-size:7px;font-weight:700}.table-title{font-size:9px;font-weight:700}.table-box{fill:#f8fafc;stroke:#6f879b}.table-line{stroke:#a8bac9;stroke-width:.7}.annotation-box{fill:#fff;stroke:#6f879b}.annotation-label-box{fill:#dce8f2;stroke:#1f668f}.annotation-label{font-size:11px;font-weight:700;fill:#124f74}.annotation-text{font-size:10px}.watermark{font-size:72px;font-weight:700;fill:#d46a6a;opacity:.09}</style><rect width="100%" height="100%" fill="#fff"/><rect x="20" y="20" width="1080" height="720" fill="none" stroke="#172d42" stroke-width="2"/>${releaseStatus === "RELEASED" ? "" : `<text x="560" y="380" text-anchor="middle" class="watermark">${releaseStatus}</text>`}<text x="42" y="53" class="title">${esc(project.projectNumber)} · ${esc(harness.number)} ${esc(harness.name)}</text><text x="42" y="72" class="subtitle">REV ${esc(harness.revision)} · ${releaseStatus} · ${esc(project.name)} · A3 LANDSCAPE · mm</text><line x1="40" y1="90" x2="1080" y2="90" stroke="#a8bac9"/>${segmentSvg}${nodeSvg}${annotationSvg}${notesTable}${materialTable}${lengthTable}<g><rect x="34" y="516" width="740" height="${Math.max(48, harness.conductors.slice(0, 5).length * 18 + 36)}" fill="#f8fafc" stroke="#6f879b"/><text x="42" y="536" class="ref">WIRE</text><text x="115" y="536" class="ref">FROM</text><text x="195" y="536" class="ref">TO</text><text x="275" y="536" class="ref">COLOR</text><text x="320" y="536" class="ref">GAUGE</text><text x="405" y="536" class="ref">LENGTH</text><text x="485" y="536" class="ref">TERMINAL (FROM / TO)</text>${pinRows}</g><g transform="translate(820 665)"><rect width="260" height="60" fill="#fff" stroke="#172d42"/><text x="10" y="20" class="ref">HARNESS DESIGNER</text><text x="10" y="38" class="subtitle">${esc(project.projectNumber)} / ${esc(harness.number)}</text><text x="200" y="38" class="ref">REV ${esc(harness.revision)}</text></g></svg>`;
}

export function buildHarnessDxf(project: ProjectDocument, harness: HarnessAssembly): string {
  const nodes = new Map(harness.nodes.map((node) => [node.id, node]));
  const summary = buildHarnessDrawingSummary(project, harness);
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
  for (const annotation of [...(harness.drawingAnnotations ?? [])].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))) {
    if (annotation.kind === "image") {
      pairs.push(0, "LWPOLYLINE", 8, "IMAGE_ATTACHMENTS", 90, 4, 70, 1, 10, annotation.position.x, 20, -annotation.position.y, 10, annotation.position.x + annotation.width, 20, -annotation.position.y, 10, annotation.position.x + annotation.width, 20, -annotation.position.y - annotation.height, 10, annotation.position.x, 20, -annotation.position.y - annotation.height);
      pairs.push(0, "TEXT", 8, "IMAGE_ATTACHMENTS", 10, annotation.position.x + 4, 20, -annotation.position.y - 12, 40, 6, 1, `IMAGE: ${annotation.text}`);
    } else if (annotation.kind === "rectangle") {
      pairs.push(0, "LWPOLYLINE", 8, "SHAPES", 90, 4, 70, 1, 10, annotation.position.x, 20, -annotation.position.y, 10, annotation.position.x + annotation.width, 20, -annotation.position.y, 10, annotation.position.x + annotation.width, 20, -annotation.position.y - annotation.height, 10, annotation.position.x, 20, -annotation.position.y - annotation.height);
    } else if (annotation.kind === "ellipse") {
      const horizontal = annotation.width >= annotation.height;
      pairs.push(0, "ELLIPSE", 8, "SHAPES", 10, annotation.position.x + annotation.width / 2, 20, -annotation.position.y - annotation.height / 2, 30, 0, 11, horizontal ? annotation.width / 2 : 0, 21, horizontal ? 0 : annotation.height / 2, 31, 0, 40, horizontal ? annotation.height / annotation.width : annotation.width / annotation.height, 41, 0, 42, Math.PI * 2);
    } else if (annotation.kind === "arrow") {
      const midY = -annotation.position.y - annotation.height / 2;
      pairs.push(0, "LINE", 8, "SHAPES", 10, annotation.position.x, 20, midY, 30, 0, 11, annotation.position.x + annotation.width, 21, midY, 31, 0);
    } else {
      pairs.push(0, "TEXT", 8, annotation.kind === "label" ? "LABELS" : "NOTES", 10, annotation.position.x, 20, -annotation.position.y, 40, annotation.kind === "label" ? 10 : 7, 1, annotation.text.replaceAll("\n", " | "));
    }
  }
  const notesPosition = exportTablePosition(harness, "notes");
  const materialPosition = exportTablePosition(harness, "materials");
  const lengthPosition = exportTablePosition(harness, "lengths");
  pairs.push(0, "TEXT", 8, "NOTES", 10, notesPosition.x, 20, -notesPosition.y, 40, 7, 1, "NOTES");
  (summary.notes.length ? summary.notes : ["NO NOTES"]).slice(0, 5).forEach((note, index) => {
    pairs.push(0, "TEXT", 8, "NOTES", 10, notesPosition.x, 20, -notesPosition.y - 12 - index * 10, 40, 5, 1, `${index + 1}. ${note}`);
  });
  pairs.push(0, "TEXT", 8, "TABLES", 10, materialPosition.x, 20, -materialPosition.y, 40, 7, 1, "MANUFACTURING SUMMARY");
  summary.materials.slice(0, 5).forEach((row, index) => {
    pairs.push(0, "TEXT", 8, "TABLES", 10, materialPosition.x, 20, -materialPosition.y - 12 - index * 10, 40, 5, 1, `${row.type} | ${row.partNumber} | ${row.quantity} ${row.unit} | ${row.present ? "YES" : "NO"}`);
  });
  pairs.push(0, "TEXT", 8, "TABLES", 10, lengthPosition.x, 20, -lengthPosition.y, 40, 7, 1, "CUT LENGTH");
  summary.lengths.slice(0, 5).forEach((row, index) => {
    pairs.push(0, "TEXT", 8, "TABLES", 10, lengthPosition.x, 20, -lengthPosition.y - 12 - index * 10, 40, 5, 1, `${row.reference} | ${row.partNumber} | ${row.from}-${row.to} | ${row.lengthMm} mm`);
  });
  pairs.push(0, "TEXT", 8, "TITLE", 10, 20, 20, 20, 40, 12, 1, `${project.projectNumber} ${harness.number} REV ${harness.revision} ${(harness.releaseStatus ?? "draft").toUpperCase()}`, 0, "ENDSEC", 0, "EOF");
  return pairs.join("\r\n") + "\r\n";
}

export function buildFormboardDxf(project: ProjectDocument, harness: HarnessAssembly): string {
  const layout = buildFormboardLayout(harness);
  const pairs: Array<string | number> = [0, "SECTION", 2, "HEADER", 9, "$ACADVER", 1, "AC1032", 9, "$INSUNITS", 70, 4, 0, "ENDSEC", 0, "SECTION", 2, "ENTITIES"];
  for (const segment of harness.segments) {
    const from = layout.nodes[segment.fromNodeId];
    const to = layout.nodes[segment.toNodeId];
    if (!from || !to) continue;
    pairs.push(0, "LINE", 8, "FORMBOARD_1TO1", 10, from.x, 20, -from.y, 30, 0, 11, to.x, 21, -to.y, 31, 0);
    pairs.push(0, "TEXT", 8, "DIMENSIONS", 10, (from.x + to.x) / 2, 20, -(from.y + to.y) / 2 + 8, 40, 4, 1, `${segment.label} ${segment.lengthMm} mm`);
  }
  for (const node of harness.nodes) {
    const point = layout.nodes[node.id];
    if (!point) continue;
    pairs.push(0, "CIRCLE", 8, "FIXTURES", 10, point.x, 20, -point.y, 30, 0, 40, 5);
    pairs.push(0, "TEXT", 8, "LABELS", 10, point.x + 7, 20, -point.y, 40, 4, 1, `${node.reference} ${node.label}`);
  }
  pairs.push(0, "LINE", 8, "CALIBRATION", 10, layout.bounds.minX, 20, -layout.bounds.minY + 35, 30, 0, 11, layout.bounds.minX + 100, 21, -layout.bounds.minY + 35, 31, 0);
  pairs.push(0, "TEXT", 8, "CALIBRATION", 10, layout.bounds.minX, 20, -layout.bounds.minY + 42, 40, 4, 1, "CALIBRATION 100 mm");
  pairs.push(0, "TEXT", 8, "TITLE", 10, layout.bounds.minX, 20, -layout.bounds.minY + 20, 40, 6, 1, `${project.projectNumber} ${harness.number} REV ${harness.revision} FORMBOARD SCALE 1:1`, 0, "ENDSEC", 0, "EOF");
  return pairs.join("\r\n") + "\r\n";
}

export function buildFormboardSvgPages(project: ProjectDocument, harness: HarnessAssembly, paper: "A3" | "A4", options: { overlapMm?: number; calibrationLengthMm?: number; connectorTables?: boolean } = {}): string[] {
  const layout = buildFormboardLayout(harness);
  const [paperWidth, paperHeight] = paper === "A4" ? [297, 210] : [420, 297];
  const margin = 10;
  const titleHeight = 28;
  const contentWidth = paperWidth - margin * 2;
  const contentHeight = paperHeight - margin * 2 - titleHeight;
  const overlap = Math.min(50, Math.max(0, options.overlapMm ?? 10));
  const calibrationLength = Math.min(200, Math.max(10, options.calibrationLengthMm ?? 100));
  const designWidth = Math.max(1, layout.bounds.maxX - layout.bounds.minX + 40);
  const designHeight = Math.max(1, layout.bounds.maxY - layout.bounds.minY + 40);
  const columns = Math.max(1, Math.ceil(Math.max(0, designWidth - overlap) / (contentWidth - overlap)));
  const rows = Math.max(1, Math.ceil(Math.max(0, designHeight - overlap) / (contentHeight - overlap)));
  const partMap = new Map(project.parts.map((part) => [part.id, part]));
  const connectorTable = options.connectorTables === false ? "" : `<g transform="translate(${paperWidth - margin - 96} ${margin + 3})"><rect width="92" height="${8 + Math.min(6, harness.nodes.length) * 6}" fill="white" fill-opacity=".92" stroke="#73899b" stroke-width=".4"/><text x="3" y="5" class="table-head">CONNECTOR / PART / PINS</text>${harness.nodes.slice(0, 6).map((node, index) => `<text x="3" y="${11 + index * 6}" class="table-row">${esc(node.reference)} · ${esc(partMap.get(node.partId ?? "")?.partNumber ?? "-")} · ${node.pins.length}P</text>`).join("")}</g>`;
  const geometry = [
    ...harness.segments.map((segment) => {
      const from = layout.nodes[segment.fromNodeId];
      const to = layout.nodes[segment.toNodeId];
      if (!from || !to) return "";
      const x1 = from.x - layout.bounds.minX + 20;
      const y1 = from.y - layout.bounds.minY + 20;
      const x2 = to.x - layout.bounds.minX + 20;
      const y2 = to.y - layout.bounds.minY + 20;
      return `<g><path d="M ${x1} ${y1} L ${x2} ${y2}" class="bundle"/><text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 5}" class="dimension" text-anchor="middle">${esc(segment.label)} · ${segment.lengthMm} mm</text></g>`;
    }),
    ...harness.nodes.map((node) => {
      const point = layout.nodes[node.id];
      if (!point) return "";
      const x = point.x - layout.bounds.minX + 20;
      const y = point.y - layout.bounds.minY + 20;
      return `<g transform="translate(${x} ${y})"><circle r="5" class="fixture"/><rect x="-12" y="-7" width="24" height="14" rx="2" class="connector"/><text y="-10" text-anchor="middle" class="node-ref">${esc(node.reference)}</text><text y="12" text-anchor="middle" class="node-label">${esc(node.label)}</text></g>`;
    }),
  ].join("");
  return Array.from({ length: columns * rows }, (_, pageIndex) => {
    const column = pageIndex % columns;
    const row = Math.floor(pageIndex / columns);
    const tileX = column * (contentWidth - overlap);
    const tileY = row * (contentHeight - overlap);
    const status = harness.releaseStatus === "released" ? "RELEASED" : harness.releaseStatus === "inReview" ? "IN REVIEW" : "DRAFT";
    const cropMarks = `<path d="M ${margin - 3} ${margin} h 6 M ${margin} ${margin - 3} v 6 M ${margin + contentWidth - 3} ${margin} h 6 M ${margin + contentWidth} ${margin - 3} v 6 M ${margin - 3} ${margin + contentHeight} h 6 M ${margin} ${margin + contentHeight - 3} v 6 M ${margin + contentWidth - 3} ${margin + contentHeight} h 6 M ${margin + contentWidth} ${margin + contentHeight - 3} v 6" fill="none" stroke="#172d42" stroke-width=".35"/>`;
    const calibration = `<g transform="translate(${margin + 4} ${paperHeight - margin - titleHeight - 8})"><path d="M 0 0 H ${calibrationLength} M 0 -2 V 2 M ${calibrationLength} -2 V 2" fill="none" stroke="#172d42" stroke-width=".5"/><text x="${calibrationLength / 2}" y="-3" class="meta" text-anchor="middle">CALIBRATION ${calibrationLength} mm</text></g>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${paperWidth}mm" height="${paperHeight}mm" viewBox="0 0 ${paperWidth} ${paperHeight}"><style>text{font-family:'Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo',sans-serif;fill:#18334c}.bundle{stroke:#203c58;stroke-width:4;fill:none;stroke-linecap:round}.fixture{fill:#f5a623;stroke:#8b5a00;stroke-width:.6}.connector{fill:#fff;stroke:#1f4668;stroke-width:.8}.dimension{font-size:3.5px;font-weight:700;paint-order:stroke;stroke:white;stroke-width:1.6px}.node-ref{font-size:3.8px;font-weight:700}.node-label{font-size:3px}.title{font-size:4.2px;font-weight:700}.meta{font-size:3px}.table-head{font-size:2.7px;font-weight:700}.table-row{font-size:2.6px}</style><defs><clipPath id="formboard-page-${pageIndex}"><rect x="${margin}" y="${margin}" width="${contentWidth}" height="${contentHeight}"/></clipPath></defs><rect width="100%" height="100%" fill="white"/><rect x="5" y="5" width="${paperWidth - 10}" height="${paperHeight - 10}" fill="none" stroke="#172d42" stroke-width=".6"/>${cropMarks}<g clip-path="url(#formboard-page-${pageIndex})" transform="translate(${margin - tileX} ${margin - tileY})">${geometry}</g>${connectorTable}${calibration}<g transform="translate(${margin} ${paperHeight - margin - titleHeight + 2})"><rect width="${contentWidth}" height="${titleHeight - 2}" fill="white" stroke="#172d42" stroke-width=".5"/><text x="4" y="7" class="title">${esc(project.projectNumber)} · ${esc(harness.number)} · ${esc(harness.name)}</text><text x="4" y="14" class="meta">FORMBOARD SCALE 1:1 · ${paper} LANDSCAPE · mm · ${status}</text><text x="4" y="21" class="meta">REV ${esc(harness.revision)} · PAGE ${pageIndex + 1}/${columns * rows} · TILE ${column + 1},${row + 1} · OVERLAP ${overlap} mm</text><text x="${contentWidth - 4}" y="14" text-anchor="end" class="meta">PRINT AT 100%</text></g></svg>`;
  });
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

export function buildWorkInstructionSvgPages(project: ProjectDocument): string[] {
  const rows = [...project.workInstructions].sort((a, b) => a.sequence - b.sequence);
  const pageSize = 8;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  return Array.from({ length: pages }, (_, pageIndex) => {
    const pageRows = rows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
    const body = pageRows.map((instruction, index) => {
      const y = 118 + index * 68;
      const harness = project.harnesses.find((item) => item.id === instruction.harnessId);
      const description = esc(instruction.description).replaceAll("\n", " · ").slice(0, 150);
      return `<rect x="30" y="${y}" width="1060" height="58" fill="${index % 2 ? "#f7f9fb" : "#fff"}" stroke="#b4c0ca"/><text x="45" y="${y + 22}" class="sequence">${instruction.sequence}</text><text x="95" y="${y + 18}" class="strong">${esc(harness?.number ?? "-")} · ${esc(instruction.kind.toUpperCase())} · ${esc(instruction.title)}</text><text x="95" y="${y + 40}" class="detail">${description || "-"}</text>${/^data:image\/(?:png|jpeg|webp);base64,/i.test(instruction.imageDataUrl ?? "") ? `<image href="${instruction.imageDataUrl!.replaceAll('"', "&quot;")}" x="1010" y="${y + 4}" width="70" height="50" preserveAspectRatio="xMidYMid meet"/>` : ""}`;
    }).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="760" viewBox="0 0 1120 760"><style>text{font-family:'Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo',sans-serif;fill:#18334c;font-size:11px}.title{font-size:20px;font-weight:700}.meta{font-size:10px;fill:#52687a}.strong{font-weight:700}.detail{font-size:10px}.sequence{font-size:16px;font-weight:700;fill:#166b9b}</style><rect width="1120" height="760" fill="#fff"/><rect x="20" y="20" width="1080" height="720" fill="none" stroke="#172d42" stroke-width="2"/><text x="40" y="55" class="title">${esc(project.projectNumber)} · MANUFACTURING WORK INSTRUCTIONS</text><text x="40" y="76" class="meta">${esc(project.name)} · REV ${esc(project.revision)} · PAGE ${pageIndex + 1}/${pages}</text>${body}<text x="1080" y="720" text-anchor="end" class="meta">HARNESS DESIGNER · SCHEMA v${project.schemaVersion}</text></svg>`;
  });
}
