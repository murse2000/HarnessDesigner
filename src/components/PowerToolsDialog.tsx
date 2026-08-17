import { Cable, CircleAlert, RefreshCw, Ruler, Search, Wrench, X } from "lucide-react";
import { useEffect, useState } from "react";
import { conductorLengthMm } from "../domain/calculations";
import { switchConnectorTerminal, terminalSwitchErrors } from "../domain/connectionTools";
import { getCompatibleTerminalIds } from "../domain/parts";
import { conductorsInSegment, duplicatePartGroups, partUsage, unusedParts } from "../domain/powerTools";
import type { PartSnapshot } from "../domain/types";
import { backendInvoke, isTauri } from "../platform";
import { useProjectStore } from "../store/projectStore";
import { IconButton } from "./common";

type ToolTab = "lengths" | "bundles" | "terminals" | "library";

export function PowerToolsDialog({ onClose }: { onClose: () => void }) {
  const { snapshot, activeHarnessId, updateProject, selectEntity } = useProjectStore();
  const [tab, setTab] = useState<ToolTab>("lengths");
  const [segmentId, setSegmentId] = useState("");
  const [partId, setPartId] = useState("");
  const [terminalNodeId, setTerminalNodeId] = useState("");
  const [terminalPartId, setTerminalPartId] = useState("");
  const [terminalScope, setTerminalScope] = useState<"connector" | "harness">("connector");
  const [libraryParts, setLibraryParts] = useState<PartSnapshot[]>([]);
  const [actionMessage, setActionMessage] = useState("");
  useEffect(() => {
    if (isTauri()) void backendInvoke<PartSnapshot[]>("list_library_parts").then(setLibraryParts).catch(() => setLibraryParts([]));
  }, []);
  if (!snapshot) return null;
  const harness = snapshot.project.harnesses.find((item) => item.id === activeHarnessId) ?? snapshot.project.harnesses[0];
  if (!harness) return null;
  const released = harness.releaseStatus === "released";
  const selectedSegmentId = segmentId || harness.segments[0]?.id || "";
  const selectedPartId = partId || snapshot.project.parts[0]?.id || "";
  const projectPartIds = new Set(snapshot.project.parts.map((item) => item.id));
  const availableParts = [...snapshot.project.parts, ...libraryParts.filter((item) => !projectPartIds.has(item.id))];
  const connectors = harness.nodes.filter((node) => node.kind === "connector" && node.partId);
  const selectedTerminalNodeId = terminalNodeId || connectors[0]?.id || "";
  const terminalNode = connectors.find((node) => node.id === selectedTerminalNodeId);
  const housing = availableParts.find((item) => item.id === terminalNode?.partId && item.category === "housing");
  const compatibleTerminalIds = getCompatibleTerminalIds(housing ?? ({ attributes: {} } as PartSnapshot));
  const compatibleTerminals = availableParts.filter((item) => item.category === "terminal" && compatibleTerminalIds.includes(item.id));
  const selectedTerminalPartId = compatibleTerminals.some((item) => item.id === terminalPartId) ? terminalPartId : compatibleTerminals[0]?.id || "";
  const affectedTerminalNodes = terminalScope === "connector" ? (terminalNode ? [terminalNode] : []) : connectors.filter((node) => {
    const nodeHousing = availableParts.find((item) => item.id === node.partId && item.category === "housing");
    return selectedTerminalPartId && getCompatibleTerminalIds(nodeHousing ?? ({ attributes: {} } as PartSnapshot)).includes(selectedTerminalPartId);
  });
  const terminalErrors = selectedTerminalPartId ? affectedTerminalNodes.flatMap((node) => terminalSwitchErrors(snapshot.project, harness.id, node.id, selectedTerminalPartId, availableParts)) : [];
  const affectedCavityCount = affectedTerminalNodes.reduce((count, node) => count + node.pins.length, 0);
  const connectedEndpointCount = harness.conductors.reduce((count, conductor) => count + [conductor.from, conductor.to].filter((endpoint) => affectedTerminalNodes.some((node) => node.id === endpoint.nodeId) && endpoint.pinId).length, 0);
  const segmentConductors = conductorsInSegment(harness, selectedSegmentId);
  const usages = partUsage(snapshot.project);
  const duplicates = duplicatePartGroups(snapshot.project.parts);
  const unused = unusedParts(snapshot.project);
  const updateConductor = (conductorId: string, mutator: (conductor: (typeof harness.conductors)[number]) => void) => void updateProject((project) => {
    const conductor = project.harnesses.find((item) => item.id === harness.id)?.conductors.find((item) => item.id === conductorId);
    if (conductor) mutator(conductor);
  });
  const part = snapshot.project.parts.find((item) => item.id === selectedPartId);
  const whereUsed = usages.filter((item) => item.partId === selectedPartId);
  const applyTerminalSwitch = async () => {
    const target = availableParts.find((item) => item.id === selectedTerminalPartId);
    if (!target || terminalErrors.length) return;
    await updateProject((project) => {
      if (!project.parts.some((item) => item.id === target.id)) project.parts.push(structuredClone(target));
      const sealId = target.attributes.defaultSealPartId;
      const seal = availableParts.find((item) => item.id === sealId);
      if (seal && !project.parts.some((item) => item.id === seal.id)) project.parts.push(structuredClone(seal));
      for (const node of affectedTerminalNodes) switchConnectorTerminal(project, harness.id, node.id, target.id);
    });
    setActionMessage(`${affectedTerminalNodes.length}개 커넥터의 ${affectedCavityCount}개 캐비티 터미널을 ${target.partNumber}으로 교체했습니다.`);
  };

  return <div className="modal-backdrop"><section className="power-tools-dialog" role="dialog" aria-modal="true" aria-label="하네스 파워 도구">
    <header><div><Wrench size={15} /><strong>하네스 파워 도구</strong><span>길이 편집 · 번들 검사 · 터미널 교체 · 부품 진단</span></div><IconButton title="닫기" onClick={onClose}><X size={14} /></IconButton></header>
    <nav><button className={tab === "lengths" ? "active" : ""} onClick={() => setTab("lengths")}><Ruler size={13} />길이 편집</button><button className={tab === "bundles" ? "active" : ""} onClick={() => setTab("bundles")}><Cable size={13} />번들 검사</button><button className={tab === "terminals" ? "active" : ""} onClick={() => { setTab("terminals"); setActionMessage(""); }}><RefreshCw size={13} />터미널 일괄 교체</button><button className={tab === "library" ? "active" : ""} onClick={() => setTab("library")}><Search size={13} />부품 진단</button></nav>
    <main>
      {tab === "lengths" && <><div className="power-tools-summary"><strong>{harness.number}</strong><span>계산 길이를 유지하거나 제조 절단 길이를 직접 지정할 수 있습니다.</span>{released && <em>릴리즈 잠금</em>}</div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Wire</th><th>From → To</th><th className="number">계산/적용 길이</th><th className="number">길이 Override</th><th className="number">From Strip</th><th className="number">To Strip</th><th>Connection Notes</th></tr></thead><tbody>{harness.conductors.map((conductor) => {
        const from = harness.nodes.find((item) => item.id === conductor.from.nodeId); const to = harness.nodes.find((item) => item.id === conductor.to.nodeId);
        return <tr key={conductor.id} onClick={() => selectEntity(conductor.id, "conductor")}><td><strong>{conductor.reference}</strong></td><td>{from?.reference} → {to?.reference}</td><td className="number">{conductorLengthMm(conductor, harness)} mm</td><td><input disabled={released} type="number" min="0" placeholder="자동" value={conductor.overrideLengthMm ?? ""} onChange={(event) => updateConductor(conductor.id, (item) => { item.overrideLengthMm = event.target.value === "" ? undefined : Number(event.target.value); })} /></td><td><input disabled={released} type="number" min="0" value={conductor.startTermination.stripLengthMm ?? 0} onChange={(event) => updateConductor(conductor.id, (item) => { item.startTermination.stripLengthMm = Math.max(0, Number(event.target.value)); })} /></td><td><input disabled={released} type="number" min="0" value={conductor.endTermination.stripLengthMm ?? 0} onChange={(event) => updateConductor(conductor.id, (item) => { item.endTermination.stripLengthMm = Math.max(0, Number(event.target.value)); })} /></td><td><input disabled={released} value={conductor.notes ?? ""} placeholder="제조 메모" onChange={(event) => updateConductor(conductor.id, (item) => { item.notes = event.target.value; })} /></td></tr>;
      })}</tbody></table></div></>}
      {tab === "bundles" && <><div className="power-tools-filter"><label>번들<select value={selectedSegmentId} onChange={(event) => setSegmentId(event.target.value)}>{harness.segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.label} · {segment.lengthMm} mm</option>)}</select></label><span>{segmentConductors.length} CONNECTIONS</span></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Wire</th><th>From</th><th>To</th><th>Color</th><th>Gauge</th><th>Cable Core</th><th>Notes</th></tr></thead><tbody>{segmentConductors.map((conductor) => <tr key={conductor.id} onClick={() => { selectEntity(conductor.id, "conductor"); onClose(); }}><td><strong>{conductor.reference}</strong></td><td>{harness.nodes.find((item) => item.id === conductor.from.nodeId)?.reference}</td><td>{harness.nodes.find((item) => item.id === conductor.to.nodeId)?.reference}</td><td>{conductor.color}</td><td>{conductor.gauge}</td><td>{conductor.cableCoreId ?? "—"}</td><td>{conductor.notes || "—"}</td></tr>)}</tbody></table></div>{!segmentConductors.length && <div className="empty-state">선택한 번들을 통과하는 전선이 없습니다.</div>}</>}
      {tab === "terminals" && <div className="terminal-switch-tool"><div className="power-tools-filter"><label>커넥터<select value={selectedTerminalNodeId} onChange={(event) => { setTerminalNodeId(event.target.value); setTerminalPartId(""); setActionMessage(""); }}>{connectors.map((node) => <option key={node.id} value={node.id}>{node.reference} · {node.label}</option>)}</select></label><span>{affectedTerminalNodes.length} CONNECTORS · {affectedCavityCount} CAVITIES · {connectedEndpointCount} CONNECTED</span></div><section><dl><dt>하우징</dt><dd>{housing ? `${housing.partNumber} · ${housing.manufacturer}` : "미지정"}</dd><dt>현재 터미널</dt><dd>{[...new Set(terminalNode?.pins.map((pin) => availableParts.find((item) => item.id === pin.terminalPartId)?.partNumber ?? "미지정"))].join(", ")}</dd><dt>교체 범위</dt><dd><select value={terminalScope} onChange={(event) => { setTerminalScope(event.target.value as "connector" | "harness"); setActionMessage(""); }}><option value="connector">선택 커넥터 전체 캐비티</option><option value="harness">현재 하네스의 호환 커넥터 전체</option></select></dd><dt>교체 터미널</dt><dd><select value={selectedTerminalPartId} onChange={(event) => { setTerminalPartId(event.target.value); setActionMessage(""); }}><option value="">호환 터미널 선택</option>{compatibleTerminals.map((item) => <option key={item.id} value={item.id}>{item.partNumber} · {item.manufacturer} · {item.gauge || item.attributes.wireRange || "규격 미지정"}</option>)}</select></dd></dl><p>선택 범위의 모든 캐비티와 연결된 전선 종단을 함께 변경합니다. BOM은 변경 즉시 다시 계산됩니다.</p>{terminalErrors.length > 0 && <div className="connector-library-error">{terminalErrors.join(" ")}</div>}{!compatibleTerminals.length && <div className="empty-state">하우징에 등록된 호환 터미널이 없습니다. 부품 라이브러리에서 호환 정보를 먼저 등록하세요.</div>}{actionMessage && <div className="power-tools-success">{actionMessage}</div>}<button className="primary" disabled={released || !selectedTerminalPartId || !affectedTerminalNodes.length || terminalErrors.length > 0} onClick={() => void applyTerminalSwitch()}><RefreshCw size={13} />{affectedTerminalNodes.length}개 커넥터 · {affectedCavityCount}개 캐비티 일괄 교체</button></section></div>}
      {tab === "library" && <div className="library-audit"><section><header><strong>WHERE USED</strong><select value={selectedPartId} onChange={(event) => setPartId(event.target.value)}>{snapshot.project.parts.map((item) => <option key={item.id} value={item.id}>{item.partNumber} · {item.manufacturer}</option>)}</select></header><p>{part?.description}</p>{whereUsed.map((usage, index) => <button key={`${usage.partId}-${index}`}><strong>{usage.harnessNumber} · {usage.reference}</strong><span>{usage.usage}</span></button>)}{!whereUsed.length && <div className="empty-state">현재 프로젝트에서 사용되지 않습니다.</div>}</section><section><header><CircleAlert size={13} /><strong>중복 품번</strong><span>{duplicates.length}</span></header>{duplicates.map((group) => <div key={`${group[0].manufacturer}-${group[0].partNumber}`}><strong>{group[0].manufacturer} · {group[0].partNumber}</strong><span>{group.length}개 등록</span></div>)}{!duplicates.length && <p>중복 품번이 없습니다.</p>}</section><section><header><CircleAlert size={13} /><strong>미사용 부품</strong><span>{unused.length}</span></header>{unused.map((item) => <div key={item.id}><strong>{item.partNumber}</strong><span>{item.manufacturer} · {item.category}</span></div>)}{!unused.length && <p>미사용 부품이 없습니다.</p>}</section></div>}
    </main>
    <footer><span>모든 변경은 프로젝트 실행 취소/다시 실행 기록에 포함됩니다.</span><button onClick={onClose}>닫기</button></footer>
  </section></div>;
}
