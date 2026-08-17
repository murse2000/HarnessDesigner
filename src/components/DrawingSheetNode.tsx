import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Node, NodeProps } from "@xyflow/react";
import type { DrawingLengthRow, DrawingMaterialRow } from "../domain/drawingSummary";
import type { DrawingTableKind, DrawingTableOffsets, Point } from "../domain/types";

export interface DrawingSheetData extends Record<string, unknown> {
  paper: "A3" | "A4";
  scalePercent: number;
  projectNumber: string;
  projectName: string;
  harnessNumber: string;
  harnessName: string;
  revision: string;
  companyName: string;
  drawnBy: string;
  approvedBy: string;
  logoDataUrl: string;
  notes: string[];
  materials: DrawingMaterialRow[];
  lengths: DrawingLengthRow[];
  tableOffsets: DrawingTableOffsets;
  locked: boolean;
  onTableOffsetCommit: (kind: DrawingTableKind, offset: Point) => void;
}

export type DrawingSheetFlowNode = Node<DrawingSheetData, "drawing-sheet">;

export function drawingSheetDimensions(paper: DrawingSheetData["paper"], scalePercent: number) {
  const paperRatio = paper === "A4" ? Math.SQRT1_2 : 1;
  const scale = Math.min(200, Math.max(50, scalePercent)) / 100;
  return { width: 1120 * paperRatio * scale, height: 760 * paperRatio * scale };
}

const drawingTableDefaults: Record<DrawingTableKind, Point> = {
  notes: { x: 34, y: 500 },
  materials: { x: 344, y: 500 },
  lengths: { x: 714, y: 500 },
};

export function drawingTablePosition(kind: DrawingTableKind, offsets: DrawingTableOffsets): Point {
  const base = drawingTableDefaults[kind];
  const offset = offsets[kind];
  return { x: base.x + (offset?.x ?? 0), y: base.y + (offset?.y ?? 0) };
}

const short = (value: string, length: number) => value.length > length ? `${value.slice(0, length - 1)}…` : value;

function SheetTable({ title, kind, position, width, headers, rows, columns, locked, onPointerDown, onPointerMove, onPointerUp }: { title: string; kind: DrawingTableKind; position: Point; width: number; headers: string[]; rows: string[][]; columns: number[]; locked: boolean; onPointerDown: (kind: DrawingTableKind, event: ReactPointerEvent<SVGGElement>, width: number, height: number) => void; onPointerMove: (event: ReactPointerEvent<SVGGElement>) => void; onPointerUp: (event: ReactPointerEvent<SVGGElement>) => void }) {
  const visibleRows = rows.slice(0, 5);
  const height = 34 + Math.max(1, visibleRows.length) * 14;
  return <g className={`drawing-sheet-node__table nodrag nopan ${locked ? "is-locked" : ""}`} transform={`translate(${position.x} ${position.y})`} onPointerDown={(event) => onPointerDown(kind, event, width, height)} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
    <rect width={width} height={height} /><text className="title" x="6" y="13">{title}</text><line x1="0" y1="18" x2={width} y2="18" />
    {headers.map((header, index) => <text className="head" key={header} x={columns[index] + 5} y="29">{header}</text>)}
    {columns.slice(1).map((column) => <line key={column} x1={column} y1="18" x2={column} y2={height} />)}
    {(visibleRows.length ? visibleRows : [["-", "NONE"]]).map((row, rowIndex) => <g key={`${title}-${rowIndex}`}><line x1="0" y1={34 + rowIndex * 14} x2={width} y2={34 + rowIndex * 14} />{row.map((value, columnIndex) => <text key={`${columnIndex}-${value}`} x={columns[columnIndex] + 5} y={45 + rowIndex * 14}>{short(value, 24)}</text>)}</g>)}
  </g>;
}

