import { Cable, Save, X } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { getCableConductors, getCableCores, nextCableRunReference, type CableConductorDefinition } from "../domain/cables";
import { pinConductorCapacity, pinConductorUsage } from "../domain/pinCapacity";
import { resolvePinTermination } from "../domain/parts";
import type { PartSnapshot } from "../domain/types";
import { getWireColorOption } from "../domain/wireColors";
import { backendInvoke, isTauri } from "../platform";
import { useProjectStore } from "../store/projectStore";
import { Field, IconButton } from "./common";

interface CoreMapping extends CableConductorDefinition {
  enabled: boolean;
  fromPinId: string;
  toPinId: string;
}

function resolveCoreColor(value: string) {
  const normalized = value.trim();
  return getWireColorOption(normalized)?.hex ?? (/^#[0-9a-f]{6}$/i.test(normalized) ? normalized : "#8aa1b4");
}

export function CableCoreColorInput({ ariaLabel, disabled, value, onChange }: { ariaLabel: string; disabled: boolean; value: string; onChange: (value: string) => void }) {
  return <div className="cable-core-color-input" style={{ "--wire-color": resolveCoreColor(value) } as CSSProperties}><span className="wire-color-select__swatch" aria-hidden="true" /><input aria-label={ariaLabel} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></div>;
}

export function CableRunDialog() {
  const { snapshot, activeHarnessId, cableRunEditor, closeCableRunEditor, updateProject, selectEntity } = useProjectStore();
  const harness = snapshot?.project.harnesses.find((item) => item.id === activeHarnessId);
  const existingSegment = harness?.segments.find((segment) => segment.id === cableRunEditor?.segmentId);
  const existingPart = snapshot?.project.parts.find((part) => part.id === existingSegment?.cablePartId);
  const existingConductors = harness?.conductors.filter((wire) => wire.cableRunId === existingSegment?.id) ?? [];
  const [libraryParts, setLibraryParts] = useState<PartSnapshot[]>([]);
  const [cablePartId, setCablePartId] = useState(existingSegment?.cablePartId ?? "");
  const [reference, setReference] = useState(() => existingSegment?.label ?? nextCableRunReference(harness?.segments ?? []));
  const [fromNodeId, setFromNodeId] = useState(existingSegment?.fromNodeId ?? "");
  const [toNodeId, setToNodeId] = useState(existingSegment?.toNodeId ?? "");
  const [lengthMm, setLengthMm] = useState(existingSegment ? String(existingSegment.lengthMm) : "");
  const [startHeatShrinkPartId, setStartHeatShrinkPartId] = useState(existingSegment?.startHeatShrinkPartId ?? "");
  const [endHeatShrinkPartId, setEndHeatShrinkPartId] = useState(existingSegment?.endHeatShrinkPartId ?? "");
  const [mappings, setMappings] = useState<CoreMapping[]>(() => existingPart ? getCableConductors(existingPart).map((definition) => {
    const wire = existingConductors.find((item) => item.cableCoreId === definition.id);
    return { ...definition, enabled: Boolean(wire), color: wire?.color ?? definition.color, gauge: wire?.gauge ?? definition.gauge ?? existingPart.gauge ?? "", fromPinId: wire?.from.pinId ?? "", toPinId: wire?.to.pinId ?? "" };
  }) : []);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isTauri()) void backendInvoke<PartSnapshot[]>("list_library_parts").then(setLibraryParts).catch(() => setLibraryParts([]));
  }, []);

  const parts = useMemo(() => {
    const projectParts = snapshot?.project.parts ?? [];
    const projectIds = new Set(projectParts.map((part) => part.id));
    return [...projectParts, ...libraryParts.filter((part) => !projectIds.has(part.id))];
  }, [libraryParts, snapshot?.project.parts]);
  const cableParts = parts.filter((part) => part.category === "cable");
  const heatShrinkParts = parts.filter((part) => part.category === "heatShrink");
  const connectors = harness?.nodes.filter((node) => node.kind === "connector" && node.pins.length > 0) ?? [];
  const cablePart = cableParts.find((part) => part.id === cablePartId);
  const fromNode = connectors.find((node) => node.id === fromNodeId);
  const toNode = connectors.find((node) => node.id === toNodeId);
  const excludedConductorIds = new Set(existingConductors.map((wire) => wire.id));
  const occupiedPinIds = new Set(harness ? connectors.flatMap((node) => node.pins
    .filter((pin) => pinConductorUsage(harness, node.id, pin.id, excludedConductorIds) >= pinConductorCapacity(parts, node, pin.id))
    .map((pin) => pin.id)) : []);

  if (!snapshot || !harness) return null;

  const resetMappings = (partId: string, nextFromNodeId = fromNodeId, nextToNodeId = toNodeId) => {
    const part = cableParts.find((item) => item.id === partId);
    const nextFrom = connectors.find((node) => node.id === nextFromNodeId);
    const nextTo = connectors.find((node) => node.id === nextToNodeId);
    const availablePins = (node: typeof nextFrom) => {
      if (!node) return [];
      const remaining = node.pins.map((pin) => ({ pin, count: Math.max(0, pinConductorCapacity(parts, node, pin.id) - pinConductorUsage(harness, node.id, pin.id, excludedConductorIds)) }));
      return [0, 1].flatMap((slot) => remaining.filter((item) => item.count > slot).map((item) => item.pin));
    };
    const fromPins = availablePins(nextFrom);
    const toPins = availablePins(nextTo);
    let pinIndex = 0;
    setMappings(part ? getCableConductors(part).map((definition) => {
      const enabled = definition.kind === "core";
      const index = enabled ? pinIndex++ : -1;
      return {
        ...definition,
        enabled,
        gauge: definition.gauge || part.gauge || "",
        fromPinId: enabled ? fromPins[index]?.id ?? "" : "",
        toPinId: enabled ? toPins[index]?.id ?? "" : "",
      };
    }) : []);
    setError(null);
  };
  const updateMapping = <K extends keyof CoreMapping>(id: string, field: K, value: CoreMapping[K]) => {
    setMappings((current) => current.map((mapping) => mapping.id === id ? { ...mapping, [field]: value } : mapping));
    setError(null);
  };
  const mappingPinStatus = (node: typeof fromNode, side: "fromPinId" | "toPinId", pinId: string, mappingId: string) => {
    if (!node) return { usage: 0, capacity: 1 };
    const externalUsage = pinConductorUsage(harness, node.id, pinId, excludedConductorIds);
    const mappingUsage = mappings.filter((mapping) => mapping.enabled && mapping.id !== mappingId && mapping[side] === pinId).length;
    return { usage: externalUsage + mappingUsage, capacity: pinConductorCapacity(parts, node, pinId) };
  };
  const addProjectPart = (projectParts: PartSnapshot[], id: string) => {
    if (!id || projectParts.some((part) => part.id === id)) return;
    const part = libraryParts.find((item) => item.id === id);
    if (part) projectParts.push(structuredClone(part));
  };
  const saveRun = async () => {
    if (!cablePart || !reference.trim() || !fromNode || !toNode || fromNode.id === toNode.id || !Number.isFinite(Number(lengthMm)) || Number(lengthMm) <= 0) {
      setError("케이블 부품, 서로 다른 양끝 하우징, 참조명, 실제 길이를 지정하세요.");
      return;
    }
    const enabledMappings = mappings.filter((mapping) => mapping.enabled);
    if (!enabledMappings.length) {
      setError("사용할 코어 또는 실드/드레인 결선을 하나 이상 선택하세요.");
      return;
    }
    if (enabledMappings.some((mapping) => !mapping.color.trim() || !mapping.gauge.trim()
      || (mapping.kind === "core" && (!mapping.fromPinId || !mapping.toPinId))
      || (mapping.kind === "shield" && !mapping.fromPinId && !mapping.toPinId))) {
      setError("사용 코어는 양끝 핀을, 실드/드레인은 한쪽 이상의 핀과 색상·굵기를 지정하세요.");
      return;
    }
    const capacityExceeded = enabledMappings.some((mapping) => {
      const from = mapping.fromPinId ? mappingPinStatus(fromNode, "fromPinId", mapping.fromPinId, mapping.id) : null;
      const to = mapping.toPinId ? mappingPinStatus(toNode, "toPinId", mapping.toPinId, mapping.id) : null;
      return Boolean((from && from.usage >= from.capacity) || (to && to.usage >= to.capacity));
    });
    if (capacityExceeded) {
      setError("선택한 핀의 터미널 허용 전선 수를 초과했습니다.");
      return;
    }
    let segmentId = "";
    await updateProject((project) => {
      const current = project.harnesses.find((item) => item.id === activeHarnessId);
      if (!current) return;
      addProjectPart(project.parts, cablePart.id);
      addProjectPart(project.parts, startHeatShrinkPartId);
      addProjectPart(project.parts, endHeatShrinkPartId);
      segmentId = existingSegment?.id ?? crypto.randomUUID();
      const nextSegment = {
        id: segmentId,
        fromNodeId: fromNode.id,
        toNodeId: toNode.id,
        lengthMm: Number(lengthMm),
        label: reference.trim(),
        cablePartId: cablePart.id,
        startHeatShrinkPartId: startHeatShrinkPartId || undefined,
        endHeatShrinkPartId: endHeatShrinkPartId || undefined,
      };
      if (existingSegment) current.segments = current.segments.map((segment) => segment.id === segmentId ? nextSegment : segment);
      else current.segments.push(nextSegment);
      const previousConductors = current.conductors.filter((wire) => wire.cableRunId === segmentId);
      current.conductors = current.conductors.filter((wire) => wire.cableRunId !== segmentId);
      for (const mapping of enabledMappings) {
        const fromTermination = resolvePinTermination(project.parts, fromNode, mapping.fromPinId);
        const toTermination = resolvePinTermination(project.parts, toNode, mapping.toPinId);
        current.conductors.push({
          id: previousConductors.find((wire) => wire.cableCoreId === mapping.id)?.id ?? crypto.randomUUID(),
          reference: `${reference.trim()}:${mapping.number}`,
          from: { nodeId: fromNode.id, ...(mapping.fromPinId ? { pinId: mapping.fromPinId } : {}) },
          to: { nodeId: toNode.id, ...(mapping.toPinId ? { pinId: mapping.toPinId } : {}) },
          wirePartId: cablePart.id,
          color: mapping.color.trim(),
          gauge: mapping.gauge.trim(),
          routeSegmentIds: [segmentId],
          startTermination: { ...fromTermination, allowanceMm: 0 },
          endTermination: { ...toTermination, allowanceMm: 0 },
          adjustmentMm: 0,
          cableRunId: segmentId,
          cableCoreId: mapping.id,
          shieldGroup: mapping.kind === "shield" ? `${reference.trim()}:SHIELD` : undefined,
        });
      }
    });
    selectEntity(segmentId, "segment");
    closeCableRunEditor();
  };

  return <div className="modal-backdrop"><section className="editor-dialog cable-run-dialog" role="dialog" aria-modal="true"><header><div><Cable size={15} /><strong>{existingSegment ? "멀티코어 케이블 수정" : "멀티코어 케이블 추가"}</strong><span>케이블 부품을 선택하고 사용할 코어와 실드/드레인 결선을 지정합니다.</span></div><IconButton title="닫기" onClick={closeCableRunEditor}><X size={14} /></IconButton></header><div className="cable-run-body"><section><h3>CABLE RUN</h3><Field label="Cable Part"><select value={cablePartId} onChange={(event) => { setCablePartId(event.target.value); resetMappings(event.target.value); }}><option value="">케이블 부품 선택</option>{cableParts.map((part) => <option key={part.id} value={part.id}>{part.partNumber} · {part.manufacturer} · {part.attributes.coreCount ?? "?"}C</option>)}</select></Field><Field label="Reference"><input value={reference} onChange={(event) => setReference(event.target.value)} /></Field><Field label="From Housing"><select value={fromNodeId} onChange={(event) => { setFromNodeId(event.target.value); resetMappings(cablePartId, event.target.value, toNodeId); }}><option value="">하우징 선택</option>{connectors.map((node) => <option key={node.id} value={node.id}>{node.reference} · {node.label}</option>)}</select></Field><Field label="To Housing"><select value={toNodeId} onChange={(event) => { setToNodeId(event.target.value); resetMappings(cablePartId, fromNodeId, event.target.value); }}><option value="">하우징 선택</option>{connectors.map((node) => <option key={node.id} value={node.id}>{node.reference} · {node.label}</option>)}</select></Field><Field label="Length (mm)"><input type="number" min="1" value={lengthMm} onChange={(event) => setLengthMm(event.target.value)} /></Field><Field label="Start Heat Shrink"><select value={startHeatShrinkPartId} onChange={(event) => setStartHeatShrinkPartId(event.target.value)}><option value="">지정 안 함</option>{heatShrinkParts.map((part) => <option key={part.id} value={part.id}>{part.partNumber} · {part.manufacturer}</option>)}</select></Field><Field label="End Heat Shrink"><select value={endHeatShrinkPartId} onChange={(event) => setEndHeatShrinkPartId(event.target.value)}><option value="">지정 안 함</option>{heatShrinkParts.map((part) => <option key={part.id} value={part.id}>{part.partNumber} · {part.manufacturer}</option>)}</select></Field>{cablePart && <dl className="cable-run-spec"><dt>구조</dt><dd>{cablePart.attributes.construction === "shieldedMultiCore" ? "실드 멀티코어" : "멀티코어"}</dd><dt>외경</dt><dd>{cablePart.attributes.outerDiameterMm ?? "—"} mm</dd><dt>코어</dt><dd>{getCableCores(cablePart).length}</dd></dl>}</section><section className="cable-core-mapping"><h3>CORE PIN MAPPING <span>{mappings.filter((mapping) => mapping.enabled).length} / {mappings.length}</span></h3>{!cablePart ? <p>먼저 케이블 부품을 선택하세요.</p> : <table className="data-table"><thead><tr><th className="cable-core-use">사용</th><th>Core</th><th>Name</th><th>Color</th><th>Gauge</th><th>{fromNode?.reference ?? "From"} Pin</th><th>{toNode?.reference ?? "To"} Pin</th></tr></thead><tbody>{mappings.map((mapping) => <tr key={mapping.id} className={`${mapping.enabled ? "" : "is-unused"} ${mapping.kind === "shield" ? "is-shield" : ""}`}><td className="cable-core-use"><input type="checkbox" checked={mapping.enabled} aria-label={`${mapping.name} 사용`} onChange={(event) => updateMapping(mapping.id, "enabled", event.target.checked)} /></td><td>{mapping.number}</td><td>{mapping.name}</td><td><CableCoreColorInput ariaLabel={`${mapping.name} 색상`} value={mapping.color} disabled={!mapping.enabled} onChange={(value) => updateMapping(mapping.id, "color", value)} /></td><td><input value={mapping.gauge} disabled={!mapping.enabled} placeholder="예: 20 AWG" onChange={(event) => updateMapping(mapping.id, "gauge", event.target.value)} /></td><td><select value={mapping.fromPinId} disabled={!fromNode || !mapping.enabled} onChange={(event) => updateMapping(mapping.id, "fromPinId", event.target.value)}><option value="">{fromNode ? "핀 선택" : "From Housing 먼저 선택"}</option>{fromNode?.pins.map((pin) => <option key={pin.id} value={pin.id} disabled={occupiedPinIds.has(pin.id)}>{pin.number}{pin.name ? ` · ${pin.name}` : ""}</option>)}</select></td><td><select value={mapping.toPinId} disabled={!toNode || !mapping.enabled} onChange={(event) => updateMapping(mapping.id, "toPinId", event.target.value)}><option value="">{toNode ? "핀 선택" : "To Housing 먼저 선택"}</option>{toNode?.pins.map((pin) => <option key={pin.id} value={pin.id} disabled={occupiedPinIds.has(pin.id)}>{pin.number}{pin.name ? ` · ${pin.name}` : ""}</option>)}</select></td></tr>)}</tbody></table>}</section></div>{error && <div className="connector-library-error">{error}</div>}<footer><button onClick={closeCableRunEditor}>취소</button><button className="primary" onClick={() => void saveRun()} disabled={!cableParts.length}><Save size={13} />{existingSegment ? "케이블 런 수정 저장" : "케이블 런 생성"}</button></footer></section></div>;
}
