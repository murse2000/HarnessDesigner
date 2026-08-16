import { describe, expect, it } from "vitest";
import { partCategories, partCategoryLabel } from "./partCategories";

describe("부품 라이브러리 카테고리", () => {
  it("등록 가능한 모든 카테고리에 한글과 영문 표시명이 있다", () => {
    expect(partCategories).toContain("housing");
    expect(partCategories).toContain("cable");
    expect(partCategories).toContain("heatShrink");
    for (const category of partCategories) {
      expect(partCategoryLabel(category, "ko")).not.toBe("");
      expect(partCategoryLabel(category, "en")).not.toBe("");
    }
  });
});
