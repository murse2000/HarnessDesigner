import { describe, expect, it } from "vitest";
import { arrangeCanvasPoints, nudgeCanvasPoints } from "./canvasLayout";

const points = { a: { x: 10, y: 30 }, b: { x: 40, y: 10 }, c: { x: 100, y: 70 } };

describe("도면 객체 정렬", () => {
  it("선택 객체를 왼쪽과 가운데 축에 정렬한다", () => {
    expect(arrangeCanvasPoints(points, "alignLeft")).toEqual({ a: { x: 10, y: 30 }, b: { x: 10, y: 10 }, c: { x: 10, y: 70 } });
    expect(Object.values(arrangeCanvasPoints(points, "alignMiddle")).map((point) => point.y)).toEqual([40, 40, 40]);
  });

  it("첫 객체와 마지막 객체 사이에 같은 간격으로 분배한다", () => {
    expect(arrangeCanvasPoints(points, "distributeHorizontal").b.x).toBe(55);
    expect(arrangeCanvasPoints(points, "distributeVertical").a.y).toBe(40);
  });

  it("키보드 이동량을 모든 선택 객체에 적용한다", () => {
    expect(nudgeCanvasPoints({ a: points.a, b: points.b }, { x: -1, y: 10 })).toEqual({ a: { x: 9, y: 40 }, b: { x: 39, y: 20 } });
  });
});
