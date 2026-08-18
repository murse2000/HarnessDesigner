import { describe, expect, it } from "vitest";
import type { PartSnapshot } from "../domain/types";
import { getCableDisplayPolicy, getCableRenderSpec, getCableSpans, getCoreOffsets, getHeatShrinkRenderSpec, getHeatShrinkSpan, getIndividualWireOffsets, getWireRenderDiameterMm } from "./cableRendering";

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

  it("단선은 등록 외경을 우선하고 없으면 AWG 굵기로 표시한다", () => {
    const wire: PartSnapshot = { ...cable, id: "wire-1", category: "wire", gauge: "20 AWG", attributes: { outerDiameterMm: "2.2" } };
    expect(getWireRenderDiameterMm(wire, "20 AWG")).toBe(2.2);
    expect(getWireRenderDiameterMm({ ...wire, attributes: {} }, "12 AWG")).toBeGreaterThan(getWireRenderDiameterMm({ ...wire, attributes: {} }, "20 AWG"));
    expect(getWireRenderDiameterMm({ ...wire, attributes: {} }, "20 AWG")).toBeGreaterThan(getWireRenderDiameterMm({ ...wire, attributes: {} }, "24 AWG"));
    expect(getWireRenderDiameterMm({ ...wire, attributes: {} }, "20 AWG")).toBeCloseTo(0.812, 3);
  });

  it("굵기를 알 수 없는 기존 단선은 기존 표시 굵기를 유지한다", () => {
    expect(getWireRenderDiameterMm(undefined, "")).toBe(2.3);
  });

  it("같은 구간의 여러 단선은 표면이 겹치지 않도록 분리한다", () => {
    const offsets = getIndividualWireOffsets([2.2, 2.2]);
    expect(offsets).toHaveLength(2);
    expect(Math.hypot(offsets[1].x - offsets[0].x, offsets[1].y - offsets[0].y)).toBeGreaterThan(2.2);
  });
});
