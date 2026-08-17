import { describe, expect, it } from "vitest";
import { libraryLoadPercent, nextLibraryLoadCount } from "./libraryLoadProgress";

describe("부품 라이브러리 로딩 진행률", () => {
  it("카드를 지정된 묶음 단위로 준비한다", () => {
    expect(nextLibraryLoadCount(0, 135, 8)).toBe(8);
    expect(nextLibraryLoadCount(128, 135, 8)).toBe(135);
  });

  it("완료 건수를 백분율로 변환한다", () => {
    expect(libraryLoadPercent(0, 135)).toBe(0);
    expect(libraryLoadPercent(68, 135)).toBe(50);
    expect(libraryLoadPercent(135, 135)).toBe(100);
  });
});
