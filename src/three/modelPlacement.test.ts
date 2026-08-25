import { describe, expect, it } from "vitest";
import type { PartSnapshot } from "../domain/types";
import { defaultModelPlacement, getModelPinPort, getModelPlacement, modelPinPortDirection, resolveLibraryModelPlacement, rotateModelPinPorts, saveModelPlacement, setModelPinPort } from "./modelPlacement";

const part = (placement?: string): PartSnapshot => ({
  id: "part", partNumber: "P-1", manufacturer: "Maker", description: "", revision: "A",
  category: "housing", unit: "ea", attributes: placement ? { modelPlacement: placement } : {},
});

describe("modelPlacement", () => {
  it("기존 부품에는 STEP +Z 인입축과 실측 배율을 기본 적용한다", () => {
    expect(getModelPlacement(part())).toEqual(defaultModelPlacement);
  });

  it("부품 속성에 저장한 정렬값을 다시 읽는다", () => {
    const saved = saveModelPlacement({}, { cableAxis: "-x", rollDeg: 90, rotationXDeg: 10, rotationYDeg: 20, rotationZDeg: 30, scale: 1.2, offsetX: 1, offsetY: 2, offsetZ: 3, inletDirectionX: 0, inletDirectionY: 2, inletDirectionZ: 0, straightLeadMm: 18, pinPorts: [] });
    expect(getModelPlacement(part(saved.modelPlacement))).toMatchObject({ cableAxis: "-x", rollDeg: 90, rotationXDeg: 10, rotationYDeg: 20, rotationZDeg: 30, scale: 1.2, offsetX: 1, offsetY: 2, offsetZ: 3, inletDirectionX: 0, inletDirectionY: 1, inletDirectionZ: 0, straightLeadMm: 18 });
  });

  it("기존 정렬값에는 저장된 인입축 방향과 기본 직선 인출 길이를 적용한다", () => {
    const placement = getModelPlacement(part(JSON.stringify({ cableAxis: "-y", rollDeg: 0, scale: 1, offsetX: 0, offsetY: 0, offsetZ: 0 })));
    expect(placement).toMatchObject({ inletDirectionX: 0, inletDirectionY: -1, inletDirectionZ: 0, straightLeadMm: 10 });
  });

  it("4핀 하우징의 각 핀 인입 위치와 방향을 독립 저장한다", () => {
    const placement = ["1", "2", "3", "4"].reduce((current, pinNumber, index) => setModelPinPort(current, {
      pinNumber,
      offsetX: index,
      offsetY: index + 1,
      offsetZ: index + 2,
      directionX: pinNumber === "4" ? 2 : 0,
      directionY: 0,
      directionZ: pinNumber === "4" ? 0 : 1,
      straightLeadMm: 10 + index,
    }), { ...defaultModelPlacement });
    const saved = saveModelPlacement({}, placement);
    const loaded = getModelPlacement(part(saved.modelPlacement));

    expect(loaded.pinPorts).toHaveLength(4);
    expect(getModelPinPort(loaded, "3")).toMatchObject({ offsetX: 2, offsetY: 3, offsetZ: 4, straightLeadMm: 12 });
    expect(modelPinPortDirection(getModelPinPort(loaded, "4"), { x: 0, y: 0, z: 1 })).toEqual({ x: 1, y: 0, z: 0 });
  });

  it("커넥터 회전 시 등록된 핀 인입 위치와 방향을 함께 회전한다", () => {
    const placement = setModelPinPort({ ...defaultModelPlacement }, {
      pinNumber: "1",
      offsetX: 10,
      offsetY: 0,
      offsetZ: 0,
      directionX: 1,
      directionY: 0,
      directionZ: 0,
      straightLeadMm: 12,
    });

    const rotated = rotateModelPinPorts(placement, { x: 0, y: 0, z: 90 });
    const port = getModelPinPort(rotated, "1");

    expect(port.offsetX).toBeCloseTo(0, 6);
    expect(port.offsetY).toBeCloseTo(10, 6);
    expect(port.directionX).toBeCloseTo(0, 6);
    expect(port.directionY).toBeCloseTo(1, 6);
    expect(port.straightLeadMm).toBe(12);
  });

  it("구형 프로젝트 ID도 동일 제조사와 품번의 최신 라이브러리 정렬값을 사용한다", () => {
    const projectPart = { ...part(), id: "part-housing-4", partNumber: "51021-0400", manufacturer: "Molex" };
    const libraryPart = {
      ...part(saveModelPlacement({}, { ...defaultModelPlacement, rotationXDeg: -90, inletDirectionY: -1, inletDirectionZ: 0 }).modelPlacement),
      id: "builtin-molex-51021-0400",
      partNumber: "510210400",
      manufacturer: "Molex",
      modelAssetId: "builtin-model-molex-510210400",
    };

    const resolved = resolveLibraryModelPlacement(projectPart, [libraryPart]);

    expect(resolved.modelAssetId).toBe("builtin-model-molex-510210400");
    expect(getModelPlacement(resolved)).toMatchObject({ rotationXDeg: -90, inletDirectionY: -1, inletDirectionZ: 0 });
  });
});
