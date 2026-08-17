import { Save, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type { DrawingAnnotationKind } from "../domain/types";
import { Field, IconButton } from "./common";

export type CanvasQuickEditTarget =
  | { kind: "node"; id: string; reference: string; label: string }
  | { kind: "segment"; id: string; label: string; lengthMm: number }
  | { kind: "annotation"; id: string; annotationKind: DrawingAnnotationKind; text: string; width: number; height: number; fillColor?: string; strokeColor?: string };

export function CanvasQuickEdit({ target, x, y, onCancel, onSave }: {
  target: CanvasQuickEditTarget;
  x: number;
  y: number;
  onCancel: () => void;
  onSave: (target: CanvasQuickEditTarget) => void;
}) {
  const [draft, setDraft] = useState(target);
  const [error, setError] = useState("");
  useEffect(() => setDraft(target), [target]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (draft.kind === "node" && (!draft.reference.trim() || !draft.label.trim())) {
      setError("참조명과 표시명을 모두 입력하세요.");
      return;
    }
    if (draft.kind === "segment" && (!draft.label.trim() || draft.lengthMm <= 0)) {
      setError("구간명과 0보다 큰 실제 길이를 입력하세요.");
      return;
    }
    onSave(draft);
  };
  const title = draft.kind === "node" ? "도면 부품 직접 편집" : draft.kind === "segment" ? "구간 직접 편집" : "도면 주석 직접 편집";
  const left = Math.max(8, Math.min(x + 8, window.innerWidth - 330));
  const top = Math.max(8, Math.min(y + 8, window.innerHeight - 310));

  return <form
    className="canvas-quick-edit nodrag nopan"
    role="dialog"
    aria-label={title}
    style={{ left, top }}
    onSubmit={submit}
    onPointerDown={(event) => event.stopPropagation()}
    onDoubleClick={(event) => event.stopPropagation()}
    onKeyDown={(event) => { if (event.key === "Escape") onCancel(); }}
  >
    <header><strong>{title}</strong><IconButton type="button" title="닫기" onClick={onCancel}><X size={13} /></IconButton></header>
    <div>
      {draft.kind === "node" && <>
        <Field label="참조명"><input autoFocus value={draft.reference} onChange={(event) => { setDraft({ ...draft, reference: event.target.value }); setError(""); }} /></Field>
        <Field label="표시명"><input value={draft.label} onChange={(event) => { setDraft({ ...draft, label: event.target.value }); setError(""); }} /></Field>
      </>}
      {draft.kind === "segment" && <>
        <Field label="구간명"><input autoFocus value={draft.label} onChange={(event) => { setDraft({ ...draft, label: event.target.value }); setError(""); }} /></Field>
        <Field label="실제 길이"><span className="canvas-quick-edit__number"><input type="number" min="1" value={draft.lengthMm} onChange={(event) => { setDraft({ ...draft, lengthMm: Number(event.target.value) }); setError(""); }} /><em>mm</em></span></Field>
      </>}
      {draft.kind === "annotation" && <>
        {!['rectangle', 'ellipse', 'arrow'].includes(draft.annotationKind) && <Field label={draft.annotationKind === "image" ? "설명" : "내용"}><textarea autoFocus rows={3} value={draft.text} onChange={(event) => setDraft({ ...draft, text: event.target.value })} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submit(event); }} /></Field>}
        <Field label="크기"><span className="canvas-quick-edit__size"><input aria-label="너비" type="number" min="40" max="1200" value={draft.width} onChange={(event) => setDraft({ ...draft, width: Math.max(40, Number(event.target.value)) })} /><b>×</b><input aria-label="높이" type="number" min="24" max="800" value={draft.height} onChange={(event) => setDraft({ ...draft, height: Math.max(24, Number(event.target.value)) })} /></span></Field>
        {['rectangle', 'ellipse'].includes(draft.annotationKind) && <Field label="채우기"><input type="color" value={draft.fillColor ?? "#ffffff"} onChange={(event) => setDraft({ ...draft, fillColor: event.target.value })} /></Field>}
        {['rectangle', 'ellipse', 'arrow'].includes(draft.annotationKind) && <Field label="선 색상"><input type="color" value={draft.strokeColor ?? "#1f668f"} onChange={(event) => setDraft({ ...draft, strokeColor: event.target.value })} /></Field>}
      </>}
      {error && <p>{error}</p>}
    </div>
    <footer><span>{draft.kind === "annotation" ? "⌘/Ctrl+Enter 저장" : "Enter 저장"} · Esc 취소</span><button type="button" onClick={onCancel}>취소</button><button className="primary" type="submit"><Save size={12} />저장</button></footer>
  </form>;
}
