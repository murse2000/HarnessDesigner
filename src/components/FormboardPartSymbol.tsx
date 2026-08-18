import type { SymbolAsset } from "../domain/types";

export function FormboardPartSymbol({ symbol }: { symbol: SymbolAsset }) {
  const [viewX, viewY, viewWidth, viewHeight] = symbol.viewBox.split(/\s+/).map(Number);
  if (![viewX, viewY, viewWidth, viewHeight].every(Number.isFinite) || viewWidth <= 0 || viewHeight <= 0) return null;
  const markup = symbol.svg.replace(/^\s*<svg\b[^>]*>/i, "").replace(/<\/svg>\s*$/i, "").replaceAll("currentColor", "#1f4668");
  return <svg data-formboard-symbol={symbol.sourceName} x={-viewWidth / 2} y={-viewHeight / 2} width={viewWidth} height={viewHeight} viewBox={symbol.viewBox} preserveAspectRatio="xMidYMid meet" dangerouslySetInnerHTML={{ __html: markup }} />;
}
