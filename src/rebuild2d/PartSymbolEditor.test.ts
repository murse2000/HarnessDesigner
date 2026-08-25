import { describe, expect, it } from "vitest";
import { partSymbolWheelScale } from "./PartSymbolEditor";

describe("부품 심벌 편집기 확대·축소", () => {
  it("휠 한 단계의 확대·축소를 완만하고 대칭적인 배율로 제한한다", () => {
    const zoomIn = partSymbolWheelScale(-100);
    const zoomOut = partSymbolWheelScale(100);

    expect(zoomIn).toBeGreaterThan(0.95);
    expect(zoomIn).toBeLessThan(1);
    expect(zoomOut).toBeGreaterThan(1);
    expect(zoomOut).toBeLessThan(1.05);
    expect(zoomIn * zoomOut).toBeCloseTo(1, 8);
  });

  it("트랙패드의 작은 델타는 작은 배율 변화로 유지한다", () => {
    expect(partSymbolWheelScale(-4)).toBeGreaterThan(0.998);
    expect(partSymbolWheelScale(-4)).toBeLessThan(1);
  });
});
