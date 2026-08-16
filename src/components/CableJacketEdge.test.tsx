import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@xyflow/react", () => ({
  BaseEdge: () => <path data-testid="base-edge" />,
  EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  getSmoothStepPath: () => ["M 0 0 L 100 0", 50, 0],
  Position: { Left: "left", Right: "right" },
  useReactFlow: () => ({ screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x, y }) }),
}));

import { CableJacketEdge } from "./CableJacketEdge";

describe("CableJacketEdge", () => {
  it("케이블 라벨 우클릭을 해당 케이블 컨텍스트 메뉴로 전달한다", () => {
    const onSelect = vi.fn();
    const onContextMenu = vi.fn();
    const props = {
      id: "cable-1",
      sourceX: 0,
      sourceY: 0,
      targetX: 100,
      targetY: 0,
      label: "CBL-001 · 8723 · 300 mm",
      data: {
        entityType: "segment",
        breakoutDisplayLength: 20,
        route: { offsetX: 0, offsetY: 0 },
        gridSnap: false,
        gridSize: 10,
        onSelect,
        onContextMenu,
        onRoutePreview: vi.fn(),
        onRouteCommit: vi.fn(),
        onRouteCancel: vi.fn(),
      },
    } as unknown as Parameters<typeof CableJacketEdge>[0];
    render(<CableJacketEdge {...props} />);

    fireEvent.contextMenu(screen.getByText("CBL-001 · 8723 · 300 mm"), { clientX: 120, clientY: 80 });

    expect(onSelect).toHaveBeenCalledWith("cable-1");
    expect(onContextMenu).toHaveBeenCalledWith("cable-1", 120, 80);
  });
});
