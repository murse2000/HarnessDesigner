import { emit, emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";
import { Columns2, ExternalLink, Ruler, Rows2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { isTauri } from "../platform";
import { findCanvasTabDropTarget, openDesignWindow, type CanvasTabDropZone } from "../windowing";
import { useProjectStore } from "../store/projectStore";
import { HarnessCanvas } from "./HarnessCanvas";
import { FormboardEditor } from "./FormboardEditor";
import { IconButton } from "./common";

type SplitDirection = "none" | "vertical" | "horizontal";

interface CanvasTabDropQuery { sessionId: string; replyTo: string }
interface CanvasTabDropResponse extends CanvasTabDropZone { replyTo: string }
interface CanvasTabDropHover { targetLabel?: string }
interface CanvasTabTransfer { token: string; sessionId: string; harnessId: string; sourceLabel: string; targetLabel: string }
interface CanvasTabTransferAck { token: string; sourceLabel: string }

export function DocumentWorkspace({ bottomDock }: { bottomDock?: ReactNode }) {
  const { snapshot, activeHarnessId, setActiveHarness } = useProjectStore();
  const [openHarnessIds, setOpenHarnessIds] = useState<string[]>(() => activeHarnessId ? [activeHarnessId] : []);
  const [split, setSplit] = useState<SplitDirection>("none");
  const [documentMode, setDocumentMode] = useState<"harness" | "formboard">("harness");
  const [formboardHarnessId, setFormboardHarnessId] = useState<string | null>(null);
  const [secondaryHarnessId, setSecondaryHarnessId] = useState<string | null>(null);
  const [draggingHarnessId, setDraggingHarnessId] = useState<string | null>(null);
  const [tabDropActive, setTabDropActive] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  const movedOutHarnessIds = useRef(new Set<string>());
  const dragZones = useRef<CanvasTabDropZone[]>([]);
  const pendingTransfers = useRef(new Map<string, string>());
  const dragState = useRef<{ harnessId: string; pointerId: number; x: number; y: number; dragging: boolean } | null>(null);
  const hoverPending = useRef(false);
  const suppressClickHarnessId = useRef<string | null>(null);
  const windowLabel = isTauri() ? getCurrentWindow().label : "browser";

  useEffect(() => {
    if (!activeHarnessId) return;
    if (movedOutHarnessIds.current.has(activeHarnessId)) return;
    setOpenHarnessIds((current) => current.includes(activeHarnessId) ? current : [...current, activeHarnessId]);
  }, [activeHarnessId]);

  useEffect(() => {
    const openHarness = (event: Event) => {
      const harnessId = (event as CustomEvent<string>).detail;
      movedOutHarnessIds.current.delete(harnessId);
      setOpenHarnessIds((current) => current.includes(harnessId) ? current : [...current, harnessId]);
    };
    window.addEventListener("harness-document-open", openHarness);
    return () => window.removeEventListener("harness-document-open", openHarness);
  }, []);

  useEffect(() => {
    if (!snapshot) return;
    const available = new Set(snapshot.project.harnesses.map((harness) => harness.id));
    setOpenHarnessIds((current) => current.filter((id) => available.has(id)));
    if (secondaryHarnessId && !available.has(secondaryHarnessId)) setSecondaryHarnessId(null);
    if (formboardHarnessId && !available.has(formboardHarnessId)) { setFormboardHarnessId(null); setDocumentMode("harness"); }
  }, [snapshot?.revision]);

  const openHarnesses = useMemo(() => snapshot?.project.harnesses.filter((harness) => openHarnessIds.includes(harness.id)) ?? [], [snapshot, openHarnessIds]);
  if (!snapshot) return null;

  const activeId = openHarnesses.some((harness) => harness.id === activeHarnessId) ? activeHarnessId : openHarnesses[0]?.id ?? null;
  const secondaryId = secondaryHarnessId ?? openHarnesses.find((harness) => harness.id !== activeId)?.id ?? activeId;
  const formboardHarness = snapshot.project.harnesses.find((harness) => harness.id === formboardHarnessId);
  const effectiveSplit = documentMode === "formboard" ? "none" : split;
  const applySplit = (direction: Exclude<SplitDirection, "none">) => {
    setSecondaryHarnessId(secondaryId);
    setSplit((current) => current === direction ? "none" : direction);
  };
  const closeTab = (harnessId: string) => {
    const remaining = openHarnessIds.filter((id) => id !== harnessId);
    setOpenHarnessIds(remaining);
    if (activeId === harnessId && remaining[0]) setActiveHarness(remaining[0]);
    if (secondaryId === harnessId) setSecondaryHarnessId(remaining.find((id) => id !== activeId) ?? null);
  };

  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    const cleanups: Array<() => void> = [];
    void Promise.all([
      listen<CanvasTabDropQuery>("canvas-tab-drop-query", async ({ payload }) => {
        if (payload.sessionId !== snapshot.sessionId || payload.replyTo === windowLabel || !tabsRef.current) return;
        const [origin, scaleFactor] = await Promise.all([getCurrentWebview().position(), getCurrentWindow().scaleFactor()]);
        const rect = tabsRef.current.getBoundingClientRect();
        await emitTo(payload.replyTo, "canvas-tab-drop-response", {
          replyTo: payload.replyTo,
          label: windowLabel,
          sessionId: snapshot.sessionId,
          x: origin.x + rect.left * scaleFactor,
          y: origin.y + rect.top * scaleFactor,
          width: rect.width * scaleFactor,
          height: rect.height * scaleFactor,
        } satisfies CanvasTabDropResponse);
      }),
      listen<CanvasTabDropResponse>("canvas-tab-drop-response", ({ payload }) => {
        if (payload.replyTo !== windowLabel || payload.sessionId !== snapshot.sessionId) return;
        dragZones.current = [...dragZones.current.filter((zone) => zone.label !== payload.label), payload];
      }),
      listen<CanvasTabDropHover>("canvas-tab-drop-hover", ({ payload }) => setTabDropActive(payload.targetLabel === windowLabel)),
      listen<CanvasTabTransfer>("canvas-tab-transfer", async ({ payload }) => {
        if (payload.targetLabel !== windowLabel || payload.sessionId !== snapshot.sessionId) return;
        movedOutHarnessIds.current.delete(payload.harnessId);
        setOpenHarnessIds((current) => current.includes(payload.harnessId) ? current : [...current, payload.harnessId]);
        setActiveHarness(payload.harnessId);
        await emitTo(payload.sourceLabel, "canvas-tab-transfer-ack", { token: payload.token, sourceLabel: payload.sourceLabel } satisfies CanvasTabTransferAck);
      }),
      listen<CanvasTabTransferAck>("canvas-tab-transfer-ack", ({ payload }) => {
        if (payload.sourceLabel !== windowLabel) return;
        const harnessId = pendingTransfers.current.get(payload.token);
        if (!harnessId) return;
        pendingTransfers.current.delete(payload.token);
        movedOutHarnessIds.current.add(harnessId);
        setOpenHarnessIds((current) => {
          const remaining = current.filter((id) => id !== harnessId);
          if (activeHarnessId === harnessId && remaining[0]) setActiveHarness(remaining[0]);
          return remaining;
        });
      }),
    ]).then((listeners) => {
      if (!active) listeners.forEach((cleanup) => cleanup());
      else cleanups.push(...listeners);
    });
    return () => { active = false; cleanups.forEach((cleanup) => cleanup()); };
  }, [snapshot.sessionId, windowLabel, activeHarnessId, setActiveHarness]);

  const updateDropHover = () => {
    if (!isTauri() || hoverPending.current) return;
    hoverPending.current = true;
    void cursorPosition().then((cursor) => {
      const targetLabel = findCanvasTabDropTarget(cursor, dragZones.current, windowLabel, snapshot.sessionId);
      return emit("canvas-tab-drop-hover", { targetLabel } satisfies CanvasTabDropHover);
    }).finally(() => { hoverPending.current = false; });
  };
  const startTabPointer = (harnessId: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || (event.target as Element).closest("svg")) return;
    dragState.current = { harnessId, pointerId: event.pointerId, x: event.clientX, y: event.clientY, dragging: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveTabPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.dragging && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) >= 6) {
      drag.dragging = true;
      dragZones.current = [];
      setDraggingHarnessId(drag.harnessId);
      void emit("canvas-tab-drop-query", { sessionId: snapshot.sessionId, replyTo: windowLabel } satisfies CanvasTabDropQuery);
    }
    if (drag.dragging) updateDropHover();
  };
  const finishTabPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragState.current;
    dragState.current = null;
    if (!drag || drag.pointerId !== event.pointerId || !drag.dragging) return;
    suppressClickHarnessId.current = drag.harnessId;
    setDraggingHarnessId(null);
    void cursorPosition().then(async (cursor) => {
      const targetLabel = findCanvasTabDropTarget(cursor, dragZones.current, windowLabel, snapshot.sessionId);
      await emit("canvas-tab-drop-hover", {} satisfies CanvasTabDropHover);
      if (!targetLabel) return;
      const token = crypto.randomUUID();
      pendingTransfers.current.set(token, drag.harnessId);
      await emitTo(targetLabel, "canvas-tab-transfer", {
        token,
        sessionId: snapshot.sessionId,
        harnessId: drag.harnessId,
        sourceLabel: windowLabel,
        targetLabel,
      } satisfies CanvasTabTransfer);
    });
  };
  const cancelTabPointer = () => {
    dragState.current = null;
    setDraggingHarnessId(null);
    if (isTauri()) void emit("canvas-tab-drop-hover", {} satisfies CanvasTabDropHover);
  };

  return <div className={`document-workspace ${bottomDock ? "with-bottom" : ""}`}>
    <div ref={tabsRef} className={`document-tabs ${tabDropActive ? "is-tab-drop-target" : ""}`}>
      <div className="document-tab-list">
        {openHarnesses.map((harness) => <button key={harness.id} className={`document-tab ${documentMode === "harness" && harness.id === activeId ? "is-active" : ""} ${harness.id === draggingHarnessId ? "is-dragging" : ""}`} onPointerDown={(event) => startTabPointer(harness.id, event)} onPointerMove={moveTabPointer} onPointerUp={finishTabPointer} onPointerCancel={cancelTabPointer} onClick={() => { if (suppressClickHarnessId.current === harness.id) { suppressClickHarnessId.current = null; return; } setDocumentMode("harness"); setActiveHarness(harness.id); }}>
          <span className="document-tab__type">HARNESS</span><strong>{harness.number}</strong><span>{harness.name}</span>
          <X size={11} onClick={(event) => { event.stopPropagation(); closeTab(harness.id); }} />
        </button>)}
        {formboardHarness && <button className={`document-tab document-tab--formboard ${documentMode === "formboard" ? "is-active" : ""}`} onClick={() => { setDocumentMode("formboard"); setActiveHarness(formboardHarness.id); }}>
          <span className="document-tab__type">FORMBOARD</span><strong>{formboardHarness.number}</strong><span>1:1 제조 배치</span>
          <X size={11} onClick={(event) => { event.stopPropagation(); setFormboardHarnessId(null); setDocumentMode("harness"); }} />
        </button>}
      </div>
      <div className="document-actions">
        <IconButton title="폼보드 열기" className={documentMode === "formboard" ? "is-active" : ""} disabled={!activeId} onClick={() => { if (!activeId) return; setFormboardHarnessId(activeId); setDocumentMode("formboard"); }}><Ruler size={13} /></IconButton>
        <IconButton title="세로 분할" className={split === "vertical" ? "is-active" : ""} disabled={documentMode === "formboard"} onClick={() => applySplit("vertical")}><Columns2 size={13} /></IconButton>
        <IconButton title="가로 분할" className={split === "horizontal" ? "is-active" : ""} disabled={documentMode === "formboard"} onClick={() => applySplit("horizontal")}><Rows2 size={13} /></IconButton>
        <IconButton title="새 설계 창에서 열기" onClick={() => void openDesignWindow(snapshot.sessionId, activeId ?? undefined)}><ExternalLink size={13} /></IconButton>
      </div>
    </div>
    <div className={`document-regions document-regions--${effectiveSplit}`}>
      <section className="document-region is-active" onMouseDown={() => documentMode === "formboard" ? formboardHarnessId && setActiveHarness(formboardHarnessId) : activeId && setActiveHarness(activeId)}>{documentMode === "formboard" && formboardHarnessId ? <FormboardEditor harnessId={formboardHarnessId} /> : activeId ? <HarnessCanvas harnessId={activeId} minimapTargetId="harness-minimap-dock" /> : <div className="document-empty">왼쪽 프로젝트 탐색기에서 하네스를 열거나 다른 창의 캔버스 탭을 이곳으로 끌어오세요.</div>}</section>
      {effectiveSplit !== "none" && <section className="document-region" onMouseDown={() => secondaryId && setActiveHarness(secondaryId)}>
        <select className="region-document-select" value={secondaryId ?? ""} onChange={(event) => setSecondaryHarnessId(event.target.value)}>
          {snapshot.project.harnesses.map((harness) => <option key={harness.id} value={harness.id}>{harness.number} · {harness.name}</option>)}
        </select>
        <HarnessCanvas harnessId={secondaryId ?? undefined} minimapTargetId={null} />
      </section>}
    </div>
    {bottomDock}
  </div>;
}
