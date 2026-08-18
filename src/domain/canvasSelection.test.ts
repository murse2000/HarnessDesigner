import { describe, expect, it } from "vitest";
import { createProject } from "./sample";
import { deleteCanvasSelection, sameCanvasEntitySelection, sameCanvasSelection } from "./canvasSelection";
import { validateProject } from "./validation";

describe("HarnessCanvas 선택 동기화", () => {
  it("동일한 빈 노드 선택은 다시 갱신하지 않는다", () => {
    expect(sameCanvasSelection([], [])).toBe(true);
  });

  it("선택된 노드 순서나 구성이 바뀐 경우에만 갱신한다", () => {
    expect(sameCanvasSelection(["node-1"], ["node-1"])).toBe(true);
    expect(sameCanvasSelection(["node-1"], ["node-2"])).toBe(false);
    expect(sameCanvasSelection(["node-1", "node-2"], ["node-2", "node-1"])).toBe(false);
  });

  it("같은 노드 선택은 프로젝트 선택 상태를 다시 쓰지 않는다", () => {
    expect(sameCanvasEntitySelection("node-j1", "node", "node-j1", "node")).toBe(true);
    expect(sameCanvasEntitySelection("node-j1", "annotation", "node-j1", "node")).toBe(false);
    expect(sameCanvasEntitySelection(null, null, "node-j1", "node")).toBe(false);
  });

  it("같은 부자재 선택도 프로젝트 선택 상태를 다시 쓰지 않는다", () => {
    expect(sameCanvasEntitySelection("acc-1", "accessory", "acc-1", "accessory")).toBe(true);
    expect(sameCanvasEntitySelection("acc-1", "node", "acc-1", "accessory")).toBe(false);
  });

  it("드래그로 선택한 여러 파트와 연결 데이터를 한 번에 삭제한다", () => {
    const harness = createProject().harnesses[0];
    harness.accessories.push(
      { id: "acc-node-j2", partId: "part-label", quantity: 1, nodeId: "node-j2", note: "J2 라벨" },
      { id: "acc-seg-2", partId: "part-sleeve", quantity: 1, segmentId: "seg-2", note: "분기 슬리브" },
    );

    deleteCanvasSelection(harness, ["node-j2", "node-j3"]);

    expect(harness.nodes.map((node) => node.id)).toEqual(["node-j1", "node-sp1"]);
    expect(harness.segments.map((segment) => segment.id)).toEqual(["seg-1"]);
    expect(harness.conductors).toEqual([]);
    expect(harness.accessories.map((accessory) => accessory.id)).toEqual(["acc-label-1"]);
  });

  it("중간 노드를 삭제하면 남은 전선을 같은 길이의 직접 경로로 재연결한다", () => {
    const project = createProject();
    const harness = project.harnesses[0];

    deleteCanvasSelection(harness, ["node-sp1"]);

    expect(harness.nodes.map((node) => node.id)).toEqual(["node-j1", "node-j2", "node-j3"]);
    expect(harness.conductors.map((conductor) => conductor.reference)).toEqual(["W001", "W002"]);
    expect(harness.segments.map((segment) => ({ from: segment.fromNodeId, to: segment.toNodeId, lengthMm: segment.lengthMm }))).toEqual([
      { from: "node-j1", to: "node-j2", lengthMm: 770 },
      { from: "node-j1", to: "node-j3", lengthMm: 830 },
    ]);
    expect(validateProject(project).filter((issue) => issue.code === "ROUTE_BROKEN")).toEqual([]);
  });

  it("같은 선택 박스의 도면 주석과 부자재도 함께 삭제한다", () => {
    const harness = createProject().harnesses[0];
    harness.drawingAnnotations = [
      { id: "annotation-1", kind: "label", text: "삭제", position: { x: 10, y: 10 }, width: 100, height: 30 },
      { id: "annotation-2", kind: "text", text: "유지", position: { x: 20, y: 20 }, width: 100, height: 30 },
    ];

    deleteCanvasSelection(harness, ["annotation-1"], ["acc-label-1"]);

    expect(harness.drawingAnnotations.map((annotation) => annotation.id)).toEqual(["annotation-2"]);
    expect(harness.accessories).toEqual([]);
  });

});
