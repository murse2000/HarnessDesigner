import { RotateCcw, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { SessionSnapshot } from "../domain/types";
import { backendInvoke } from "../platform";
import { openProjectWorkspace } from "../windowing";
import { IconButton } from "./common";

export interface RecoveryEntry { path: string; projectName: string; projectNumber: string; updatedAt: string }

export function RecoveryDialog({ entries, onClose, onChange }: { entries: RecoveryEntry[]; onClose: () => void; onChange: (entries: RecoveryEntry[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recover = async (entry: RecoveryEntry) => {
    try {
      setBusy(true); setError(null);
      const snapshot = await backendInvoke<SessionSnapshot>("open_recovery_snapshot", { path: entry.path });
      await openProjectWorkspace(snapshot.sessionId, snapshot.project.id, snapshot.project.name);
      onClose();
    } catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  };
  const remove = async (entry: RecoveryEntry) => {
    try {
      setBusy(true); setError(null);
      await backendInvoke("delete_recovery_snapshot", { path: entry.path });
      const next = entries.filter((item) => item.path !== entry.path);
      onChange(next);
      if (!next.length) onClose();
    } catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  };
  return <div className="modal-backdrop"><section className="recovery-dialog" role="dialog" aria-modal="true" aria-label="프로젝트 복구">
    <header><div><RotateCcw size={15} /><strong>저장되지 않은 프로젝트 복구</strong></div><IconButton title="나중에" onClick={onClose}><X size={14} /></IconButton></header>
    <p>자동 저장된 복구본을 새 프로젝트 창으로 엽니다. 원본 파일은 변경하지 않습니다.</p>
    <div>{entries.map((entry) => <article key={entry.path}><span><strong>{entry.projectNumber} · {entry.projectName}</strong><small>{entry.updatedAt}</small></span><button disabled={busy} onClick={() => void recover(entry)}>복구해서 열기</button><IconButton title="복구본 삭제" disabled={busy} onClick={() => void remove(entry)}><Trash2 size={12} /></IconButton></article>)}</div>
    {error && <div className="connector-library-error">{error}</div>}
    <footer><button onClick={onClose}>나중에</button></footer>
  </section></div>;
}
