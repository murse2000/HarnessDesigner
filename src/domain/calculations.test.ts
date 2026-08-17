import { describe, expect, it } from "vitest";
import { createProject } from "./sample";
import { buildBom, buildCutList, buildHarnessBom, conductorLengthMm } from "./calculations";
import { validateProject } from "./validation";

describe("하네스 제조 계산", () => {
  it("구간 합계와 종단 여유 및 보정값으로 절단 길이를 계산한다", () => {
    const project = createProject();
    const harness = project.harnesses[0];
    expect(conductorLengthMm(harness.conductors[0], harness)).toBe(830);
    expect(conductorLengthMm(harness.conductors[1], harness)).toBe(890);
  });

  it("사용자가 지정한 절단 길이와 피복 제거 및 메모를 컷리스트에 반영한다", () => {
    const project = createProject();
    const conductor = project.harnesses[0].conductors[0];
    conductor.overrideLengthMm = 910;
    conductor.startTermination.stripLengthMm = 6;
    conductor.endTermination.stripLengthMm = 8;
    conductor.notes = "양단 주석 라벨";
    expect(conductorLengthMm(conductor, project.harnesses[0])).toBe(910);
    expect(buildCutList(project)[0]).toMatchObject({ lengthMm: 910, startStripLengthMm: 6, endStripLengthMm: 8, notes: "양단 주석 라벨" });
  });

  it("백엔드의 미지정 null 길이는 자동 계산으로 처리한다", () => {
    const project = createProject();
    const conductor = project.harnesses[0].conductors[0];
    (conductor as unknown as { overrideLengthMm: null }).overrideLengthMm = null;
    expect(conductorLengthMm(conductor, project.harnesses[0])).toBe(830);
  });

  it("전선은 m, 개별 절단 길이는 mm로 집계한다", () => {
    const project = createProject();
    const bom = buildBom(project);
    expect(bom.find((row) => row.partNumber === "TXL-20-RD")?.quantity).toBe(0.83);
    expect(bom.find((row) => row.partNumber === "TXL-20-BU")?.quantity).toBe(0.89);
    expect(bom.find((row) => row.partNumber === "TERM-20")?.quantity).toBe(4);
    expect(bom.find((row) => row.partNumber === "SLV-08")?.quantity).toBe(1.15);
    expect(buildCutList(project).map((row) => row.lengthMm)).toEqual([830, 890]);
  });

  it("더블 크림프 핀은 두 전선을 허용하고 터미널은 한 개로 집계한다", () => {
    const project = createProject();
    project.parts.find((part) => part.id === "part-terminal")!.attributes.maxConductors = "2";
    project.harnesses[0].conductors[1].from.pinId = project.harnesses[0].conductors[0].from.pinId;
    expect(validateProject(project).map((issue) => issue.code)).not.toContain("PIN_DUPLICATE");
    expect(buildBom(project).find((row) => row.partNumber === "TERM-20")?.quantity).toBe(3);
  });

  it("전체 BOM과 하네스별 BOM을 분리한다", () => {
    const project = createProject();
    const second = structuredClone(project.harnesses[0]);
    second.id = "harness-second";
    second.number = "HNS-002";
    project.harnesses.push(second);
    expect(buildBom(project).find((row) => row.partNumber === "TERM-20")?.quantity).toBe(8);
    expect(buildHarnessBom(project).filter((row) => row.partNumber === "TERM-20")).toEqual(expect.arrayContaining([
      expect.objectContaining({ harnessNumber: "HNS-001", quantity: 4 }),
      expect.objectContaining({ harnessNumber: "HNS-002", quantity: 4 }),
    ]));
  });

  it("다심 케이블은 길이로, 양끝 수축튜브는 개수로 집계한다", () => {
    const project = createProject();
    project.parts.push(
      { id: "part-cable", partNumber: "CBL-2C", manufacturer: "TEST", description: "", revision: "A", category: "cable", unit: "m", color: "BK", attributes: { coreCount: "2", outerDiameterMm: "6", coreDiameterMm: "1.2", breakoutLengthMm: "30" } },
      { id: "part-heat-shrink", partNumber: "HS-7-40", manufacturer: "TEST", description: "", revision: "A", category: "heatShrink", unit: "ea", color: "BK", attributes: { finishedDiameterMm: "7", lengthMm: "40" } },
    );
    project.harnesses[0].segments[0].cablePartId = "part-cable";
    project.harnesses[0].segments[0].startHeatShrinkPartId = "part-heat-shrink";
    project.harnesses[0].segments[0].endHeatShrinkPartId = "part-heat-shrink";
    const bom = buildBom(project);
    expect(bom.find((row) => row.partNumber === "CBL-2C")?.quantity).toBe(0.45);
    expect(bom.find((row) => row.partNumber === "HS-7-40")?.quantity).toBe(2);
  });

  it("케이블 런은 한 줄로 절단하고 내부 코어를 BOM에 중복 집계하지 않는다", () => {
    const project = createProject();
    project.parts.push({ id: "part-cable", partNumber: "CBL-2C", manufacturer: "TEST", description: "", revision: "A", category: "cable", unit: "m", color: "BK", attributes: { coreCount: "2" } });
    const harness = project.harnesses[0];
    const segment = harness.segments[0];
    segment.cablePartId = "part-cable";
    harness.conductors[0].wirePartId = "part-cable";
    harness.conductors[0].routeSegmentIds = [segment.id];
    harness.conductors[0].cableRunId = segment.id;
    harness.conductors[0].cableCoreId = "1";
    harness.conductors[1].wirePartId = "part-cable";
    harness.conductors[1].routeSegmentIds = [segment.id];
    harness.conductors[1].cableRunId = segment.id;
    harness.conductors[1].cableCoreId = "2";
    expect(buildCutList(project)).toEqual([expect.objectContaining({ reference: segment.label, partNumber: "CBL-2C", lengthMm: 450 })]);
    expect(buildBom(project).find((row) => row.partNumber === "CBL-2C")?.quantity).toBe(0.45);
  });

  it("절단 길이 올림과 BOM 여유율 및 길이 올림을 적용한다", () => {
    const project = createProject();
    const cuts = buildCutList(project, { cutLengthRoundingMm: 100 });
    const bom = buildBom(project, { bomWastePercent: 10, bomLengthRoundingMm: 100 });
    expect(cuts.map((row) => row.lengthMm)).toEqual([900, 900]);
    expect(bom.find((row) => row.partNumber === "TXL-20-RD")?.quantity).toBe(1);
    expect(bom.find((row) => row.partNumber === "TXL-20-BU")?.quantity).toBe(1);
    expect(bom.find((row) => row.partNumber === "TERM-20")?.quantity).toBe(4);
  });
});

