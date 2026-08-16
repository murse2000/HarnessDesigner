import { describe, expect, it } from "vitest";
import { drawingSheetDimensions } from "./DrawingSheetNode";

describe("drawing sheet dimensions", () => {
  it("A3 템플릿 크기에 화면 배율을 적용한다", () => {
    expect(drawingSheetDimensions("A3", 150)).toEqual({ width: 1680, height: 1140 });
  });

  it("A4는 A3의 선형 1/루트2 크기이고 배율은 50~200%로 제한한다", () => {
    expect(drawingSheetDimensions("A4", 100).width).toBeCloseTo(1120 * Math.SQRT1_2);
    expect(drawingSheetDimensions("A3", 10)).toEqual({ width: 560, height: 380 });
    expect(drawingSheetDimensions("A3", 300)).toEqual({ width: 2240, height: 1520 });
  });
});
