import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@xyflow/react", () => ({
  BaseEdge: () => <path data-testid="base-edge" />,
  useInternalNode: () => undefined,
  useReactFlow: () => ({ screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x, y }) }),
}));

import { EditableConductorEdge } from "./EditableConductorEdge";

describe("EditableConductorEdge 직접 편집", () => {
  it("전선을 더블클릭하면 편집 동작을 전달한다", () => {
    const onEdit = vi.fn();
    const props = {
      id: "wire-1", source: "j1", target: "j2", sourceX: 0, sourceY: 0, targetX: 100, targetY: 40,
      data: { entityType: "conductor", gridSnap: false, gridSize: 10, onBendCommit: vi.fn(), onSelect: vi.fn(), onEdit, onContextMenu: vi.fn() },
    } as unknown as Parameters<typeof EditableConductorEdge>[0];
    const { container } = render(<EditableConductorEdge {...props} />);

    fireEvent.click(container.querySelector(".harness-conductor-edit-zone")!, { detail: 2 });

    expect(onEdit).toHaveBeenCalledWith("wire-1");
  });

  it("잠긴 전선 레이어는 더블클릭과 굽힘 핸들을 비활성화한다", () => {
    const onEdit = vi.fn();
    const props = {
      id: "wire-1", source: "j1", target: "j2", sourceX: 0, sourceY: 0, targetX: 100, targetY: 40,
      selected: true,
      data: { entityType: "conductor", locked: true, gridSnap: false, gridSize: 10, onBendCommit: vi.fn(), onSelect: vi.fn(), onEdit, onContextMenu: vi.fn() },
    } as unknown as Parameters<typeof EditableConductorEdge>[0];
    const { container } = render(<EditableConductorEdge {...props} />);

    fireEvent.click(container.querySelector(".harness-conductor-edit-zone")!, { detail: 2 });

    expect(onEdit).not.toHaveBeenCalled();
    expect(container.querySelector(".harness-conductor-bend-grip")).toBeNull();
  });
});
