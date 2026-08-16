import { Boxes, Cable, Map, Plus, RefreshCw, SlidersHorizontal, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getCableConductors } from "../domain/cables";
import { getCompatibleTerminalIds, getPartName, getPartPinCount, resolvePinTermination } from "../domain/parts";
import type { PartSnapshot } from "../domain/types";
import { translate } from "../i18n";
import { backendInvoke, isTauri } from "../platform";
import { useProjectStore } from "../store/projectStore";
import { EmptyState, Field, IconButton, PanelHeader } from "./common";

export function Inspector({ onDetach, detached = false }: { onDetach?: () => void; detached?: boolean } = {}) {
  const { snapshot, activeHarnessId, selectedEntityId, selectedEntityType, locale, updateProject, selectEntity, openConnectorPicker, openCableRunEditor } = useProjectStore();
  const [libraryParts, setLibraryParts] = useState<PartSnapshot[]>([]);
  useEffect(() => {
    if (isTauri()) void backendInvoke<PartSnapshot[]>("list_library_parts").then(setLibraryParts).catch(() => setLibraryParts([]));
  }, []);
  if (!snapshot) return null;
  const harness = snapshot.project.harnesses.find((item) => item.id === activeHarnessId);
  const node = selectedEntityType === "node" ? harness?.nodes.find((item) => item.id === selectedEntityId) : undefined;
  const part = node?.partId ? snapshot.project.parts.find((item) => item.id === node.partId) : undefined;
  const segment = selectedEntityType === "segment" ? harness?.segments.find((item) => item.id === selectedEntityId) : undefined;
  const conductor = selectedEntityType === "conductor" ? harness?.conductors.find((item) => item.id === selectedEntityId) : undefined;
  const cablePart = segment?.cablePartId ? snapshot.project.parts.find((item) => item.id === segment.cablePartId) : undefined;
  const cableConductors = segment ? harness?.conductors.filter((item) => item.cableRunId === segment.id) ?? [] : [];
  const cableDefinitions = cablePart ? getCableConductors(cablePart) : [];
  const usedCableCoreIds = new Set(cableConductors.map((item) => item.cableCoreId).filter(Boolean));
  const unusedCableCores = cableDefinitions.filter((item) => item.kind === "core" && !usedCableCoreIds.has(item.id));
  const missingCableTerminations = cableConductors.reduce((count, wire) => count + ([[wire.from, wire.startTermination], [wire.to, wire.endTermination]] as const).filter(([endpoint, termination]) => {
    const node = harness?.nodes.find((item) => item.id === endpoint.nodeId);
    return Boolean(endpoint.pinId && node?.kind === "connector" && !termination.terminalPartId);
  }).length, 0);
  const projectPartIds = new Set(snapshot.project.parts.map((item) => item.id));
  const availableParts = [...snapshot.project.parts, ...libraryParts.filter((item) => !projectPartIds.has(item.id))];
  const cableParts = availableParts.filter((item) => item.category === "cable");
  const heatShrinkParts = availableParts.filter((item) => item.category === "heatShrink");
  const commitMetadata = (target: "project" | "harness", field: "name" | "number", value: string) => void updateProject((project) => {
    if (target === "project") project.name = value;
    else {
      const current = project.harnesses.find((item) => item.id === activeHarnessId);
      if (current) current[field] = value;
    }
  });
  const commitValue = (field: string, value: string | number | undefined) => void updateProject((project) => {
    const current = project.harnesses.find((item) => item.id === activeHarnessId);
    const entity = selectedEntityType === "node" ? current?.nodes.find((item) => item.id === selectedEntityId)
      : selectedEntityType === "segment" ? current?.segments.find((item) => item.id === selectedEntityId)
      : current?.conductors.find((item) => item.id === selectedEntityId);
    if (entity) (entity as unknown as Record<string, unknown>)[field] = value;
  });
  const deleteSelected = () => void updateProject((project) => {
    const current = project.harnesses.find((item) => item.id === activeHarnessId);
    if (!current || !selectedEntityId) return;
    if (selectedEntityType === "node") {
      current.nodes = current.nodes.filter((item) => item.id !== selectedEntityId);
      const removedSegments = new Set(current.segments.filter((item) => item.fromNodeId === selectedEntityId || item.toNodeId === selectedEntityId).map((item) => item.id));
      current.segments = current.segments.filter((item) => !removedSegments.has(item.id));
      current.conductors = current.conductors.filter((item) => item.from.nodeId !== selectedEntityId && item.to.nodeId !== selectedEntityId);
    } else if (selectedEntityType === "segment") {
      current.segments = current.segments.filter((item) => item.id !== selectedEntityId);
      current.conductors = current.conductors.filter((item) => item.cableRunId !== selectedEntityId);
    }
    else if (selectedEntityType === "conductor") current.conductors = current.conductors.filter((item) => item.id !== selectedEntityId);
    selectEntity(null);
  });
  const assignSegmentPart = (field: "cablePartId" | "startHeatShrinkPartId" | "endHeatShrinkPartId", partId: string) => void updateProject((project) => {
    const current = project.harnesses.find((item) => item.id === activeHarnessId);
    const currentSegment = current?.segments.find((item) => item.id === selectedEntityId);
    if (!currentSegment) return;
    if (partId && !project.parts.some((item) => item.id === partId)) {
      const libraryPart = libraryParts.find((item) => item.id === partId);
      if (libraryPart) project.parts.push(structuredClone(libraryPart));
    }
    currentSegment[field] = partId || undefined;
  });
  const commitCableRoute = (field: "sourceBreakoutLength" | "targetBreakoutLength", value: number) => void updateProject((project) => {
    const current = project.harnesses.find((item) => item.id === activeHarnessId);
    const currentSegment = current?.segments.find((item) => item.id === selectedEntityId);
    if (!currentSegment) return;
    currentSegment.drawingRoute = { offsetX: currentSegment.drawingRoute?.offsetX ?? 0, offsetY: currentSegment.drawingRoute?.offsetY ?? 0, ...currentSegment.drawingRoute, [field]: Math.max(0, value) };
  });
  const applyCableTerminations = () => void updateProject((project) => {
    const current = project.harnesses.find((item) => item.id === activeHarnessId);
    const currentSegment = current?.segments.find((item) => item.id === selectedEntityId);
    if (!current || !currentSegment) return;
    for (const wire of current.conductors.filter((item) => item.cableRunId === currentSegment.id)) {
      const from = resolvePinTermination(project.parts, current.nodes.find((item) => item.id === wire.from.nodeId), wire.from.pinId);
      const to = resolvePinTermination(project.parts, current.nodes.find((item) => item.id === wire.to.nodeId), wire.to.pinId);
      wire.startTermination = { ...wire.startTermination, terminalPartId: wire.startTermination.terminalPartId ?? from.terminalPartId, sealPartId: wire.startTermination.sealPartId ?? from.sealPartId };
      wire.endTermination = { ...wire.endTermination, terminalPartId: wire.endTermination.terminalPartId ?? to.terminalPartId, sealPartId: wire.endTermination.sealPartId ?? to.sealPartId };
    }
  });
  const applyConductorTerminations = () => void updateProject((project) => {
    const current = project.harnesses.find((item) => item.id === activeHarnessId);
    const wire = current?.conductors.find((item) => item.id === selectedEntityId);
    if (!current || !wire) return;
    const from = resolvePinTermination(project.parts, current.nodes.find((item) => item.id === wire.from.nodeId), wire.from.pinId);
    const to = resolvePinTermination(project.parts, current.nodes.find((item) => item.id === wire.to.nodeId), wire.to.pinId);
    wire.startTermination = { ...wire.startTermination, terminalPartId: wire.startTermination.terminalPartId ?? from.terminalPartId, sealPartId: wire.startTermination.sealPartId ?? from.sealPartId };
    wire.endTermination = { ...wire.endTermination, terminalPartId: wire.endTermination.terminalPartId ?? to.terminalPartId, sealPartId: wire.endTermination.sealPartId ?? to.sealPartId };
  });
  const breakoutDefault = Number(cablePart?.attributes.breakoutLengthMm) || 40;
  const terminationPartNumbers = [...new Set(cableConductors.flatMap((wire) => [wire.startTermination.terminalPartId, wire.startTermination.sealPartId, wire.endTermination.terminalPartId, wire.endTermination.sealPartId]).filter(Boolean).map((id) => snapshot.project.parts.find((item) => item.id === id)?.partNumber).filter(Boolean))];
  const partNumber = (id?: string) => snapshot.project.parts.find((item) => item.id === id)?.partNumber ?? "미지정";
  return <section className="panel inspector-panel">
    <PanelHeader title={translate(locale, "inspector")} icon={<SlidersHorizontal size={14} />} view="inspector" sessionId={detached ? undefined : snapshot.sessionId} harnessId={activeHarnessId ?? undefined} onDetach={onDetach} actions={<IconButton title="부품 라이브러리에서 커넥터 추가" onClick={() => openConnectorPicker()}><Plus size={13} /></IconButton>} />
    <div className="inspector-scroll">
    {!node && !segment && !conductor && <div className="inspector-form">
      <div className="entity-type"><span>PROJECT / HARNESS</span><code>DOCUMENT</code></div>
      <Field label="프로젝트 이름"><input value={snapshot.project.name} onChange={(event) => commitMetadata("project", "name", event.target.value)} /></Field>
      {harness ? <>
        <Field label="하네스 파트번호"><input value={harness.number} onChange={(event) => commitMetadata("harness", "number", event.target.value)} /></Field>
        <Field label="하네스 이름"><input value={harness.name} onChange={(event) => commitMetadata("harness", "name", event.target.value)} /></Field>
      </> : <EmptyState>하네스를 선택하세요.</EmptyState>}
    </div>}
    {(node || segment || conductor) && <div className="inspector-form">
      <div className="entity-type"><span>{segment?.cablePartId ? "CABLE RUN" : selectedEntityType}</span><code>{selectedEntityId?.slice(0, 12)}</code><IconButton title="삭제" onClick={deleteSelected}><Trash2 size={13} /></IconButton></div>
      {node && <>
        {part && <section className="inspector-part"><header><Boxes size={13} /><strong>PART INFORMATION</strong><button onClick={() => openConnectorPicker("replace", node.id)}><RefreshCw size={11} />부품 변경</button></header><dl><dt>파트명</dt><dd>{getPartName(part)}</dd><dt>파트번호</dt><dd><code>{part.partNumber}</code></dd><dt>제조사</dt><dd>{part.manufacturer || "—"}</dd><dt>핀 수</dt><dd>{getPartPinCount(part)}</dd><dt>Revision</dt><dd>{part.revision}</dd><dt>호환 터미널</dt><dd>{getCompatibleTerminalIds(part).map((id) => snapshot.project.parts.find((item) => item.id === id)?.partNumber).filter(Boolean).join(", ") || "미지정"}</dd></dl></section>}
        <Field label={translate(locale, "reference")}><input value={node.reference} onChange={(event) => commitValue("reference", event.target.value)} /></Field>
        <Field label="Label"><input value={node.label} onChange={(event) => commitValue("label", event.target.value)} /></Field>
        <Field label="Type"><select value={node.kind} onChange={(event) => commitValue("kind", event.target.value)}><option value="connector">Connector</option><option value="splice">Splice</option><option value="junction">Junction</option><option value="lug">Lug</option><option value="termination">Termination</option></select></Field>
        <Field label="Pins"><input value={node.pins.length} disabled /></Field>
      </>}
      {segment && <>
        {cablePart && <section className="inspector-part cable-properties"><header><Cable size={13} /><strong>CABLE PROPERTIES</strong><button onClick={() => openCableRunEditor(segment.id)}>케이블 수정</button></header><dl><dt>파트번호</dt><dd><code>{cablePart.partNumber}</code></dd><dt>제조사</dt><dd>{cablePart.manufacturer || "—"}</dd><dt>구조</dt><dd>{cablePart.attributes.construction === "shieldedMultiCore" ? "실드 멀티코어" : "멀티코어"}</dd><dt>외경</dt><dd>{cablePart.attributes.outerDiameterMm ? `${cablePart.attributes.outerDiameterMm} mm` : "미지정"}</dd><dt>최소 굽힘</dt><dd>{cablePart.attributes.minimumBendRadiusMm ? `${cablePart.attributes.minimumBendRadiusMm} mm` : "미지정"}</dd><dt>사용 코어</dt><dd>{cableConductors.filter((item) => !item.shieldGroup).length} / {cableDefinitions.filter((item) => item.kind === "core").length}</dd><dt>미사용 코어</dt><dd>{unusedCableCores.map((item) => item.number).join(", ") || "없음"}</dd><dt>실드/드레인</dt><dd>{cableDefinitions.some((item) => item.kind === "shield") ? (cableConductors.some((item) => item.shieldGroup) ? "결선됨" : "미사용") : "없음"}</dd><dt>종단 BOM</dt><dd>{terminationPartNumbers.join(", ") || "미지정"}</dd></dl><button className="inspector-wide-action" disabled={!missingCableTerminations} onClick={applyCableTerminations}>{missingCableTerminations ? `누락 종단 ${missingCableTerminations}개 자동 지정` : "종단 부품 지정 완료"}</button></section>}
        <Field label={segment.cablePartId ? "Cable Run Ref." : "Label"}><input value={segment.label} disabled={Boolean(segment.cablePartId)} onChange={(event) => commitValue("label", event.target.value)} /></Field>
        <Field label="Length (mm)"><input type="number" min="1" value={segment.lengthMm} onChange={(event) => commitValue("lengthMm", Number(event.target.value))} /></Field>
        {!segment.cablePartId && <Field label="Cable"><select value="" onChange={(event) => assignSegmentPart("cablePartId", event.target.value)}><option value="">지정 안 함</option>{cableParts.map((item) => <option key={item.id} value={item.id}>{item.partNumber} · {item.manufacturer}</option>)}</select></Field>}
        {segment.cablePartId && <><Field label="From Fan-out (mm)"><input type="number" min="0" value={segment.drawingRoute?.sourceBreakoutLength ?? breakoutDefault} onChange={(event) => commitCableRoute("sourceBreakoutLength", Number(event.target.value))} /></Field><Field label="To Fan-out (mm)"><input type="number" min="0" value={segment.drawingRoute?.targetBreakoutLength ?? breakoutDefault} onChange={(event) => commitCableRoute("targetBreakoutLength", Number(event.target.value))} /></Field></>}
        <Field label="Start Heat Shrink"><select value={segment.startHeatShrinkPartId ?? ""} disabled={!segment.cablePartId} onChange={(event) => assignSegmentPart("startHeatShrinkPartId", event.target.value)}><option value="">지정 안 함</option>{heatShrinkParts.map((item) => <option key={item.id} value={item.id}>{item.partNumber} · {item.manufacturer}</option>)}</select></Field>
        <Field label="End Heat Shrink"><select value={segment.endHeatShrinkPartId ?? ""} disabled={!segment.cablePartId} onChange={(event) => assignSegmentPart("endHeatShrinkPartId", event.target.value)}><option value="">지정 안 함</option>{heatShrinkParts.map((item) => <option key={item.id} value={item.id}>{item.partNumber} · {item.manufacturer}</option>)}</select></Field>
      </>}
      {conductor && <>
        <section className="inspector-part cable-properties"><header><Boxes size={13} /><strong>TERMINATION BOM</strong></header><dl><dt>From 터미널</dt><dd>{partNumber(conductor.startTermination.terminalPartId)}</dd><dt>From 씰</dt><dd>{partNumber(conductor.startTermination.sealPartId)}</dd><dt>To 터미널</dt><dd>{partNumber(conductor.endTermination.terminalPartId)}</dd><dt>To 씰</dt><dd>{partNumber(conductor.endTermination.sealPartId)}</dd></dl><button className="inspector-wide-action" disabled={Boolean(conductor.startTermination.terminalPartId && conductor.endTermination.terminalPartId)} onClick={applyConductorTerminations}>{conductor.startTermination.terminalPartId && conductor.endTermination.terminalPartId ? "종단 부품 지정 완료" : "기본 종단 부품 자동 지정"}</button></section>
        <Field label={translate(locale, "reference")}><input value={conductor.reference} onChange={(event) => commitValue("reference", event.target.value)} /></Field>
        <Field label={translate(locale, "color")}><input value={conductor.color} onChange={(event) => commitValue("color", event.target.value)} /></Field>
        <Field label={translate(locale, "gauge")}><input value={conductor.gauge} onChange={(event) => commitValue("gauge", event.target.value)} /></Field>
        <Field label="Adjustment (mm)"><input type="number" value={conductor.adjustmentMm} onChange={(event) => commitValue("adjustmentMm", Number(event.target.value))} /></Field>
        <Field label="Twist group"><input value={conductor.twistGroup ?? ""} onChange={(event) => commitValue("twistGroup", event.target.value)} /></Field>
      </>}
    </div>}
    </div>
    {!detached && <section className="inspector-minimap"><header><Map size={12} /><strong>MINI MAP</strong></header><div id="harness-minimap-dock" className="inspector-minimap__viewport" /></section>}
  </section>;
}
