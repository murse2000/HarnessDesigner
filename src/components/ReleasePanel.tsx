import { Check, FileDiff, LockKeyhole, RotateCcw, Send, ShieldCheck, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  compareHarnessToLastRelease,
  latestHarnessRelease,
  releaseHarness,
  returnHarnessToDraft,
  startHarnessRevision,
  submitHarnessForReview,
} from "../domain/release";
import { validateProject } from "../domain/validation";
import { activeValidationRules } from "../preferences";
import { useProjectStore } from "../store/projectStore";
import { Field, IconButton } from "./common";

const statusLabel = { draft: "작업 중", inReview: "검토 중", released: "릴리즈" } as const;

export function ReleasePanel({ harnessId }: { harnessId: string }) {
  const { snapshot, preferences, updateProject } = useProjectStore();
  const [dialog, setDialog] = useState<"release" | "revision" | null>(null);
  const [releasedBy, setReleasedBy] = useState("");
  const [note, setNote] = useState("");
  const [nextRevision, setNextRevision] = useState("");
  const [error, setError] = useState<string | null>(null);
  const harness = snapshot?.project.harnesses.find((item) => item.id === harnessId);
  const issues = useMemo(() => snapshot ? validateProject(snapshot.project, activeValidationRules(preferences)).filter((issue) => issue.harnessId === harnessId && issue.severity === "error") : [], [harnessId, preferences, snapshot]);
  if (!snapshot || !harness) return null;
  const status = harness.releaseStatus ?? "draft";
  const latest = latestHarnessRelease(snapshot.project, harnessId);
  const difference = compareHarnessToLastRelease(snapshot.project, harnessId);
  const history = (snapshot.project.releaseHistory ?? []).filter((record) => record.harnessId === harnessId).reverse();

  const submitReview = () => {
    if (issues.length) { setError(`제조 검증 오류 ${issues.length}개를 먼저 해결하세요.`); return; }
    setError(null);
    void updateProject((project) => submitHarnessForReview(project, harnessId));
  };
  const completeRelease = () => {
    if (!releasedBy.trim()) { setError("릴리즈 승인자를 입력하세요."); return; }
    void updateProject((project) => releaseHarness(project, harnessId, releasedBy, note)).then(() => {
      setDialog(null); setError(null); setNote("");
    });
  };
  const beginRevision = () => {
    if (!nextRevision.trim() || nextRevision.trim() === harness.revision) { setError("현재와 다른 다음 리비전을 입력하세요."); return; }
    void updateProject((project) => startHarnessRevision(project, harnessId, nextRevision)).then(() => {
      setDialog(null); setError(null); setNextRevision("");
    });
  };

  return <section className="release-panel">
    <header><div><ShieldCheck size={13} /><strong>REVISION / RELEASE</strong></div><span className={`release-status release-status--${status}`}>{statusLabel[status]}</span></header>
    <div className="release-current"><div><small>현재 리비전</small><strong>{harness.revision}</strong></div><div><small>제조 검증</small><strong className={issues.length ? "has-error" : "is-ok"}>{issues.length ? `${issues.length} 오류` : "통과"}</strong></div></div>
    {latest && <div className="release-baseline"><FileDiff size={12} /><span><strong>기준본 R{latest.revision}</strong><small>{difference.total ? `추가 ${sum(difference.added)} · 삭제 ${sum(difference.removed)} · 수정 ${sum(difference.modified)}` : "현재 설계와 동일"}</small></span><code>{latest.fingerprint.slice(0, 8)}</code></div>}
    <div className="release-actions">
      {status === "draft" && <button onClick={submitReview} disabled={Boolean(issues.length)}><Send size={12} />검토 요청</button>}
      {status === "inReview" && <><button onClick={() => void updateProject((project) => returnHarnessToDraft(project, harnessId))}><RotateCcw size={12} />작업으로 복귀</button><button className="primary" onClick={() => { setDialog("release"); setError(null); }}><Check size={12} />릴리즈 승인</button></>}
      {status === "released" && <button className="primary" onClick={() => { setNextRevision(nextRevisionName(harness.revision)); setDialog("revision"); setError(null); }}><LockKeyhole size={12} />다음 리비전 시작</button>}
    </div>
    {history.length > 0 && <div className="release-history"><strong>릴리즈 이력</strong>{history.slice(0, 4).map((record) => <div key={record.id}><span>R{record.revision}</span><small>{record.releasedBy} · {new Date(record.releasedAt).toLocaleString()}</small></div>)}</div>}
    {error && !dialog && <div className="connector-library-error">{error}</div>}
    {dialog && <div className="modal-backdrop modal-backdrop--nested"><section className="release-dialog" role="dialog" aria-modal="true"><header><div><ShieldCheck size={15} /><strong>{dialog === "release" ? `R${harness.revision} 릴리즈 승인` : "다음 리비전 시작"}</strong></div><IconButton title="닫기" onClick={() => setDialog(null)}><X size={14} /></IconButton></header><main>{dialog === "release" ? <><Field label="승인자"><input autoFocus value={releasedBy} onChange={(event) => setReleasedBy(event.target.value)} /></Field><Field label="변경 메모"><textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} /></Field><p>승인하면 현재 설계를 기준본으로 저장하고 하네스를 편집 잠금합니다.</p></> : <><Field label="현재 리비전"><input value={harness.revision} disabled /></Field><Field label="다음 리비전"><input autoFocus value={nextRevision} onChange={(event) => setNextRevision(event.target.value)} /></Field><p>기존 릴리즈 기준본은 이력에 유지되고 새 리비전은 작업 상태로 전환됩니다.</p></>}{error && <div className="connector-library-error">{error}</div>}</main><footer><button onClick={() => setDialog(null)}>취소</button><button className="primary" onClick={dialog === "release" ? completeRelease : beginRevision}><Check size={12} />확인</button></footer></section></div>}
  </section>;
}

function sum(values: Record<string, number>): number { return Object.values(values).reduce((total, value) => total + value, 0); }

function nextRevisionName(revision: string): string {
  if (/^[A-Z]$/.test(revision)) return String.fromCharCode(revision.charCodeAt(0) + 1);
  const match = revision.match(/^(.*?)(\d+)$/);
  return match ? `${match[1]}${Number(match[2]) + 1}` : `${revision}.1`;
}
