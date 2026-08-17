import type { ContinuityTestResult, ContinuityTestResultExportRow, ContinuityTestRow, HarnessTestRun, ProjectDocument } from "./types";

export function buildContinuityTest(project: ProjectDocument): ContinuityTestRow[] {
  return project.harnesses.flatMap((harness) => {
    const nodes = new Map(harness.nodes.map((node) => [node.id, node]));
    return harness.conductors.flatMap((conductor) => {
      if (!conductor.from.pinId || !conductor.to.pinId) return [];
      const from = nodes.get(conductor.from.nodeId);
      const to = nodes.get(conductor.to.nodeId);
      const fromPin = from?.pins.find((pin) => pin.id === conductor.from.pinId);
      const toPin = to?.pins.find((pin) => pin.id === conductor.to.pinId);
      if (!from || !to || !fromPin || !toPin) return [];
      return [{
        conductorId: conductor.id,
        harnessId: harness.id,
        harnessNumber: harness.number,
        reference: conductor.reference,
        fromConnector: from.reference,
        fromPin: fromPin.number,
        toConnector: to.reference,
        toPin: toPin.number,
        color: conductor.color,
        gauge: conductor.gauge,
        cableCore: conductor.cableCoreId ?? "",
        expected: "CONTINUITY" as const,
      }];
    });
  });
}

export function createTestRun(project: ProjectDocument, harnessId: string, serialNumber: string, operator: string, startedAt = new Date().toISOString()): HarnessTestRun {
  const harness = project.harnesses.find((item) => item.id === harnessId);
  if (!harness) throw new Error("하네스를 찾을 수 없습니다.");
  if (harness.releaseStatus !== "released") throw new Error("릴리즈된 하네스만 생산 검사를 시작할 수 있습니다.");
  if (!serialNumber.trim()) throw new Error("제품 시리얼 번호를 입력하세요.");
  if (!operator.trim()) throw new Error("검사자를 입력하세요.");
  const rows = buildContinuityTest(project).filter((row) => row.harnessId === harnessId);
  if (!rows.length) throw new Error("검사할 핀 연결이 없습니다.");
  const run: HarnessTestRun = {
    id: crypto.randomUUID(),
    harnessId,
    harnessNumber: harness.number,
    revision: harness.revision,
    serialNumber: serialNumber.trim(),
    operator: operator.trim(),
    startedAt,
    rows: rows.map((row) => ({ ...row, result: "untested", note: "" })),
  };
  project.testRuns = [...(project.testRuns ?? []), run];
  return run;
}

export function updateTestResult(project: ProjectDocument, runId: string, conductorId: string, result: ContinuityTestResult, note: string): void {
  const run = requiredTestRun(project, runId);
  if (run.completedAt) throw new Error("완료된 검사는 수정할 수 없습니다.");
  const row = run.rows.find((item) => item.conductorId === conductorId);
  if (!row) throw new Error("검사 회로를 찾을 수 없습니다.");
  row.result = result;
  row.note = note;
}

export function passAllUntested(project: ProjectDocument, runId: string): void {
  const run = requiredTestRun(project, runId);
  if (run.completedAt) throw new Error("완료된 검사는 수정할 수 없습니다.");
  for (const row of run.rows) if (row.result === "untested") row.result = "pass";
}

export function completeTestRun(project: ProjectDocument, runId: string, completedAt = new Date().toISOString()): void {
  const run = requiredTestRun(project, runId);
  if (run.completedAt) throw new Error("이미 완료된 검사입니다.");
  if (run.rows.some((row) => row.result === "untested")) throw new Error("모든 회로를 판정한 후 검사를 완료하세요.");
  run.completedAt = completedAt;
}

export function testRunStatus(run: HarnessTestRun): "inProgress" | "passed" | "failed" {
  if (!run.completedAt) return "inProgress";
  return run.rows.some((row) => row.result === "fail") ? "failed" : "passed";
}

export function buildTestResultExport(project: ProjectDocument): ContinuityTestResultExportRow[] {
  return (project.testRuns ?? []).flatMap((run) => run.rows.map((row) => ({
    harnessNumber: run.harnessNumber,
    revision: run.revision,
    serialNumber: run.serialNumber,
    operator: run.operator,
    startedAt: run.startedAt,
    completedAt: run.completedAt ?? "",
    reference: row.reference,
    fromConnector: row.fromConnector,
    fromPin: row.fromPin,
    toConnector: row.toConnector,
    toPin: row.toPin,
    expected: row.expected,
    result: row.result,
    note: row.note,
  })));
}

function requiredTestRun(project: ProjectDocument, runId: string): HarnessTestRun {
  const run = (project.testRuns ?? []).find((item) => item.id === runId);
  if (!run) throw new Error("검사 실행을 찾을 수 없습니다.");
  return run;
}
