import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DrawingAnnotationNode } from "./DrawingAnnotationNode";

vi.mock("@xyflow/react", () => ({
  NodeResizer: ({ onResizeEnd }: { onResizeEnd?: (event: unknown, size: { x: number; y: number; width: number; height: number }) => void }) =>
    <button data-testid="annotation-resizer" onClick={() => onResizeEnd?.({}, { x: 12, y: 18, width: 240, height: 120 })}>resize</button>,
}));

describe("DrawingAnnotationNode 직접 편집", () => {
  it("라벨 더블클릭을 클릭 위치와 함께 전달한다", () => {
    const onEdit = vi.fn();
    const props = { data: { model: { id: "a1", kind: "label", text: "LABEL", position: { x: 0, y: 0 }, width: 140, height: 36 }, externallySelected: false, onEdit }, selected: false } as unknown as Parameters<typeof DrawingAnnotationNode>[0];
    render(<DrawingAnnotationNode {...props} />);

    fireEvent.doubleClick(screen.getByText("LABEL"), { clientX: 120, clientY: 80 });

    expect(onEdit).toHaveBeenCalledWith("a1", 120, 80);
  });

  it.each(["label", "text", "image", "rectangle", "ellipse", "arrow"] as const)("선택된 %s 객체의 크기 조절 결과를 전달한다", (kind) => {
    const onResize = vi.fn();
    const props = { data: { model: { id: `a-${kind}`, kind, text: kind, position: { x: 0, y: 0 }, width: 140, height: 36 }, externallySelected: false, onEdit: vi.fn(), onResize }, selected: true } as unknown as Parameters<typeof DrawingAnnotationNode>[0];
    const { unmount } = render(<DrawingAnnotationNode {...props} />);

    fireEvent.click(screen.getByTestId("annotation-resizer"));

    expect(onResize).toHaveBeenCalledWith(`a-${kind}`, { x: 12, y: 18, width: 240, height: 120 });
    unmount();
  });

  it("외부 패널에서 선택된 객체에도 크기 조절 핸들을 표시한다", () => {
    const props = { data: { model: { id: "a-external", kind: "text", text: "TEXT", position: { x: 0, y: 0 }, width: 140, height: 36 }, externallySelected: true, onEdit: vi.fn(), onResize: vi.fn() }, selected: false } as unknown as Parameters<typeof DrawingAnnotationNode>[0];
    render(<DrawingAnnotationNode {...props} />);
    expect(screen.getByTestId("annotation-resizer")).toBeInTheDocument();
  });
});
