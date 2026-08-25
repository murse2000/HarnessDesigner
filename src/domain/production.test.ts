import { describe, expect, it } from "vitest";
import { createSampleProject } from "../test/sampleProject";
import { applyConnectionImport, buildBundleMetrics, buildCostRows, buildCostSummary, buildEquipmentRows, buildSystemNetlist, parseConnectionCsv, parseKicadNetlistXml, projectForVariant, validateManufacturingRules } from "./production";

describe("생산 엔지니어링", () => {
  it("번들 점유율과 과전류를 검증한다", () => {
    const project = createSampleProject();
    project.parts.find((part) => part.id === "part-wire-red")!.attributes = { outerDiameterMm: "4", maxCurrentA: "5" };
    project.parts.find((part) => part.id === "part-wire-blue")!.attributes = { outerDiameterMm: "4" };
    project.parts.find((part) => part.id === "part-sleeve")!.attributes.innerDiameterMm = "5";
    project.harnesses[0].conductors[0].currentA = 8;
    const metrics = buildBundleMetrics(project, project.harnesses[0]);
    const issues = validateManufacturingRules(project);
    expect(metrics[0].fillPercent).toBeGreaterThan(80);
    expect(issues.map((issue) => issue.code)).toContain("BUNDLE_FILL_EXCEEDED");
    expect(issues.map((issue) => issue.code)).toContain("WIRE_CURRENT_EXCEEDED");
  });

  it("BOM 단가와 시스템 계층 넷리스트를 계산한다", () => {
    const project = createSampleProject();
    project.parts[0].attributes.unitCost = "2.5";
    project.workInstructions.push({ id: "wi", harnessId: "harness-main", sequence: 1, kind: "assembly", title: "조립", description: "", estimatedMinutes: 30 });
    project.manufacturingRules.laborRatePerHour = 10;
    project.systems.push({ id: "sys", name: "차량", reference: "SYS1", harnessInstances: [{ id: "inst", harnessId: "harness-main", reference: "H1", quantity: 1 }] });
    expect(buildCostRows(project).find((row) => row.partId === project.parts[0].id)?.extendedCost).toBe(2.5);
    expect(buildSystemNetlist(project, project.systems[0])).toHaveLength(2);
    expect(buildCostSummary(project).laborCost).toBe(5);
    expect(buildEquipmentRows(project, project.equipmentProfiles[0])[0]).toHaveProperty("lengthMm");
  });

  it("Variant에서 비활성 전선과 부자재를 BOM 대상에서 제외한다", () => {
    const project = createSampleProject();
    const variant = { id: "v", name: "LOW", description: "", disabledConductorIds: ["wire-1"], disabledAccessoryIds: ["acc-label-1"] };
    const scoped = projectForVariant(project, variant);
    expect(scoped.harnesses[0].conductors.map((item) => item.id)).not.toContain("wire-1");
    expect(scoped.harnesses[0].accessories).toHaveLength(0);
  });

  it("연결 CSV를 기존 하우징 핀과 경로에 적용한다", () => {
    const project = createSampleProject();
    const rows = parseConnectionCsv("Harness,Wire,From,From Pin,To,To Pin,Wire Part,Color,Gauge\nHNS-001,W003,J1,3,J2,2,TXL-20-RD,RD,20 AWG");
    const result = applyConnectionImport(project, rows);
    expect(result).toEqual({ added: 1, skipped: [] });
    expect(project.harnesses[0].conductors.at(-1)?.from.pinId).toBe("j1-pin-3");
  });

  it("연결 CSV의 인용된 구분자·줄바꿈·쌍따옴표를 보존한다", () => {
    const rows = parseConnectionCsv('Harness,Wire,From,From Pin,To,To Pin,Wire Part,Color,Gauge\r\nHNS-001,"W,003",J1,3,J2,2,"TXL ""SPECIAL"",\n20",RD,"20 AWG"');
    expect(rows).toEqual([{
      harnessNumber: "HNS-001",
      reference: "W,003",
      fromReference: "J1",
      fromPin: "3",
      toReference: "J2",
      toPin: "2",
      wirePartNumber: 'TXL "SPECIAL",\n20',
      color: "RD",
      gauge: "20 AWG",
    }]);
  });

  it("시스템 하네스 수량을 넷리스트 행에 반영한다", () => {
    const project = createSampleProject();
    project.systems.push({ id: "sys", name: "장비", reference: "SYS1", harnessInstances: [{ id: "inst", harnessId: "harness-main", reference: "H1", quantity: 3 }] });
    expect(buildSystemNetlist(project, project.systems[0]).map((row) => row.quantity)).toEqual([3, 3]);
  });

  it("KiCad XML 넷리스트를 일방향 연결 데이터로 변환한다", () => {
    const rows = parseKicadNetlistXml('<export><nets><net code="1" name="SIG"><node ref="J1" pin="3"/><node ref="J2" pin="2"/></net></nets></export>', "HNS-001", "TXL-20-RD");
    expect(rows[0]).toMatchObject({ reference: "SIG", fromReference: "J1", fromPin: "3", toReference: "J2", toPin: "2" });
  });
});
