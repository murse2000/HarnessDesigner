import { describe, expect, it } from "vitest";
import { sameCanvasEntitySelection, sameCanvasSelection } from "./canvasSelection";

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

});
