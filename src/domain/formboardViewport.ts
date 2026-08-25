export function formboardWheelZoom(currentZoom: number, deltaY: number, deltaMode = 0) {
  const normalizedDelta = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 100 : 1);
  return Math.max(0.25, Math.min(16, currentZoom * Math.exp(-Math.max(-100, Math.min(100, normalizedDelta)) * 0.002)));
}

export function formboardZoomScroll(currentScroll: number, cursorOffset: number, previousZoom: number, nextZoom: number) {
  return currentScroll + cursorOffset * (nextZoom / previousZoom - 1);
}
