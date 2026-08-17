export const libraryCardBatchSize = 8;

export function nextLibraryLoadCount(
  current: number,
  total: number,
  batchSize = libraryCardBatchSize,
) {
  return Math.min(total, current + batchSize);
}

export function libraryLoadPercent(completed: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((Math.min(completed, total) / total) * 100);
}