export function DrawingSheetNode({ data }: NodeProps<DrawingSheetFlowNode>) {
  const size = drawingSheetDimensions(data.paper, data.scalePercent);
  const columns = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const rows = ["1", "2", "3", "4", "5"];
  const [tablePositions, setTablePositions] = useState<Record<DrawingTableKind, Point>>(() => ({
    notes: drawingTablePosition("notes", data.tableOffsets),
    materials: drawingTablePosition("materials", data.tableOffsets),
    lengths: drawingTablePosition("lengths", data.tableOffsets),
  }));
  const drag = useRef<{ kind: DrawingTableKind; pointerId: number; startPointer: Point; startPosition: Point; position: Point; width: number; height: number } | null>(null);
  useEffect(() => setTablePositions({
    notes: drawingTablePosition("notes", data.tableOffsets),
    materials: drawingTablePosition("materials", data.tableOffsets),
    lengths: drawingTablePosition("lengths", data.tableOffsets),
  }), [data.tableOffsets]);
  const pointerInSheet = (event: ReactPointerEvent<SVGGElement>): Point | null => {
    const svg = event.currentTarget.ownerSVGElement;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(matrix.inverse());
  };
  const startTableDrag = (kind: DrawingTableKind, event: ReactPointerEvent<SVGGElement>, width: number, height: number) => {
    if (data.locked) return;
    const pointer = pointerInSheet(event);
    if (!pointer) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { kind, pointerId: event.pointerId, startPointer: pointer, startPosition: tablePositions[kind], position: tablePositions[kind], width, height };
  };
  const moveTable = (event: ReactPointerEvent<SVGGElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    const pointer = pointerInSheet(event);
    if (!pointer) return;
    event.stopPropagation();
    const current = drag.current;
    const next = {
      x: Math.max(20, Math.min(1100 - current.width, current.startPosition.x + pointer.x - current.startPointer.x)),
      y: Math.max(20, Math.min(740 - current.height, current.startPosition.y + pointer.y - current.startPointer.y)),
    };
    current.position = next;
    setTablePositions((positions) => ({ ...positions, [current.kind]: next }));
  };
  const finishTableDrag = (event: ReactPointerEvent<SVGGElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const current = drag.current;
    event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null;
    const position = current.position;
    const base = drawingTableDefaults[current.kind];
    data.onTableOffsetCommit(current.kind, { x: Math.round(position.x - base.x), y: Math.round(position.y - base.y) });
  };
  return <div className="drawing-sheet-node" style={size}>
    <svg viewBox="0 0 1120 760" preserveAspectRatio="none" role="img" aria-label={`${data.paper} 도면 템플릿`}>
      <defs><pattern id="drawing-sheet-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" /></pattern></defs>
      <rect className="drawing-sheet-node__paper" width="1120" height="760" />
      <rect className="drawing-sheet-node__grid" x="20" y="20" width="1080" height="720" />
      <rect className="drawing-sheet-node__border" x="20" y="20" width="1080" height="720" />
      {columns.map((column, index) => <g key={column}><line x1={20 + index * 135} y1="20" x2={20 + index * 135} y2="29" /><line x1={20 + index * 135} y1="731" x2={20 + index * 135} y2="740" /><text x={87.5 + index * 135} y="17" textAnchor="middle">{column}</text><text x={87.5 + index * 135} y="754" textAnchor="middle">{column}</text></g>)}
      {rows.map((row, index) => <g key={row}><line x1="20" y1={20 + index * 144} x2="29" y2={20 + index * 144} /><line x1="1091" y1={20 + index * 144} x2="1100" y2={20 + index * 144} /><text x="11" y={96 + index * 144} textAnchor="middle">{row}</text><text x="1109" y={96 + index * 144} textAnchor="middle">{row}</text></g>)}
      <SheetTable title="NOTES" kind="notes" position={tablePositions.notes} width={300} headers={["NO.", "NOTE"]} rows={(data.notes.length ? data.notes : ["NO NOTES"]).map((note, index) => [String(index + 1), note])} columns={[0, 34]} locked={data.locked} onPointerDown={startTableDrag} onPointerMove={moveTable} onPointerUp={finishTableDrag} />
      <SheetTable title="MANUFACTURING SUMMARY" kind="materials" position={tablePositions.materials} width={360} headers={["TYPE", "PART NO.", "QTY", "STATUS"]} rows={data.materials.map((row) => [row.type, row.partNumber, `${row.quantity} ${row.unit}`, row.present ? "YES" : "NO"])} columns={[0, 105, 235, 285]} locked={data.locked} onPointerDown={startTableDrag} onPointerMove={moveTable} onPointerUp={finishTableDrag} />
      <SheetTable title="CUT LENGTH" kind="lengths" position={tablePositions.lengths} width={366} headers={["REF", "PART NO.", "FROM-TO", "LENGTH"]} rows={data.lengths.map((row) => [row.reference, row.partNumber, `${row.from}-${row.to}`, `${row.lengthMm} mm`])} columns={[0, 65, 175, 280]} locked={data.locked} onPointerDown={startTableDrag} onPointerMove={moveTable} onPointerUp={finishTableDrag} />
      <g className="drawing-sheet-node__title" transform="translate(650 650)">
        <rect width="450" height="90" />
        <line x1="0" y1="32" x2="450" y2="32" /><line x1="0" y1="60" x2="450" y2="60" />
        <line x1="315" y1="0" x2="315" y2="90" /><line x1="380" y1="0" x2="380" y2="90" />
        <text className="label" x="8" y="12">TITLE</text><text className="value" x="8" y="27">{short(`${data.harnessNumber} · ${data.harnessName}`, 47)}</text>
        <text className="label" x="323" y="12">SHEET</text><text className="value" x="323" y="27">1 / 1</text>
        <text className="label" x="388" y="12">REV</text><text className="revision" x="414" y="27" textAnchor="middle">{data.revision}</text>
        <text className="label" x="8" y="44">PROJECT</text><text className="value" x="8" y="57">{short(`${data.projectNumber} · ${data.projectName}`, 49)}</text>
        <text className="label" x="323" y="44">PAPER</text><text className="value" x="323" y="57">{data.paper} LANDSCAPE</text>
        <text className="label" x="8" y="73">DRAWN</text><text className="value" x="50" y="73">{short(data.drawnBy || "-", 18)}</text>
        <text className="label" x="8" y="85">APPROVED</text><text className="value" x="67" y="85">{short(data.approvedBy || "-", 15)}</text>
        <text className="company" x="220" y="79" textAnchor="middle">{short(data.companyName || "HARNESS DESIGNER", 24)}</text>
        {data.logoDataUrl.startsWith("data:image/") && <image href={data.logoDataUrl} x="386" y="64" width="58" height="21" preserveAspectRatio="xMidYMid meet" />}
      </g>
    </svg>
  </div>;
}
