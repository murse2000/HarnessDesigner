export function sameCanvasSelection(current: string[], next: string[]) {
  return current.length === next.length && current.every((id, index) => id === next[index]);
}

export function sameCanvasEntitySelection(
  currentId: string | null,
  currentType: string | null,
  nextId: string,
  nextType: "node" | "annotation",
) {
  return currentId === nextId && currentType === nextType;
}
