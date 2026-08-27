import { describe, expect, it } from "vitest";
import { joinWireColor, splitWireColor, wireColorBackground } from "./wireColor";

describe("전선 색상", () => {
  it("기본색과 보조색을 조합하고 다시 분리한다", () => {
    expect(joinWireColor("WH", "RD")).toBe("WH/RD");
    expect(splitWireColor("WH/RD")).toEqual({ primary: "WH", secondary: "RD" });
  });

  it("보조색이 있으면 두 색상 미리보기 배경을 만든다", () => {
    expect(wireColorBackground("WH/RD")).toContain("linear-gradient");
  });
});
