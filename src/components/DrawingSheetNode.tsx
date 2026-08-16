import type { Node, NodeProps } from "@xyflow/react";

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
}

export type DrawingSheetFlowNode = Node<DrawingSheetData, "drawing-sheet">;

export function drawingSheetDimensions(paper: DrawingSheetData["paper"], scalePercent: number) {
  const paperRatio = paper === "A4" ? Math.SQRT1_2 : 1;
  const scale = Math.min(200, Math.max(50, scalePercent)) / 100;
  return { width: 1120 * paperRatio * scale, height: 760 * paperRatio * scale };
}

const short = (value: string, length: number) => value.length > length ? `${value.slice(0, length - 1)}…` : value;

export function DrawingSheetNode({ data }: NodeProps<DrawingSheetFlowNode>) {
  const size = drawingSheetDimensions(data.paper, data.scalePercent);
  const columns = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const rows = ["1", "2", "3", "4", "5"];
  return <div className="drawing-sheet-node" style={size}>
    <svg viewBox="0 0 1120 760" preserveAspectRatio="none" role="img" aria-label={`${data.paper} 도면 템플릿`}>
      <defs><pattern id="drawing-sheet-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" /></pattern></defs>
      <rect className="drawing-sheet-node__paper" width="1120" height="760" />
      <rect className="drawing-sheet-node__grid" x="20" y="20" width="1080" height="720" />
      <rect className="drawing-sheet-node__border" x="20" y="20" width="1080" height="720" />
      {columns.map((column, index) => <g key={column}><line x1={20 + index * 135} y1="20" x2={20 + index * 135} y2="29" /><line x1={20 + index * 135} y1="731" x2={20 + index * 135} y2="740" /><text x={87.5 + index * 135} y="17" textAnchor="middle">{column}</text><text x={87.5 + index * 135} y="754" textAnchor="middle">{column}</text></g>)}
      {rows.map((row, index) => <g key={row}><line x1="20" y1={20 + index * 144} x2="29" y2={20 + index * 144} /><line x1="1091" y1={20 + index * 144} x2="1100" y2={20 + index * 144} /><text x="11" y={96 + index * 144} textAnchor="middle">{row}</text><text x="1109" y={96 + index * 144} textAnchor="middle">{row}</text></g>)}
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
