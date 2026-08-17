import { Check, ClipboardCheck, Play, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { buildContinuityTest, completeTestRun, createTestRun, passAllUntested, testRunStatus, updateTestResult } from "../domain/manufacturing";
import type { ContinuityTestResult } from "../domain/types";
import { translate } from "../i18n";
import { useProjectStore } from "../store/projectStore";
import { Field, IconButton, PanelHeader } from "./common";

export function ContinuityTestView() {
  const { snapshot, activeHarnessId, locale, updateProject } = useProjectStore();
  const [activeRunId, setActiveRunId] = useState("");
  const [creating, setCreating] = useState(false);
  const [serialNumber, setSerialNumber] = useState("");
  const [operator, setOperator] = useState("");
  const [error, setError] = useState<string | null>(null);
  const harness = snapshot?.project.harnesses.find((item) => item.id === activeHarnessId);
  const runs = useMemo(() => (snapshot?.project.testRuns ?? []).filter((run) => run.harnessId === activeHarnessId).reverse(), [activeHarnessId, snapshot?.project.testRuns]);
  useEffect(() => setActiveRunId(runs[0]?.id ?? ""), [activeHarnessId, runs[0]?.id]);
  if (!snapshot || !harness) return null;
  const activeRun = (snapshot.project.testRuns ?? []).find((run) => run.id === activeRunId) ?? runs[0];
  const rows = activeRun?.rows ?? buildContinuityTest(snapshot.project).filter((row) => row.harnessId === harness.id).map((row) => ({ ...row, result: "untested" as const, note: "" }));
  const status = activeRun ? testRunStatus(activeRun) : null;
  const editable = Boolean(activeRun && !activeRun.completedAt);

  const startRun = () => {
    if (!serialNumber.trim() || !operator.trim()) { setError("제품 시리얼 번호와 검사자를 입력하세요."); return; }
    let createdId = "";
    void updateProject((project) => { createdId = createTestRun(project, harness.id, serialNumber, operator).id; }).then(() => {
      if (!createdId) return;
      setActiveRunId(createdId); setCreating(false); setSerialNumber(""); setError(null);
    });
  };
  const setResult = (conductorId: string, result: ContinuityTestResult, note: string) => void updateProject((project) => updateTestResult(project, activeRun!.id, conductorId, result, note));

  return <div className="data-view test-execution"><PanelHeader title={translate(locale, "test")} icon={<ClipboardCheck size={13} />} view="test" sessionId={snapshot.sessionId} harnessId={harness.id} actions={<button className="panel-action-button" disabled={harness.releaseStatus !== "released"} onClick={() => { setCreating(true); setError(null); }}><Play size={11} />새 검사</button>} />
    <div className="test-run-bar">
      <div><span>HARNESS</span><strong>{harness.number}</strong><code>R{harness.revision}</code></div>
      <label><span>검사 이력</span><select value={activeRun?.id ?? ""} onChange={(event) => setActiveRunId(event.target.value)}><option value="">설계 검사표</option>{runs.map((run) => <option key={run.id} value={run.id}>{run.serialNumber} · R{run.revision} · {statusLabel(testRunStatus(run))}</option>)}</select></label>
      {activeRun ? <><div><span>SERIAL</span><strong>{activeRun.serialNumber}</strong><small>{activeRun.operator}</small></div><span className={`test-run-status test-run-status--${status}`}>{statusLabel(status!)}</span></> : <span className="test-run-guide">{harness.releaseStatus === "released" ? "새 검사를 시작하세요." : "하네스를 릴리즈한 후 생산 검사를 시작할 수 있습니다."}</span>}
      <div className="test-run-spacer" />
      {editable && <><button onClick={() => void updateProject((project) => passAllUntested(project, activeRun!.id))}><Check size={11} />미판정 전체 PASS</button><button className="primary" disabled={rows.some((row) => row.result === "untested")} onClick={() => void updateProject((project) => completeTestRun(project, activeRun!.id))}>검사 완료</button></>}
    </div>
    <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Circuit</th><th>From</th><th>Pin</th><th>To</th><th>Pin</th><th>Color</th><th>Gauge</th><th>Cable Core</th><th>Expected</th><th>Result</th><th>Note</th></tr></thead><tbody>{rows.map((row) => <tr key={row.conductorId} className={`test-row test-row--${row.result}`}><td><strong>{row.reference}</strong></td><td>{row.fromConnector}</td><td>{row.fromPin}</td><td>{row.toConnector}</td><td>{row.toPin}</td><td>{row.color}</td><td>{row.gauge}</td><td>{row.cableCore}</td><td><span className="test-expected">{row.expected}</span></td><td><select className={`test-result-select test-result-select--${row.result}`} value={row.result} disabled={!editable} onChange={(event) => setResult(row.conductorId, event.target.value as ContinuityTestResult, row.note)}><option value="untested">미검사</option><option value="pass">PASS</option><option value="fail">FAIL</option></select></td><td><input className="test-note-input" value={row.note} disabled={!editable} placeholder="검사 메모" onChange={(event) => setResult(row.conductorId, row.result, event.target.value)} /></td></tr>)}</tbody></table></div>
    {creating && <div className="modal-backdrop modal-backdrop--nested"><section className="test-run-dialog" role="dialog" aria-modal="true"><header><div><ClipboardCheck size={15} /><strong>생산 연속성 검사 시작</strong></div><IconButton title="닫기" onClick={() => setCreating(false)}><X size={14} /></IconButton></header><main><Field label="하네스"><input value={`${harness.number} · R${harness.revision}`} disabled /></Field><Field label="제품 시리얼"><input autoFocus value={serialNumber} onChange={(event) => setSerialNumber(event.target.value)} /></Field><Field label="검사자"><input value={operator} onChange={(event) => setOperator(event.target.value)} /></Field><p>검사 시작 시 현재 릴리즈 리비전의 핀-투-핀 목록을 검사 기록에 고정합니다.</p>{error && <div className="connector-library-error">{error}</div>}</main><footer><button onClick={() => setCreating(false)}>취소</button><button className="primary" onClick={startRun}><Play size={12} />검사 시작</button></footer></section></div>}
  </div>;
}

function statusLabel(status: "inProgress" | "passed" | "failed"): string {
  return status === "inProgress" ? "진행 중" : status === "passed" ? "PASS" : "FAIL";
}
