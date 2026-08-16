import { Columns2, ExternalLink, Rows2, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { openDesignWindow } from "../windowing";
import { useProjectStore } from "../store/projectStore";
import { HarnessCanvas } from "./HarnessCanvas";
import { IconButton } from "./common";

type SplitDirection = "none" | "vertical" | "horizontal";

export function DocumentWorkspace({ bottomDock }: { bottomDock?: ReactNode }) {
  const { snapshot, activeHarnessId, setActiveHarness } = useProjectStore();
  const [openHarnessIds, setOpenHarnessIds] = useState<string[]>(() => activeHarnessId ? [activeHarnessId] : []);
  const [split, setSplit] = useState<SplitDirection>("none");
  const [secondaryHarnessId, setSecondaryHarnessId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeHarnessId) return;
    setOpenHarnessIds((current) => current.includes(activeHarnessId) ? current : [...current, activeHarnessId]);
  }, [activeHarnessId]);

  useEffect(() => {
    if (!snapshot) return;
    const available = new Set(snapshot.project.harnesses.map((harness) => harness.id));
    setOpenHarnessIds((current) => current.filter((id) => available.has(id)));
    if (secondaryHarnessId && !available.has(secondaryHarnessId)) setSecondaryHarnessId(null);
  }, [snapshot?.revision]);

  const openHarnesses = useMemo(() => snapshot?.project.harnesses.filter((harness) => openHarnessIds.includes(harness.id)) ?? [], [snapshot, openHarnessIds]);
  if (!snapshot) return null;

  const activeId = activeHarnessId ?? openHarnesses[0]?.id ?? null;
  const secondaryId = secondaryHarnessId ?? openHarnesses.find((harness) => harness.id !== activeId)?.id ?? activeId;
  const applySplit = (direction: Exclude<SplitDirection, "none">) => {
    setSecondaryHarnessId(secondaryId);
    setSplit((current) => current === direction ? "none" : direction);
  };
  const closeTab = (harnessId: string) => {
    const remaining = openHarnessIds.filter((id) => id !== harnessId);
    setOpenHarnessIds(remaining);
    if (activeId === harnessId) setActiveHarness(remaining[0] ?? snapshot.project.harnesses[0]?.id ?? "");
    if (secondaryId === harnessId) setSecondaryHarnessId(remaining.find((id) => id !== activeId) ?? null);
  };

  return <div className={`document-workspace ${bottomDock ? "with-bottom" : ""}`}>
    <div className="document-tabs">
      <div className="document-tab-list">
        {openHarnesses.map((harness) => <button key={harness.id} className={`document-tab ${harness.id === activeId ? "is-active" : ""}`} onClick={() => setActiveHarness(harness.id)}>
          <span className="document-tab__type">HARNESS</span><strong>{harness.number}</strong><span>{harness.name}</span>
          <X size={11} onClick={(event) => { event.stopPropagation(); closeTab(harness.id); }} />
        </button>)}
      </div>
      <div className="document-actions">
        <IconButton title="세로 분할" className={split === "vertical" ? "is-active" : ""} onClick={() => applySplit("vertical")}><Columns2 size={13} /></IconButton>
        <IconButton title="가로 분할" className={split === "horizontal" ? "is-active" : ""} onClick={() => applySplit("horizontal")}><Rows2 size={13} /></IconButton>
        <IconButton title="새 설계 창에서 열기" onClick={() => void openDesignWindow(snapshot.sessionId, activeId ?? undefined)}><ExternalLink size={13} /></IconButton>
      </div>
    </div>
    <div className={`document-regions document-regions--${split}`}>
      <section className="document-region is-active" onMouseDown={() => activeId && setActiveHarness(activeId)}><HarnessCanvas harnessId={activeId ?? undefined} minimapTargetId="harness-minimap-dock" /></section>
      {split !== "none" && <section className="document-region" onMouseDown={() => secondaryId && setActiveHarness(secondaryId)}>
        <select className="region-document-select" value={secondaryId ?? ""} onChange={(event) => setSecondaryHarnessId(event.target.value)}>
          {snapshot.project.harnesses.map((harness) => <option key={harness.id} value={harness.id}>{harness.number} · {harness.name}</option>)}
        </select>
        <HarnessCanvas harnessId={secondaryId ?? undefined} minimapTargetId={null} />
      </section>}
    </div>
    {bottomDock}
  </div>;
}
