import { describe, expect, it } from "vitest";
import { sampleHarness, sampleParts } from "./sample";
import { createConductorFromDraft, findUniqueSegmentRoute, hasConnectedPins, hasRenderableEndpoints, hasSegmentRoute, nextWireReference } from "./pinmap";

describe("핀맵 연결 편집", () => {
  it("사용하지 않은 다음 전선 참조를 만든다", () => {
    expect(nextWireReference(sampleHarness.conductors)).toBe("W003");
  });

  it("양쪽 핀에 연결된 전선은 선택 상태와 관계없이 도면에 표시한다", () => {
    expect(hasConnectedPins(sampleHarness.conductors[0])).toBe(true);
    const incomplete = structuredClone(sampleHarness.conductors[0]);
    incomplete.to.pinId = "";
    expect(hasConnectedPins(incomplete)).toBe(false);
  });

  it("케이블 실드의 한쪽 종단은 도면에 표시하고 일반 전선의 불완전 결선은 숨긴다", () => {
    const shield = structuredClone(sampleHarness.conductors[0]);
    shield.cableRunId = "seg-1";
    delete shield.to.pinId;
    expect(hasRenderableEndpoints(shield)).toBe(true);
    delete shield.cableRunId;
    expect(hasRenderableEndpoints(shield)).toBe(false);
  });

  it("선택한 핀의 터미널과 씰을 새 연결에 반영한다", () => {
    const wirePart = sampleParts.find((part) => part.category === "wire")!;
    const wire = createConductorFromDraft({
      reference: "W003",
      fromNodeId: "node-j1",
      fromPinId: "j1-pin-3",
      toNodeId: "node-j2",
      toPinId: "j2-pin-2",
      wirePartId: wirePart.id,
      routeSegmentIds: ["seg-1", "seg-2"],
      color: "RD",
      gauge: "20 AWG",
      twistGroup: "",
      startAllowanceMm: 0,
      endAllowanceMm: 0,
      adjustmentMm: 0,
    }, sampleHarness, wirePart, sampleParts);
    expect(wire.startTermination).toMatchObject({ terminalPartId: "part-terminal", sealPartId: "part-seal" });
    expect(wire.endTermination).toMatchObject({ terminalPartId: "part-terminal", sealPartId: "part-seal" });
  });

  it("두 커넥터 사이의 유일한 통과 구간 경로를 찾는다", () => {
    expect(findUniqueSegmentRoute(sampleHarness, "node-j1", "node-j2")).toEqual(["seg-1", "seg-2"]);
  });

  it("통과 가능한 경로가 여러 개면 경로를 추측하지 않는다", () => {
    const harness = structuredClone(sampleHarness);
    harness.segments.push({ id: "seg-direct", fromNodeId: "node-j1", toNodeId: "node-j2", label: "DIRECT", lengthMm: 500 });
    expect(findUniqueSegmentRoute(harness, "node-j1", "node-j2")).toEqual([]);
    expect(hasSegmentRoute(harness, "node-j1", "node-j2")).toBe(true);
  });

  it("물리 구간이 없는 두 커넥터를 구분한다", () => {
    const harness = structuredClone(sampleHarness);
    harness.segments = [];
    expect(hasSegmentRoute(harness, "node-j1", "node-j2")).toBe(false);
  });
});
