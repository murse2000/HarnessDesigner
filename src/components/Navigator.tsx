import { useState } from "react";
import { Box, Cable, ChevronRight, CircleDot, Clipboard, Copy, FolderTree, GitFork, Pencil, Plus, Trash2 } from "lucide-react";
import { sampleHarness } from "../domain/sample";
import { translate } from "../i18n";
import { useProjectStore } from "../store/projectStore";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import { IconButton, PanelHeader } from "./common";

export function Navigator({ onDetach, detached = false }: { onDetach?: () => void; detached?: boolean } = {}) {
  const { snapshot, activeHarnessId, setActiveHarness, locale, updateProject, selectEntity } = useProjectStore();
  const [menu, setMenu] = useState<{ x: number; y: number; kind: "project" | "harness"; harnessId?: string } | null>(null);
  if (!snapshot) return null;
  const addHarness = () => void updateProject((project) => {
    const index = project.harnesses.length + 1;
    const harness = structuredClone(sampleHarness);
    harness.id = crypto.randomUUID();
    harness.number = `HNS-${String(index).padStart(3, "0")}`;
    harness.name = "NEW HARNESS";
    harness.nodes = [];
    harness.segments = [];
    harness.conductors = [];
    harness.accessories = [];
    project.harnesses.push(harness);
  });
  const duplicateHarness = (harnessId: string) => {
    let createdId: string | undefined;
    void updateProject((project) => {
      const source = project.harnesses.find((item) => item.id === harnessId);
      if (!source) return;
      const used = new Set(project.harnesses.map((item) => item.number));
      let number = `${source.number}-COPY`;
      let index = 2;
      while (used.has(number)) number = `${source.number}-COPY${index++}`;
      const copy = structuredClone(source);
      createdId = crypto.randomUUID();
      copy.id = createdId;
      copy.number = number;
      copy.name = `${source.name} COPY`;
      project.harnesses.push(copy);
    }).then(() => createdId && setActiveHarness(createdId));
  };
  const deleteHarness = (harnessId: string) => {
    if (snapshot.project.harnesses.length <= 1 || !window.confirm("선택한 하네스를 삭제하시겠습니까?")) return;
    const nextId = snapshot.project.harnesses.find((item) => item.id !== harnessId)?.id;
    void updateProject((project) => { project.harnesses = project.harnesses.filter((item) => item.id !== harnessId); });
    if (nextId) setActiveHarness(nextId);
  };
  const menuItems = (): ContextMenuItem[] => {
    if (!menu) return [];
    if (menu.kind === "project") return [
      { label: "프로젝트 속성 수정", icon: <Pencil size={12} />, action: () => selectEntity(null) },
      { label: "새 하네스 추가", icon: <Plus size={12} />, action: addHarness },
      { label: "프로젝트 이름 복사", icon: <Clipboard size={12} />, separatorBefore: true, action: () => void navigator.clipboard.writeText(snapshot.project.name) },
    ];
    const harness = snapshot.project.harnesses.find((item) => item.id === menu.harnessId);
    return [
      { label: "하네스 속성 수정", icon: <Pencil size={12} />, action: () => menu.harnessId && setActiveHarness(menu.harnessId) },
      { label: "하네스 복제", icon: <Copy size={12} />, action: () => menu.harnessId && duplicateHarness(menu.harnessId) },
      { label: "파트번호 복사", icon: <Clipboard size={12} />, action: () => harness && void navigator.clipboard.writeText(harness.number) },
      { label: "새 하네스 추가", icon: <Plus size={12} />, separatorBefore: true, action: addHarness },
      { label: "하네스 삭제", icon: <Trash2 size={12} />, danger: true, disabled: snapshot.project.harnesses.length <= 1, action: () => menu.harnessId && deleteHarness(menu.harnessId) },
    ];
  };
  return <section className="panel navigator-panel">
    <PanelHeader title={translate(locale, "project")} icon={<FolderTree size={14} />} view="navigator" sessionId={detached ? undefined : snapshot.sessionId} onDetach={onDetach} actions={<IconButton title={translate(locale, "addHarness")} onClick={addHarness}><Plus size={13} /></IconButton>} />
    <div className="project-summary" onContextMenu={(event) => { event.preventDefault(); selectEntity(null); setMenu({ x: event.clientX, y: event.clientY, kind: "project" }); }}><strong>{snapshot.project.projectNumber}</strong><span>{snapshot.project.name}</span><em>REV {snapshot.project.revision}</em></div>
    <div className="tree-section-label">{translate(locale, "harnesses")} <span>{snapshot.project.harnesses.length}</span></div>
    <div className="tree-list">
      {snapshot.project.harnesses.map((harness) => <div key={harness.id} className={`tree-harness ${harness.id === activeHarnessId ? "is-active" : ""}`}>
        <button onClick={() => { setActiveHarness(harness.id); window.dispatchEvent(new CustomEvent("harness-document-open", { detail: harness.id })); }} onContextMenu={(event) => { event.preventDefault(); setActiveHarness(harness.id); setMenu({ x: event.clientX, y: event.clientY, kind: "harness", harnessId: harness.id }); }}><ChevronRight size={12} /><Cable size={13} /><strong>{harness.number}</strong><span>{harness.name}</span></button>
        {harness.id === activeHarnessId && <div className="tree-children">
          {harness.nodes.map((node) => <button key={node.id} onClick={() => selectEntity(node.id, "node")}><span className="tree-guide" />{node.kind === "connector" ? <Box size={12} /> : <GitFork size={12} />}<strong>{node.reference}</strong><span>{node.label}</span></button>)}
          {harness.segments.filter((segment) => segment.cablePartId).map((segment) => <button key={segment.id} onClick={() => selectEntity(segment.id, "segment")}><span className="tree-guide" /><Cable size={11} /><strong>{segment.label}</strong><span>{snapshot.project.parts.find((part) => part.id === segment.cablePartId)?.partNumber} · {segment.lengthMm} mm</span></button>)}
          {harness.conductors.map((wire) => <button key={wire.id} onClick={() => selectEntity(wire.id, "conductor")}><span className="tree-guide" /><CircleDot size={11} /><strong>{wire.reference}</strong><span>{wire.color} · {wire.gauge}</span></button>)}
        </div>}
      </div>)}
    </div>
    {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems()} onClose={() => setMenu(null)} />}
  </section>;
}
