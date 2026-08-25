import { describe, expect, it } from "vitest";
import { buildContinuityTest, buildTestResultExport, completeTestRun, createTestRun, testRunStatus, updateTestResult } from "./manufacturing";
import { createSampleProject } from "../test/sampleProject";

describe("제조 검사 데이터", () => {
  it("핀 대 핀 연속성 검사 행을 생성한다", () => {
    const project = createSampleProject();
    const rows = buildContinuityTest(project);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      harnessNumber: "HNS-001",
      reference: "W001",
      fromConnector: "J1",
      fromPin: "1",
      toConnector: "J2",
      toPin: "1",
      expected: "CONTINUITY",
    });
  });

  it("릴리즈된 하네스의 검사 실행을 만들고 모든 회로 판정 후 완료한다", () => {
    const project = createSampleProject();
    const harness = project.harnesses[0];
    harness.releaseStatus = "released";
    const run = createTestRun(project, harness.id, "SN-001", "검사자", "2026-08-17T01:00:00.000Z");

    expect(run.rows).toHaveLength(2);
    expect(testRunStatus(run)).toBe("inProgress");
    updateTestResult(project, run.id, run.rows[0].conductorId, "pass", "");
    updateTestResult(project, run.id, run.rows[1].conductorId, "pass", "확인");
    completeTestRun(project, run.id, "2026-08-17T01:05:00.000Z");

    expect(testRunStatus(run)).toBe("passed");
    expect(run.completedAt).toBe("2026-08-17T01:05:00.000Z");
    expect(buildTestResultExport(project)[1]).toMatchObject({
      harnessNumber: "HNS-001",
      revision: "A",
      serialNumber: "SN-001",
      operator: "검사자",
      completedAt: "2026-08-17T01:05:00.000Z",
      result: "pass",
      note: "확인",
    });
    expect(() => updateTestResult(project, run.id, run.rows[0].conductorId, "fail", "변경")).toThrow("완료된 검사");
  });

  it("미판정 회로가 있으면 완료하지 않고 FAIL 결과를 보존한다", () => {
    const project = createSampleProject();
    const harness = project.harnesses[0];
    harness.releaseStatus = "released";
    const run = createTestRun(project, harness.id, "SN-002", "검사자");

    updateTestResult(project, run.id, run.rows[0].conductorId, "fail", "단선");
    expect(() => completeTestRun(project, run.id)).toThrow("모든 회로");
    updateTestResult(project, run.id, run.rows[1].conductorId, "pass", "");
    completeTestRun(project, run.id);
    expect(testRunStatus(run)).toBe("failed");
  });
});
