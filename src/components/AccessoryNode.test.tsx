import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccessoryNode } from "./AccessoryNode";

vi.mock("@xyflow/react", () => ({
  NodeResizer: ({ onResizeEnd }: { onResizeEnd?: (event: unknown, size: { x: number; y: number; width: number; height: number }) => void }) =>
    <button data-testid="accessory-label-resizer" onClick={() => onResizeEnd?.({}, { x: 30, y: 40, width: 220, height: 70 })}>resize</button>,
}));

describe("AccessoryNode 라벨 편집", () => {
  it("선택한 라벨의 크기 조절 결과를 전달한다", () => {
    const onResize = vi.fn();
    const props = { data: { accessoryId: "label-1", partNumber: "LBL-25", category: "label", quantity: 1, note: "MAIN CABLE", externallySelected: false, onResize }, selected: true } as unknown as Parameters<typeof AccessoryNode>[0];
    render(<AccessoryNode {...props} />);

    fireEvent.click(screen.getByTestId("accessory-label-resizer"));

    expect(onResize).toHaveBeenCalledWith("label-1", { x: 30, y: 40, width: 220, height: 70 });
  });

  it("라벨이 아닌 부자재에는 크기 조절 핸들을 표시하지 않는다", () => {
    const props = { data: { accessoryId: "clip-1", partNumber: "CLIP-01", category: "clip", quantity: 1, note: "", externallySelected: false, onResize: vi.fn() }, selected: true } as unknown as Parameters<typeof AccessoryNode>[0];
    render(<AccessoryNode {...props} />);

    expect(screen.queryByTestId("accessory-label-resizer")).not.toBeInTheDocument();
  });
});
