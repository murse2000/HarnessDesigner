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
        onEdit: vi.fn(),
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

  it("케이블 라벨 더블클릭을 편집 동작으로 전달한다", () => {
    const onEdit = vi.fn();
    const props = {
      id: "cable-1", sourceX: 0, sourceY: 0, targetX: 100, targetY: 0, label: "CBL-001",
      data: { entityType: "segment", breakoutDisplayLength: 20, route: { offsetX: 0, offsetY: 0 }, gridSnap: false, gridSize: 10, onSelect: vi.fn(), onEdit, onContextMenu: vi.fn(), onRoutePreview: vi.fn(), onRouteCommit: vi.fn(), onRouteCancel: vi.fn() },
    } as unknown as Parameters<typeof CableJacketEdge>[0];
    render(<CableJacketEdge {...props} />);

    fireEvent.doubleClick(screen.getByText("CBL-001"));

    expect(onEdit).toHaveBeenCalledWith("cable-1");
  });

  it("잠긴 케이블 레이어는 편집과 길이 핸들을 비활성화한다", () => {
    const onEdit = vi.fn();
    const props = {
      id: "cable-1", sourceX: 0, sourceY: 0, targetX: 100, targetY: 0, label: "CBL-001",
      data: { entityType: "segment", locked: true, breakoutDisplayLength: 20, route: { offsetX: 0, offsetY: 0 }, gridSnap: false, gridSize: 10, onSelect: vi.fn(), onEdit, onContextMenu: vi.fn(), onRoutePreview: vi.fn(), onRouteCommit: vi.fn(), onRouteCancel: vi.fn() },
    } as unknown as Parameters<typeof CableJacketEdge>[0];
    const { container } = render(<CableJacketEdge {...props} />);

    fireEvent.doubleClick(screen.getByText("CBL-001"));

    expect(onEdit).not.toHaveBeenCalled();
    expect(container.querySelector(".harness-cable-jacket-length-grip")).toBeNull();
  });

  it("외피를 드래그하면 이동 경로를 미리보기하고 저장한다", () => {
    const onRoutePreview = vi.fn();
    const onRouteCommit = vi.fn();
    const props = {
      id: "cable-1", sourceX: 0, sourceY: 0, targetX: 300, targetY: 40,
      data: { entityType: "segment", locked: false, breakoutDisplayLength: 20, route: { offsetX: 0, offsetY: 0 }, gridSnap: false, gridSize: 10, onSelect: vi.fn(), onEdit: vi.fn(), onContextMenu: vi.fn(), onRoutePreview, onRouteCommit, onRouteCancel: vi.fn() },
    } as unknown as Parameters<typeof CableJacketEdge>[0];
    const { container } = render(<CableJacketEdge {...props} />);
    const dragZone = container.querySelector(".harness-cable-jacket-drag-zone")!;

    fireEvent.pointerDown(dragZone, { button: 0, pointerId: 1, clientX: 50, clientY: 30 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 80, clientY: 70 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 80, clientY: 70 });

    expect(onRoutePreview).toHaveBeenCalledWith("cable-1", { offsetX: 30, offsetY: 40 });
    expect(onRouteCommit).toHaveBeenCalledWith("cable-1", { offsetX: 30, offsetY: 40 });
  });

  it("외피 끝 핸들을 드래그하면 팬아웃 길이를 저장한다", () => {
    const onRoutePreview = vi.fn();
    const onRouteCommit = vi.fn();
    const props = {
      id: "cable-1", sourceX: 0, sourceY: 0, targetX: 300, targetY: 40,
      data: { entityType: "segment", locked: false, breakoutDisplayLength: 20, route: { offsetX: 0, offsetY: 0 }, gridSnap: false, gridSize: 10, onSelect: vi.fn(), onEdit: vi.fn(), onContextMenu: vi.fn(), onRoutePreview, onRouteCommit, onRouteCancel: vi.fn() },
    } as unknown as Parameters<typeof CableJacketEdge>[0];
    const { container } = render(<CableJacketEdge {...props} />);
    const sourceGrip = screen.getByRole("button", { name: "외피 시작 길이 조절" });

    fireEvent.pointerDown(sourceGrip, { button: 0, pointerId: 1, clientX: 20, clientY: 0 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 60, clientY: 0 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 60, clientY: 0 });

    expect(onRoutePreview).toHaveBeenCalledWith("cable-1", { offsetX: 0, offsetY: 0, sourceBreakoutLength: 60 });
    expect(onRouteCommit).toHaveBeenCalledWith("cable-1", { offsetX: 0, offsetY: 0, sourceBreakoutLength: 60 });
  });

  it("지정된 양단 수축튜브와 외장재를 케이블 위에 표시한다", () => {
    const props = {
      id: "cable-1", sourceX: 0, sourceY: 0, targetX: 300, targetY: 0, label: "CBL-001",
      data: { entityType: "segment", locked: false, breakoutDisplayLength: 20, route: { offsetX: 0, offsetY: 0 }, gridSnap: false, gridSize: 10, onSelect: vi.fn(), onEdit: vi.fn(), onContextMenu: vi.fn(), onRoutePreview: vi.fn(), onRouteCommit: vi.fn(), onRouteCancel: vi.fn(), heatShrink: { source: { partNumber: "RNF-START", color: "#222222" }, target: { partNumber: "RNF-END", color: "#222222" } }, coverings: ["SLEEVE · SLV-08"] },
    } as unknown as Parameters<typeof CableJacketEdge>[0];
    const { container } = render(<CableJacketEdge {...props} />);

    expect(container.querySelectorAll(".harness-cable-heat-shrink")).toHaveLength(2);
    expect(screen.getByText("HS · RNF-START")).toBeInTheDocument();
    expect(screen.getByText("HS · RNF-END")).toBeInTheDocument();
    expect(screen.getByText("SLEEVE · SLV-08")).toBeInTheDocument();
  });
});