describe("제조 문서 검증", () => {
  it("기준 프로젝트는 출력 차단 오류가 없다", () => {
    expect(validateProject(createProject())).toEqual([]);
  });

  it("중복 핀과 끊어진 경로를 검출한다", () => {
    const project = createProject();
    const harness = project.harnesses[0];
    harness.conductors[1].from.pinId = harness.conductors[0].from.pinId;
    harness.conductors[1].routeSegmentIds = ["missing-segment"];
    const codes = validateProject(project).map((issue) => issue.code);
    expect(codes).toContain("PIN_DUPLICATE");
    expect(codes).toContain("ROUTE_BROKEN");
  });

  it("등록 심 수보다 많은 내선이 통과하면 경고한다", () => {
    const project = createProject();
    project.parts.push({ id: "part-cable", partNumber: "CBL-1C", manufacturer: "TEST", description: "", revision: "A", category: "cable", unit: "m", color: "BK", attributes: { coreCount: "1", outerDiameterMm: "4", coreDiameterMm: "1", breakoutLengthMm: "20" } });
    project.harnesses[0].segments[0].cablePartId = "part-cable";
    expect(validateProject(project).map((issue) => issue.code)).toContain("CABLE_CORE_CAPACITY");
  });

  it("등록된 코어 중 일부만 사용해도 코어 용량 경고를 만들지 않는다", () => {
    const project = createProject();
    project.parts.push({ id: "part-cable", partNumber: "CBL-6C", manufacturer: "TEST", description: "", revision: "A", category: "cable", unit: "m", color: "BK", attributes: { coreCount: "6" } });
    const segment = project.harnesses[0].segments[0];
    segment.cablePartId = "part-cable";
    project.harnesses[0].conductors = [{ ...project.harnesses[0].conductors[0], wirePartId: "part-cable", routeSegmentIds: [segment.id], cableRunId: segment.id, cableCoreId: "1" }];
    expect(validateProject(project).map((issue) => issue.code)).not.toContain("CABLE_CORE_CAPACITY");
  });

  it("실드 드레인 결선은 일반 코어 수를 초과한 것으로 보지 않는다", () => {
    const project = createProject();
    const harness = project.harnesses[0];
    const segment = harness.segments[0];
    project.parts.push({ id: "part-shielded-cable", partNumber: "CBL-1C-S", manufacturer: "TEST", description: "", revision: "A", category: "cable", unit: "m", color: "BK", attributes: { construction: "shieldedMultiCore", coreCount: "1" } });
    segment.cablePartId = "part-shielded-cable";
    harness.conductors = [
      { ...harness.conductors[0], wirePartId: "part-shielded-cable", routeSegmentIds: [segment.id], cableRunId: segment.id, cableCoreId: "1" },
      { ...structuredClone(harness.conductors[1]), id: "shield-wire", wirePartId: "part-shielded-cable", from: { nodeId: segment.fromNodeId, pinId: harness.nodes.find((node) => node.id === segment.fromNodeId)?.pins[1].id }, to: { nodeId: segment.toNodeId }, routeSegmentIds: [segment.id], cableRunId: segment.id, cableCoreId: "shield:1", shieldGroup: "CBL-001:SHIELD" },
    ];
    const codes = validateProject(project).map((issue) => issue.code);
    expect(codes).not.toContain("CABLE_CORE_CAPACITY");
    expect(codes).not.toContain("PIN_MISSING");
    expect(codes).not.toContain("ROUTE_BROKEN");
  });

  it("검증 프로필에서 경고 등급을 변경하거나 규칙을 끈다", () => {
    const project = createProject();
    project.harnesses[0].segments[0].lengthMm = 0;
    const rules = {
      PART_INCOMPLETE: "error", DUPLICATE_REFERENCE: "error", SEGMENT_NODE_MISSING: "error", SEGMENT_LENGTH: "warning", PART_MISSING: "error",
      CABLE_CORE_CAPACITY: "off", WIRE_PART_MISSING: "error", PIN_MISSING: "error", PIN_DUPLICATE: "error",
      CONNECTION_INCOMPLETE: "error", ROUTE_BROKEN: "error", CABLE_CORE_INVALID: "error", CABLE_CORE_DUPLICATE: "error",
      TERMINATION_MISSING: "error", HEAT_SHRINK_REQUIRED: "off", TERMINAL_HOUSING_INCOMPATIBLE: "error", TERMINAL_WIRE_INCOMPATIBLE: "warning",
    } as const;
    expect(validateProject(project, rules).find((issue) => issue.code === "SEGMENT_LENGTH")?.severity).toBe("warning");
  });

  it("하우징의 호환 터미널 목록과 터미널 전선 범위를 검증한다", () => {
    const project = createProject();
    project.parts.push({ id: "part-terminal-other", partNumber: "TERM-OTHER", manufacturer: "TEST", description: "", revision: "A", category: "terminal", unit: "ea", gauge: "22-18 AWG", attributes: {} });
    const conductor = project.harnesses[0].conductors[0];
    conductor.startTermination.terminalPartId = "part-terminal-other";
    conductor.gauge = "16 AWG";
    const codes = validateProject(project).map((issue) => issue.code);
    expect(codes).toContain("TERMINAL_HOUSING_INCOMPATIBLE");
    expect(codes).toContain("TERMINAL_WIRE_INCOMPATIBLE");
  });

  it("불완전한 핀 결선과 누락된 터미널을 검출한다", () => {
    const project = createProject();
    const conductor = project.harnesses[0].conductors[0];
    delete conductor.to.pinId;
    conductor.startTermination.terminalPartId = undefined;
    const codes = validateProject(project).map((issue) => issue.code);
    expect(codes).toContain("CONNECTION_INCOMPLETE");
    expect(codes).toContain("TERMINATION_MISSING");
  });

  it("등록되지 않았거나 중복 사용된 케이블 코어를 구분해 검출한다", () => {
    const project = createProject();
    const harness = project.harnesses[0];
    const segment = harness.segments[0];
    project.parts.push({ id: "part-cable", partNumber: "CBL-2C", manufacturer: "TEST", description: "", revision: "A", category: "cable", unit: "m", attributes: { coreCount: "2" } });
    segment.cablePartId = "part-cable";
    harness.conductors = harness.conductors.map((conductor, index) => ({ ...conductor, wirePartId: "part-cable", routeSegmentIds: [segment.id], cableRunId: segment.id, cableCoreId: index === 0 ? "missing" : "missing" }));
    const codes = validateProject(project).map((issue) => issue.code);
    expect(codes).toContain("CABLE_CORE_INVALID");
    expect(codes).toContain("CABLE_CORE_DUPLICATE");
  });
});
