import { drawingPathData, partDrawingStrokeWidth } from "./dxfSymbol";
import type { LibraryPart2D } from "./library";
import { preferStepShadedDrawing } from "./stepSymbol";
import { wireColorValue } from "./wireColor";

export function LibraryPartThumbnail({ part }: { part: LibraryPart2D }) {
  const drawing = part.drawing ? preferStepShadedDrawing(part.drawing) : undefined;
  return <span
    className={`hd2-part-thumbnail${drawing ? "" : " is-default"}`}
    aria-label={`${part.partNumber} ${drawing ? "부품 이미지" : "기본 부품 이미지"}`}
    title={drawing?.sourceName ?? `${part.category.toUpperCase()} 기본 이미지`}
  >
    {drawing ? <svg viewBox={`0 0 ${drawing.widthMm} ${drawing.heightMm}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {drawing.imageDataUrl && <image href={drawing.imageDataUrl} width={drawing.widthMm} height={drawing.heightMm} preserveAspectRatio="none" />}
      {drawing.paths.map((path, index) => <path key={index} d={drawingPathData(path)} style={{ strokeWidth: partDrawingStrokeWidth(drawing.outlineStrength) }} />)}
    </svg> : <DefaultPartImage part={part} />}
    {drawing && <b>2D</b>}
  </span>;
}

function DefaultPartImage({ part }: { part: LibraryPart2D }) {
  if (part.category === "wire") {
    return <svg viewBox="0 0 44 34" aria-hidden="true"><line x1="5" y1="17" x2="39" y2="17" style={{ stroke: wireColorValue(part.cores[0]?.color ?? "BK") }} /></svg>;
  }
  if (part.category === "cable") {
    return <svg viewBox="0 0 44 34" aria-hidden="true">
      <line className="hd2-default-cable-sheath" x1="5" y1="17" x2="39" y2="17" />
      {part.cores.slice(0, 4).map((core, index) => <line key={index} x1="8" y1={12 + index * 3.3} x2="36" y2={12 + index * 3.3} style={{ stroke: wireColorValue(core.color) }} />)}
    </svg>;
  }
  const pins = Math.max(1, Math.min(4, part.pins.length));
  return <svg viewBox="0 0 44 34" aria-hidden="true">
    <rect x="8" y="6" width="28" height="22" rx="2" />
    {Array.from({ length: pins }, (_, index) => <circle key={index} cx={14 + index * (16 / Math.max(1, pins - 1))} cy="17" r="2" />)}
  </svg>;
}
