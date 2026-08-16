import { useState } from "react";
import { CheckCircle2, CircleAlert, Clipboard, Copy, ListChecks, Pencil, Plus, Table2, Trash2 } from "lucide-react";
import { buildBom, buildCutList } from "../domain/calculations";
import { translate } from "../i18n";
import { useProjectStore } from "../store/projectStore";
import { validateProject } from "../domain/validation";
import { activeValidationRules, formatLength } from "../preferences";
import { IconButton, PanelHeader } from "./common";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";

function TableFrame({ children }: { children: React.ReactNode }) {
  return <div className="data-table-wrap"><table className="data-table">{children}</table></div>;
}

export function PinMapView() {
  const { snapshot, activeHarnessId, locale, selectEntity, updateProject, openPinMapEditor, openCableRunEditor } = useProjectStore();
  const [menu, setMenu] = useState<{ x: number; y: number; wireId: string } | null>(null);
  const harness = snapshot?.project.harnesses.find((item) => item.id === activeHarnessId);
  if (!snapshot || !harness) return null;
  const nodes = new Map(harness.nodes.map((node) => [node.id, node]));
  const deleteWire = (wireId: string) => {
    if (!window.confirm("선택한 핀맵 연결을 삭제하시겠습니까?")) return;
    void updateProject((project) => {
      const current = project.harnesses.find((item) => item.id === activeHarnessId);
      if (current) current.conductors = current.conductors.filter((wire) => wire.id !== wireId);
    });
    selectEntity(null);
  };
  const menuItems = (): ContextMenuItem[] => {
    const wire = harness.conductors.find((item) => item.id === menu?.wireId);
    if (!wire) return [];
    return [
      { label: wire.cableRunId ? "케이블 수정" : "핀맵 연결 수정", icon: <Pencil size={12} />, action: () => wire.cableRunId ? openCableRunEditor(wire.cableRunId) : openPinMapEditor(wire.id) },
      { label: "새 핀으로 연결 복제", icon: <Copy size={12} />, action: () => openPinMapEditor(wire.id, true) },
      { label: "전선 참조명 복사", icon: <Clipboard size={12} />, action: () => void navigator.clipboard.writeText(wire.reference) },
      { label: "새 연결 추가", icon: <Plus size={12} />, separatorBefore: true, action: () => openPinMapEditor() },
      { label: "핀맵 연결 삭제", icon: <Trash2 size={12} />, danger: true, action: () => deleteWire(wire.id) },
    ];
  };
  return <div className="data-view"><PanelHeader title={translate(locale, "pinmap")} icon={<Table2 size={13} />} view="pinmap" sessionId={snapshot.sessionId} harnessId={harness.id} actions={<button className="panel-action-button" onClick={() => openPinMapEditor()}><Plus size={11} />연결 추가</button>} /><TableFrame><thead><tr><th>Wire</th><th>From</th><th>Pin</th><th>To</th><th>Pin</th><th>Wire Part</th><th>Color</th><th>Gauge</th><th>Twist</th><th aria-label="편집" /></tr></thead><tbody>{harness.conductors.map((wire) => {
    const from = nodes.get(wire.from.nodeId); const to = nodes.get(wire.to.nodeId);
    const wirePart = snapshot.project.parts.find((part) => part.id === wire.wirePartId);
    return <tr key={wire.id} onClick={() => selectEntity(wire.id, "conductor")} onDoubleClick={() => wire.cableRunId ? openCableRunEditor(wire.cableRunId) : openPinMapEditor(wire.id)} onContextMenu={(event) => { event.preventDefault(); selectEntity(wire.id, "conductor"); setMenu({ x: event.clientX, y: event.clientY, wireId: wire.id }); }}><td><strong>{wire.reference}</strong></td><td>{from?.reference}</td><td>{from?.pins.find((pin) => pin.id === wire.from.pinId)?.number ?? (wire.shieldGroup ? "OPEN" : "")}</td><td>{to?.reference}</td><td>{to?.pins.find((pin) => pin.id === wire.to.pinId)?.number ?? (wire.shieldGroup ? "OPEN" : "")}</td><td><code>{wirePart?.partNumber}</code></td><td><span className={`wire-color wire-color--${wire.color.toLowerCase()}`} />{wire.color}</td><td>{wire.gauge}</td><td>{wire.twistGroup}</td><td className="row-actions"><IconButton title={wire.cableRunId ? "케이블 수정" : "연결 수정"} onClick={(event) => { event.stopPropagation(); wire.cableRunId ? openCableRunEditor(wire.cableRunId) : openPinMapEditor(wire.id); }}><Pencil size={11} /></IconButton><IconButton title="연결 삭제" onClick={(event) => { event.stopPropagation(); deleteWire(wire.id); }}><Trash2 size={11} /></IconButton></td></tr>;
  })}</tbody></TableFrame>{menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems()} onClose={() => setMenu(null)} />}</div>;
}

