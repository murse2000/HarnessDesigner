import { describe, expect, it } from "vitest";
import { formboardWheelZoom, formboardZoomScroll } from "./formboardViewport";

describe("폼보드 휠 확대/축소", () => {
  it("휠 방향에 따라 허용 범위 안에서 배율을 변경한다", () => {
    expect(formboardWheelZoom(4, -100)).toBeGreaterThan(4);
    expect(formboardWheelZoom(4, 100)).toBeLessThan(4);
    expect(formboardWheelZoom(16, -100)).toBe(16);
    expect(formboardWheelZoom(0.25, 100)).toBe(0.25);
  });

  it("배율 변경 뒤에도 커서 아래 도면 위치가 유지되도록 스크롤을 보정한다", () => {
    expect(formboardZoomScroll(300, 200, 4, 8)).toBe(500);
    expect(formboardZoomScroll(300, 200, 4, 2)).toBe(200);
  });
});
