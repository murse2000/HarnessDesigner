import { Cable, Save, X } from "lucide-react";
import { useMemo, useState } from "react";
import { pinConductorCapacity, pinConductorUsage, pinHasConductorCapacity } from "../domain/pinCapacity";
import { createConductorFromDraft, nextWireReference, type PinConnectionDraft } from "../domain/pinmap";
import { useProjectStore } from "../store/projectStore";
import { Field, IconButton } from "./common";

export function PinMapEditDialog() {
  const { snapshot, activeHarnessId, pinMapEditor, closePinMapEditor, updateProject, selectEntity } = useProjectStore();
  const templateWireId = pinMapEditor?.wireId;
  const duplicate = pinMapEditor?.duplicate ?? false;
  const preset = pinMapEditor?.preset;
  const wireId = duplicate ? undefined : templateWireId;
  const harness = snapshot?.project.harnesses.find((item) => item.id === activeHarnessId);
  const wire = harness?.conductors.find((item) => item.id === templateWireId);
  const wireParts = snapshot?.project.parts.filter((part) => part.category === "wire") ?? [];
  const cableParts = snapshot?.project.parts.filter((part) => part.category === "cable") ?? [];
  const connectors = harness?.nodes.filter((node) => node.pins.length > 0) ?? [];
  const initial = useMemo<PinConnectionDraft>(() => ({
    reference: duplicate ? nextWireReference(harness?.conductors ?? []) : wire?.reference ?? nextWireReference(harness?.conductors ?? []),
    fromNodeId: preset?.fromNodeId ?? wire?.from.nodeId ?? "",
    fromPinId: preset?.fromPinId ?? (duplicate ? "" : wire?.from.pinId ?? ""),
    toNodeId: preset?.toNodeId ?? wire?.to.nodeId ?? "",
    toPinId: preset?.toPinId ?? (duplicate ? "" : wire?.to.pinId ?? ""),
    wirePartId: wire?.wirePartId ?? "",
    routeSegmentIds: preset?.routeSegmentIds ?? wire?.routeSegmentIds ?? [],
    color: wire?.color ?? "",
    gauge: wire?.gauge ?? "",
    twistGroup: wire?.twistGroup ?? "",
    startAllowanceMm: wire?.startTermination.allowanceMm ?? 0,
    endAllowanceMm: wire?.endTermination.allowanceMm ?? 0,
    adjustmentMm: wire?.adjustmentMm ?? 0,
  }), [harness, wire]);
  const [draft, setDraft] = useState(initial);
  const [directSegmentLengthMm, setDirectSegmentLengthMm] = useState(0);
  const [directCablePartId, setDirectCablePartId] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!snapshot || !harness || !pinMapEditor) return null;
  const fromNode = connectors.find((node) => node.id === draft.fromNodeId);
  const toNode = connectors.find((node) => node.id === draft.toNodeId);
  const excludedConductorIds = new Set(wireId ? [wireId] : []);

  const pinStatus = (nodeId: string, pinId: string) => {
    const node = connectors.find((item) => item.id === nodeId);
    return {
      usage: pinConductorUsage(harness, nodeId, pinId, excludedConductorIds),
      capacity: pinConductorCapacity(snapshot.project.parts, node, pinId),
    };
  };

  const setField = <K extends keyof PinConnectionDraft>(field: K, value: PinConnectionDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setError(null);
  };
  const selectWirePart = (id: string) => {
    const part = wireParts.find((item) => item.id === id);
    setDraft((current) => ({ ...current, wirePartId: id, color: part?.color ?? current.color, gauge: part?.gauge ?? current.gauge }));
  };
  const saveConnection = async () => {
    const required = [draft.reference, draft.fromNodeId, draft.fromPinId, draft.toNodeId, draft.toPinId, draft.wirePartId];
    if (required.some((value) => !value) || (!draft.routeSegmentIds.length && !preset?.createDirectSegment)) {
      setError("시작·종료 핀, 전선 부품, 통과 구간을 모두 지정하세요.");
      return;
    }
    if (preset?.createDirectSegment && !draft.routeSegmentIds.length && directSegmentLengthMm <= 0) {
      setError("새 직접 구간의 실제 길이를 mm 단위로 입력하세요.");
      return;
    }
    if (draft.fromNodeId === draft.toNodeId && draft.fromPinId === draft.toPinId) {
      setError("같은 핀을 시작과 종료에 동시에 지정할 수 없습니다.");
      return;
    }
    if (!pinHasConductorCapacity(harness, snapshot.project.parts, draft.fromNodeId, draft.fromPinId, excludedConductorIds)
      || !pinHasConductorCapacity(harness, snapshot.project.parts, draft.toNodeId, draft.toPinId, excludedConductorIds)) {
      setError("선택한 핀의 터미널 허용 전선 수를 초과했습니다.");
      return;
    }
    const wirePart = wireParts.find((part) => part.id === draft.wirePartId);
    if (!wirePart) return;
    let savedId = wireId;
    await updateProject((project) => {
      const current = project.harnesses.find((item) => item.id === activeHarnessId);
      if (!current) return;
      let routeSegmentIds = draft.routeSegmentIds;
      if (preset?.createDirectSegment && !routeSegmentIds.length) {
        const existing = current.segments.find((segment) =>
          (segment.fromNodeId === draft.fromNodeId && segment.toNodeId === draft.toNodeId)
          || (segment.fromNodeId === draft.toNodeId && segment.toNodeId === draft.fromNodeId));
        if (existing) routeSegmentIds = [existing.id];
        else {
          const id = crypto.randomUUID();
          let index = current.segments.length + 1;
          const usedLabels = new Set(current.segments.map((segment) => segment.label.toUpperCase()));
          while (usedLabels.has(`SEG ${index}`)) index += 1;
          current.segments.push({ id, fromNodeId: draft.fromNodeId, toNodeId: draft.toNodeId, label: `SEG ${index}`, lengthMm: directSegmentLengthMm, cablePartId: directCablePartId || undefined });
          routeSegmentIds = [id];
        }
      }
      const next = createConductorFromDraft({ ...draft, routeSegmentIds }, current, wirePart, project.parts);
      const existing = current.conductors.find((item) => item.id === wireId);
      if (existing) {
        next.id = existing.id;
        next.startTermination.lugPartId = existing.startTermination.lugPartId;
        next.endTermination.lugPartId = existing.endTermination.lugPartId;
        next.drawingRoute = existing.drawingRoute;
        current.conductors = current.conductors.map((item) => item.id === existing.id ? next : item);
        savedId = existing.id;
      } else {
        current.conductors.push(next);
        savedId = next.id;
      }
    });
    if (savedId) selectEntity(savedId, "conductor");
    closePinMapEditor();
  };

  return <div className="modal-backdrop"><section className="editor-dialog pinmap-editor" role="dialog" aria-modal="true"><header><div><Cable size={15} /><strong>{duplicate ? "핀맵 연결 복제" : wire ? "핀맵 연결 수정" : "핀맵 연결 추가"}</strong><span>전선 양 끝의 커넥터 핀과 통과 구간을 지정합니다.</span></div><IconButton title="닫기" onClick={closePinMapEditor}><X size={14} /></IconButton></header><div className="editor-body"><section><h3>CONNECTION</h3><Field label="Wire Ref."><input value={draft.reference} onChange={(event) => setField("reference", event.target.value)} /></Field><Field label="From"><select value={draft.fromNodeId} onChange={(event) => { setField("fromNodeId", event.target.value); setField("fromPinId", ""); }}><option value="">커넥터 선택</option>{connectors.map((node) => <option key={node.id} value={node.id}>{node.reference} · {node.label}</option>)}</select></Field><Field label="From Pin"><select value={draft.fromPinId} onChange={(event) => setField("fromPinId", event.target.value)} disabled={!fromNode}><option value="">핀 선택</option>{fromNode?.pins.map((pin) => { const status = pinStatus(fromNode.id, pin.id); return <option key={pin.id} value={pin.id} disabled={status.usage >= status.capacity}>{pin.number}{pin.name ? ` · ${pin.name}` : ""} · {status.usage}/{status.capacity}</option>; })}</select></Field><Field label="To"><select value={draft.toNodeId} onChange={(event) => { setField("toNodeId", event.target.value); setField("toPinId", ""); }}><option value="">커넥터 선택</option>{connectors.map((node) => <option key={node.id} value={node.id}>{node.reference} · {node.label}</option>)}</select></Field><Field label="To Pin"><select value={draft.toPinId} onChange={(event) => setField("toPinId", event.target.value)} disabled={!toNode}><option value="">핀 선택</option>{toNode?.pins.map((pin) => { const status = pinStatus(toNode.id, pin.id); return <option key={pin.id} value={pin.id} disabled={status.usage >= status.capacity}>{pin.number}{pin.name ? ` · ${pin.name}` : ""} · {status.usage}/{status.capacity}</option>; })}</select></Field></section><section><h3>WIRE</h3><Field label="Wire Part"><select value={draft.wirePartId} onChange={(event) => selectWirePart(event.target.value)}><option value="">전선 부품 선택</option>{wireParts.map((part) => <option key={part.id} value={part.id}>{part.partNumber} · {part.manufacturer}</option>)}</select></Field><Field label="Color"><input value={draft.color} onChange={(event) => setField("color", event.target.value)} /></Field><Field label="Gauge"><input value={draft.gauge} onChange={(event) => setField("gauge", event.target.value)} /></Field><Field label="Twist"><input value={draft.twistGroup} onChange={(event) => setField("twistGroup", event.target.value)} /></Field><Field label="Start Allow."><input type="number" value={draft.startAllowanceMm} onChange={(event) => setField("startAllowanceMm", Number(event.target.value))} /></Field><Field label="End Allow."><input type="number" value={draft.endAllowanceMm} onChange={(event) => setField("endAllowanceMm", Number(event.target.value))} /></Field><Field label="Adjustment"><input type="number" value={draft.adjustmentMm} onChange={(event) => setField("adjustmentMm", Number(event.target.value))} /></Field></section><section className="route-editor"><h3>ROUTE SEGMENTS</h3>{preset?.createDirectSegment && !draft.routeSegmentIds.length && <div className="route-direct"><strong>새 직접 구간</strong><span>{fromNode?.reference} → {toNode?.reference}</span><Field label="구간 구성"><select value={directCablePartId} onChange={(event) => setDirectCablePartId(event.target.value)}><option value="">개별 단선 묶음</option>{cableParts.map((part) => <option key={part.id} value={part.id}>{part.partNumber} · {part.attributes.construction === "shieldedMultiCore" ? "실드 멀티코어" : part.attributes.construction === "multiCore" ? "멀티코어" : "구조 미지정"}</option>)}</select></Field><Field label="Length (mm)"><input type="number" min="1" value={directSegmentLengthMm || ""} onChange={(event) => { setDirectSegmentLengthMm(Number(event.target.value)); setError(null); }} autoFocus /></Field><small>첫 연결에서만 케이블 부품과 실제 길이를 지정합니다. 이후 핀 연결은 이 구간을 자동으로 사용합니다.</small></div>}{harness.segments.map((segment) => { const cablePart = cableParts.find((part) => part.id === segment.cablePartId); return <label key={segment.id}><input type="checkbox" checked={draft.routeSegmentIds.includes(segment.id)} onChange={() => setField("routeSegmentIds", draft.routeSegmentIds.includes(segment.id) ? draft.routeSegmentIds.filter((id) => id !== segment.id) : [...draft.routeSegmentIds, segment.id])} /><span><strong>{segment.label}</strong><small>{harness.nodes.find((node) => node.id === segment.fromNodeId)?.reference} → {harness.nodes.find((node) => node.id === segment.toNodeId)?.reference}{cablePart ? ` · ${cablePart.partNumber}` : " · 개별 단선"}</small></span><code>{segment.lengthMm} mm</code></label>; })}</section></div>{error && <div className="connector-library-error">{error}</div>}<footer><button onClick={closePinMapEditor}>취소</button><button className="primary" onClick={() => void saveConnection()}><Save size={13} />연결 저장</button></footer></section></div>;
}