export function CutListView() {
  const { snapshot, activeHarnessId, locale, selectEntity, preferences } = useProjectStore();
  if (!snapshot) return null;
  const segmentIds = new Set(snapshot.project.harnesses.flatMap((harness) => harness.segments.map((segment) => segment.id)));
  const rows = buildCutList(snapshot.project, { cutLengthRoundingMm: preferences.cutLengthRoundingMm }).filter((row) => !activeHarnessId || snapshot.project.harnesses.find((item) => item.id === activeHarnessId)?.number === row.harnessNumber);
  return <div className="data-view"><PanelHeader title={translate(locale, "cutlist")} icon={<ListChecks size={13} />} view="cutlist" sessionId={snapshot.sessionId} harnessId={activeHarnessId ?? undefined} /><TableFrame><thead><tr><th>Harness</th><th>Wire / Cable</th><th>From</th><th>To</th><th>Part No.</th><th>Color</th><th>Gauge / Cores</th><th className="number">Length ({preferences.lengthUnit})</th></tr></thead><tbody>{rows.map((row) => <tr key={row.conductorId} onClick={() => selectEntity(row.conductorId, segmentIds.has(row.conductorId) ? "segment" : "conductor")}><td>{row.harnessNumber}</td><td><strong>{row.reference}</strong></td><td>{row.from}</td><td>{row.to}</td><td>{row.partNumber}</td><td>{row.color}</td><td>{row.gauge}</td><td className="number">{formatLength(row.lengthMm, preferences)}</td></tr>)}</tbody></TableFrame></div>;
}

export function BomView() {
  const { snapshot, locale, preferences } = useProjectStore();
  if (!snapshot) return null;
  const rows = buildBom(snapshot.project, preferences);
  return <div className="data-view"><PanelHeader title={translate(locale, "bom")} icon={<Table2 size={13} />} view="bom" sessionId={snapshot.sessionId} /><TableFrame><thead><tr><th>Category</th><th>Part No.</th><th>Manufacturer</th><th>Description</th><th>Specification</th><th>Unit</th><th className="number">Qty</th><th>Harnesses</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.partId}-${row.specification}`}><td><span className="category-pill">{row.category}</span></td><td><strong>{row.partNumber}</strong></td><td>{row.manufacturer}</td><td>{row.description}</td><td>{row.specification}</td><td>{row.unit}</td><td className="number">{row.quantity.toLocaleString(undefined, { maximumFractionDigits: 3 })}</td><td>{row.harnesses.join(", ")}</td></tr>)}</tbody></TableFrame></div>;
}

export function ValidationBar() {
  const { snapshot, locale, selectEntity, setActiveHarness, preferences } = useProjectStore();
  if (!snapshot) return null;
  const issues = validateProject(snapshot.project, activeValidationRules(preferences));
  if (!issues.length) return <div className="validation-ok"><CheckCircle2 size={13} />{translate(locale, "validationOk")}</div>;
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.length - errors;
  const target = (issue: (typeof issues)[number]) => {
    const harness = snapshot.project.harnesses.find((item) => item.id === issue.harnessId);
    const type: "node" | "segment" | "conductor" | undefined = harness?.nodes.some((item) => item.id === issue.entityId) ? "node"
      : harness?.segments.some((item) => item.id === issue.entityId) ? "segment"
      : harness?.conductors.some((item) => item.id === issue.entityId) ? "conductor" : undefined;
    const entity = type === "node" ? harness?.nodes.find((item) => item.id === issue.entityId)
      : type === "segment" ? harness?.segments.find((item) => item.id === issue.entityId)
      : harness?.conductors.find((item) => item.id === issue.entityId);
    return { harness, type, label: entity && "reference" in entity ? entity.reference : entity && "label" in entity ? entity.label : undefined };
  };
  return <div className="validation-list"><div className="validation-summary"><CircleAlert size={13} />{translate(locale, "validation")}<strong>{errors} 오류</strong><span>{warnings} 경고</span></div>{issues.map((issue) => {
    const destination = target(issue);
    return <button key={issue.id} onClick={() => {
      if (destination.harness) setActiveHarness(destination.harness.id);
      if (issue.entityId && destination.type) selectEntity(issue.entityId, destination.type);
    }}><span className={`severity severity--${issue.severity}`} /><span>{translate(locale, issue.messageKey)}{destination.label && <small>{destination.harness?.number} · {destination.label}</small>}</span><code>{issue.code}</code></button>;
  })}</div>;
}
