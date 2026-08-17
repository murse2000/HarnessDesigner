import { describe, expect, it } from "vitest";
import type { PartSnapshot } from "../domain/types";
import { getCableDisplayPolicy, getCableRenderSpec, getCableSpans, getCoreOffsets, getHeatShrinkRenderSpec, getHeatShrinkSpan } from "./cableRendering";

const cable: PartSnapshot = {
  id: "cable-1",
  name: "4심 케이블",
  partNumber: "CBL-4C",
  manufacturer: "TEST",
  description: "",
  revision: "A",
  category: "cable",
  unit: "m",
  color: "BK",
  attributes: { construction: "shieldedMultiCore", coreCount: "4", outerDiameterMm: "6", coreDiameterMm: "1.2", breakoutLengthMm: "30", shieldConstruction: "foil" },
};

describe("다심 케이블 3D 표시 계산", () => {
  it("등록된 케이블 표시 규격을 읽는다", () => {
    expect(getCableRenderSpec(cable)).toEqual({ construction: "shieldedMultiCore", coreCount: 4, outerDiameterMm: 6, coreDiameterMm: 1.2, breakoutLengthMm: 30, jacketColor: "BK", shieldConstruction: "foil" });
  });

  it("내선 지름이 외경보다 크거나 필수 정보가 없으면 표시 규격으로 사용하지 않는다", () => {
    expect(getCableRenderSpec({ ...cable, color: undefined })).toBeNull();
    expect(getCableRenderSpec({ ...cable, attributes: { ...cable.attributes, coreDiameterMm: "7" } })).toBeNull();
  });

  it("브레이크아웃 길이는 구간 절반을 넘지 않는다", () => {
    expect(getCableSpans(100, 80)).toEqual({ breakoutMm: 50, jacketLengthMm: 0 });
    expect(getCableSpans(100, 20)).toEqual({ breakoutMm: 20, jacketLengthMm: 60 });
  });

  it("X-Ray에서는 외피와 쉴드를 투명하게 하고 내선을 전체 길이로 표시한다", () => {
    expect(getCableDisplayPolicy(true, true)).toEqual({ showFullLengthCores: true, jacketOpacity: 0.22, shieldOpacity: 0.16 });
    expect(getCableDisplayPolicy(false, true)).toEqual({ showFullLengthCores: false, jacketOpacity: 1, shieldOpacity: 1 });
    expect(getCableDisplayPolicy(false, false).showFullLengthCores).toBe(true);
  });

  it("실제 내선 수만큼 외피 안쪽 오프셋을 만든다", () => {
    const offsets = getCoreOffsets(4, 6, 1.2);
    expect(offsets).toHaveLength(4);
    expect(offsets.every(({ x, y }) => Math.hypot(x, y) <= 2.4)).toBe(true);
  });

  it("수축튜브 규격과 구간 안쪽 배치 범위를 계산한다", () => {
    const heatShrink: PartSnapshot = { ...cable, id: "hs-1", category: "heatShrink", color: "BK", attributes: { finishedDiameterMm: "7", lengthMm: "40" } };
    expect(getHeatShrinkRenderSpec(heatShrink)).toEqual({ finishedDiameterMm: 7, lengthMm: 40, color: "BK" });
    expect(getHeatShrinkSpan(100, 10, 40)).toEqual({ startMm: 0, endMm: 30 });
    expect(getHeatShrinkSpan(100, 80, 20)).toEqual({ startMm: 70, endMm: 90 });
  });
});
