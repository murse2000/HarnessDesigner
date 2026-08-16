import { describe, expect, it } from "vitest";
import type { PartSnapshot } from "../domain/types";
import { defaultModelPlacement, getModelPlacement, saveModelPlacement } from "./modelPlacement";

const part = (placement?: string): PartSnapshot => ({
  id: "part", partNumber: "P-1", manufacturer: "Maker", description: "", revision: "A",
  category: "housing", unit: "ea", attributes: placement ? { modelPlacement: placement } : {},
});

describe("modelPlacement", () => {
  it("기존 부품에는 STEP +Z 인입축과 실측 배율을 기본 적용한다", () => {
    expect(getModelPlacement(part())).toEqual(defaultModelPlacement);
  });

  it("부품 속성에 저장한 정렬값을 다시 읽는다", () => {
    const saved = saveModelPlacement({}, { cableAxis: "-x", rollDeg: 90, scale: 1.2, offsetX: 1, offsetY: 2, offsetZ: 3 });
    expect(getModelPlacement(part(saved.modelPlacement))).toMatchObject({ cableAxis: "-x", rollDeg: 90, scale: 1.2, offsetX: 1, offsetY: 2, offsetZ: 3 });
  });
});
