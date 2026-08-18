import { open } from "@tauri-apps/plugin-dialog";
import { Boxes, ExternalLink, FileInput, PackagePlus, Search, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { applyConnectorRemap, connectorRemapErrors, connectorRemapPlan, type ConnectorRemapGroup } from "../domain/connectionTools";
import type { ModelAsset, PartSnapshot, PinDefinition, SymbolAsset } from "../domain/types";
import { createPinsFromPart, getCompatibleClampIds, getCompatibleTerminalIds, getPartName, getPartPinCount, isConnectorClampPart, nextConnectorReference, resolvePinTermination } from "../domain/parts";
import type { CadImportResult } from "../import/cadImport";
import { importCad } from "../import/cadImport";
import { backendInvoke, isTauri } from "../platform";
import { loadAppPreferences } from "../preferences";
import { useProjectStore } from "../store/projectStore";
import { hydrateLibraryModelAsset } from "../three/modelAssetHydration";
import { getModelPlacement } from "../three/modelPlacement";
import { createStepProjectionSymbol, type StepProjectionView } from "../three/stepProjection";
import { CadImportDialog } from "./CadImportDialog";
import { IconButton } from "./common";
import { PartRegistrationDialog } from "./PartRegistrationDialog";
import { PartThumbnail } from "./PartThumbnail";

type LibraryItem = { part: PartSnapshot; source: "공용 라이브러리" | "프로젝트" };
type PendingRemap = { part: PartSnapshot; clampPart: PartSnapshot | null; pins: PinDefinition[]; modelAsset: ModelAsset | null; symbolAsset: SymbolAsset | null; groups: ConnectorRemapGroup[] };
const resourceAttributeKeys = new Set(["officialImageUrl", "drawingUrl", "cadReferenceUrl", "sourceUrl"]);

function getPartResources(part: PartSnapshot) {
  return [
    ["제품 페이지", part.attributes.sourceUrl],
    ["공식 도면", part.attributes.drawingUrl],
    ["공식 3D 자료", part.attributes.cadReferenceUrl],
  ].filter((item): item is [string, string] => Boolean(item[1]));
}

export function ConnectorLibraryDialog() {
  const { snapshot, activeHarnessId, connectorPicker, closeConnectorPicker, updateProject, selectEntity } = useProjectStore();
  const [libraryParts, setLibraryParts] = useState<PartSnapshot[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedClampId, setSelectedClampId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cadResult, setCadResult] = useState<CadImportResult | null>(null);
  const [registeringPart, setRegisteringPart] = useState(false);
  const [pendingRemap, setPendingRemap] = useState<PendingRemap | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    void backendInvoke<PartSnapshot[]>("list_library_parts")
      .then(setLibraryParts)
      .catch((reason) => setError(`공용 부품 라이브러리를 읽지 못했습니다: ${String(reason)}`));
  }, []);

  const items = useMemo<LibraryItem[]>(() => {
    if (!snapshot) return [];
    const projectParts = snapshot.project.parts.filter((part) => part.category === "housing");
    const projectIds = new Set(projectParts.map((part) => part.id));
    const combined: LibraryItem[] = [
      ...libraryParts.filter((part) => part.category === "housing" && !projectIds.has(part.id)).map((part) => ({ part, source: "공용 라이브러리" as const })),
      ...projectParts.map((part) => ({ part, source: "프로젝트" as const })),
    ];
    const needle = query.trim().toLowerCase();
    return combined.filter(({ part }) => !needle || `${getPartName(part)} ${part.partNumber} ${part.manufacturer} ${part.description}`.toLowerCase().includes(needle));
  }, [libraryParts, query, snapshot]);
  const selected = items.find(({ part }) => part.id === selectedId) ?? null;
  const allParts = useMemo(() => {
    if (!snapshot) return libraryParts;
    const projectIds = new Set(snapshot.project.parts.map((part) => part.id));
    return [...snapshot.project.parts, ...libraryParts.filter((part) => !projectIds.has(part.id))];
  }, [libraryParts, snapshot]);
  const compatibleClamps = useMemo(() => {
    const compatibleIds = new Set(selected ? getCompatibleClampIds(selected.part) : []);
    return allParts.filter((part) => compatibleIds.has(part.id) && isConnectorClampPart(part));
  }, [allParts, selected]);
  const selectedResources = selected ? getPartResources(selected.part) : [];

  useEffect(() => {
    if (connectorPicker?.partId && items.some(({ part }) => part.id === connectorPicker.partId)) setSelectedId(connectorPicker.partId);
    else if (!selectedId && items[0]) setSelectedId(items[0].part.id);
  }, [connectorPicker?.partId, items, selectedId]);

  useEffect(() => {
    if (!snapshot || !connectorPicker || !selected) return;
    if (connectorPicker.mode !== "replace" || !connectorPicker.nodeId) {
      setSelectedClampId("");
      return;
    }
    const harness = snapshot.project.harnesses.find((item) => item.id === activeHarnessId);
    const compatibleIds = new Set(compatibleClamps.map((part) => part.id));
    const currentClamp = harness?.accessories.find((accessory) => accessory.nodeId === connectorPicker.nodeId && compatibleIds.has(accessory.partId));
    setSelectedClampId(currentClamp?.partId ?? "");
  }, [activeHarnessId, compatibleClamps, connectorPicker, selected, snapshot]);

  if (!snapshot || !connectorPicker) return null;

  const openCad = async () => {
    if (!isTauri()) return;
    const path = await open({ multiple: false, defaultPath: loadAppPreferences().defaultImportDirectory || undefined, filters: [{ name: "2D CAD", extensions: ["dxf", "svg"] }] });
    if (!path) return;
    const source = await backendInvoke<string>("read_text_file", { path });
    setCadResult(importCad(source, path.split(/[\\/]/).pop() ?? "symbol"));
  };

  const commitPart = async (part: PartSnapshot, clampPart: PartSnapshot | null, pins: PinDefinition[], modelAsset: ModelAsset | null, symbolAsset: SymbolAsset | null, remapGroups?: ConnectorRemapGroup[]) => {
    let createdNodeId: string | undefined;
    await updateProject((project) => {
      let projectPart = project.parts.find((item) => item.id === part.id);
      if (!projectPart) {
        projectPart = structuredClone(part);
        project.parts.push(projectPart);
      }
      let projectClamp = clampPart ? project.parts.find((item) => item.id === clampPart.id) : undefined;
      if (clampPart && !projectClamp) {
        projectClamp = structuredClone(clampPart);
        project.parts.push(projectClamp);
      }
      if (modelAsset && !project.modelAssets.some((item) => item.id === modelAsset.id)) project.modelAssets.push(structuredClone(modelAsset));
      if (symbolAsset && !project.assets.some((item) => item.id === symbolAsset.id)) project.assets.push(structuredClone(symbolAsset));
      for (const terminalId of getCompatibleTerminalIds(projectPart)) {
        let terminal = project.parts.find((item) => item.id === terminalId);
        if (!terminal) {
          terminal = libraryParts.find((item) => item.id === terminalId);
          if (terminal) project.parts.push(structuredClone(terminal));
        }
        if (terminal) {
          const sealId = terminal.attributes.defaultSealPartId;
          const seal = libraryParts.find((item) => item.id === sealId);
          if (seal && !project.parts.some((item) => item.id === seal.id)) project.parts.push(structuredClone(seal));
        }
      }
      const current = project.harnesses.find((item) => item.id === activeHarnessId);
      if (!current) return;
      const applyClamp = (nodeId: string, reference: string) => {
        current.accessories = current.accessories.filter((accessory) => accessory.nodeId !== nodeId || !isConnectorClampPart(project.parts.find((item) => item.id === accessory.partId)));
        if (projectClamp) current.accessories.push({ id: crypto.randomUUID(), partId: projectClamp.id, quantity: 1, nodeId, note: `${reference} 커넥터 클램프` });
      };
      if (connectorPicker.mode === "replace" && connectorPicker.nodeId) {
        const node = current.nodes.find((item) => item.id === connectorPicker.nodeId);
        if (!node) return;
        const groups = remapGroups ?? connectorRemapPlan(current, node.id, pins);
        applyConnectorRemap(current, node.id, pins, groups);
        node.partId = projectPart.id;
        applyClamp(node.id, node.reference);
        for (const wire of current.conductors) {
          for (const [side, endpoint] of [["startTermination", wire.from], ["endTermination", wire.to]] as const) {
            if (endpoint.nodeId !== node.id || !endpoint.pinId) continue;
            wire[side] = { ...wire[side], ...resolvePinTermination(project.parts, node, endpoint.pinId) };
          }
        }
        createdNodeId = node.id;
        return;
      }
      const connectorIndex = current.nodes.filter((node) => node.kind === "connector").length;
      createdNodeId = crypto.randomUUID();
      current.nodes.push({
        id: createdNodeId,
        kind: "connector",
        reference: nextConnectorReference(current.nodes),
        label: getPartName(projectPart),
        partId: projectPart.id,
        position: { x: 180 + (connectorIndex % 5) * 150, y: 150 + Math.floor(connectorIndex / 5) * 110 },
        pins,
      });
      applyClamp(createdNodeId, current.nodes[current.nodes.length - 1].reference);
    });
    if (createdNodeId) selectEntity(createdNodeId, "node");
    closeConnectorPicker();
  };

  const usePart = async (part: PartSnapshot) => {
    const pins = createPinsFromPart(part);
    if (!pins.length) {
      setError("핀 정보가 없는 하우징은 커넥터로 배치할 수 없습니다.");
      return;
    }
    const harness = snapshot.project.harnesses.find((item) => item.id === activeHarnessId);
    if (!harness) return;
    const clampPart = selectedClampId ? compatibleClamps.find((item) => item.id === selectedClampId) ?? null : null;
    let resolvedPart = part;
    let modelAsset: ModelAsset | null = snapshot.project.modelAssets.find((item) => item.id === part.modelAssetId) ?? null;
    let symbolAsset: SymbolAsset | null = snapshot.project.assets.find((item) => item.id === part.symbolAssetId) ?? null;
    if (part.modelAssetId && !snapshot.project.modelAssets.some((item) => item.id === part.modelAssetId) && isTauri()) {
      try {
        modelAsset = await backendInvoke<ModelAsset | null>("get_library_model_asset", { assetId: part.modelAssetId });
        if (modelAsset) modelAsset = await hydrateLibraryModelAsset(modelAsset);
      } catch (reason) {
        setError(`3D 부품 자산을 읽지 못했습니다: ${String(reason)}`);
        return;
      }
    }
    if (part.symbolAssetId && !snapshot.project.assets.some((item) => item.id === part.symbolAssetId) && isTauri()) {
      try {
        symbolAsset = await backendInvoke<SymbolAsset | null>("get_library_symbol_asset", { assetId: part.symbolAssetId });
      } catch (reason) {
        setError(`도면 부품 자산을 읽지 못했습니다: ${String(reason)}`);
        return;
      }
    }
    if (!part.symbolAssetId && modelAsset) {
      const savedView = part.attributes.stepProjectionView;
      const view: StepProjectionView = savedView === "back" || savedView === "left" || savedView === "right" || savedView === "top" || savedView === "bottom" ? savedView : "front";
      try {
        symbolAsset = createStepProjectionSymbol(modelAsset, view, getModelPlacement(part).scale);
        resolvedPart = { ...part, symbolAssetId: symbolAsset.id, attributes: { ...part.attributes, stepProjectionView: view }, sourceLibraryRevision: (part.sourceLibraryRevision ?? 0) + 1 };
        if (isTauri()) {
          await backendInvoke("upsert_library_symbol_asset", { asset: symbolAsset });
          await backendInvoke("upsert_library_part", { part: resolvedPart });
        }
        setLibraryParts((current) => current.map((item) => item.id === part.id ? resolvedPart : item));
      } catch (reason) {
        setError(`STEP 2D 도면을 생성하지 못했습니다: ${String(reason)}`);
        return;
      }
    }
    if (connectorPicker.mode === "replace" && connectorPicker.nodeId) {
      const node = harness.nodes.find((item) => item.id === connectorPicker.nodeId);
      if (!node) return;
      const groups = connectorRemapPlan(harness, node.id, pins);
      const allParts = [...snapshot.project.parts, ...libraryParts.filter((item) => !snapshot.project.parts.some((partItem) => partItem.id === item.id))];
      const errors = connectorRemapErrors(groups, pins, allParts);
      if (errors.length) {
        setError(errors.join(" "));
        return;
      }
      const newNumbers = new Set(pins.map((pin) => pin.number));
      if (groups.some((group) => !newNumbers.has(group.oldPinNumber))) {
        setPendingRemap({ part: resolvedPart, clampPart, pins, modelAsset, symbolAsset, groups });
        return;
      }
      await commitPart(resolvedPart, clampPart, pins, modelAsset, symbolAsset, groups);
      return;
    }
    await commitPart(resolvedPart, clampPart, pins, modelAsset, symbolAsset);
  };

  const pendingErrors = pendingRemap ? connectorRemapErrors(pendingRemap.groups, pendingRemap.pins, [...snapshot.project.parts, ...libraryParts]) : [];

  return <div className="modal-backdrop"><section className="connector-library-dialog" role="dialog" aria-modal="true" aria-label="커넥터 부품 선택">
    <header><div><Boxes size={16} /><strong>{connectorPicker.mode === "replace" ? "커넥터 부품 변경" : "부품 라이브러리에서 커넥터 추가"}</strong><span>하우징 부품을 선택하면 등록된 핀 정보와 함께 배치됩니다.</span></div><IconButton title="닫기" onClick={closeConnectorPicker}><X size={14} /></IconButton></header>
    <div className="connector-library-tools"><div className="library-search"><Search size={13} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="파트명, 파트번호, 제조사, 설명 검색" /></div><button onClick={() => setRegisteringPart(true)}><PackagePlus size={13} />부품 등록</button><button onClick={() => void openCad()}><FileInput size={13} />CAD 등록</button><span>{items.length} PARTS</span></div>
    <div className="connector-library-body">
      <div className="connector-library-table"><table className="data-table"><thead><tr><th>파트명</th><th>파트번호</th><th>제조사</th><th>핀 수</th><th>3D</th><th>Rev.</th><th>설명</th><th>출처</th></tr></thead><tbody>{items.map(({ part, source }) => <tr key={`${source}-${part.id}`} className={selected?.part.id === part.id ? "is-selected" : ""} onClick={() => { setSelectedId(part.id); setError(null); }} onDoubleClick={() => void usePart(part)}><td><strong>{getPartName(part)}</strong></td><td><code>{part.partNumber}</code></td><td>{part.manufacturer || "—"}</td><td className="number">{getPartPinCount(part)}</td><td>{part.modelAssetId ? "STEP" : part.attributes.cadReferenceUrl ? "자료" : "—"}</td><td>{part.revision}</td><td>{part.description}</td><td><span className="category-pill">{source}</span></td></tr>)}</tbody></table>{!items.length && <div className="empty-state">조건에 맞는 하우징 부품이 없습니다.</div>}</div>
      <aside>{selected ? <>
        <div className="part-detail-title"><PartThumbnail part={selected.part} project={snapshot.project} /><div><strong>{getPartName(selected.part)}</strong><code>{selected.part.partNumber}</code></div></div>
        <dl>
          <dt>제조사</dt><dd>{selected.part.manufacturer || "—"}</dd>
          <dt>핀 수</dt><dd>{getPartPinCount(selected.part)} pins</dd>
          <dt>3D 모델</dt><dd>{selected.part.modelAssetId ? "STEP 등록됨" : selected.part.attributes.cadReferenceUrl ? "공식 3D 자료" : "미등록"}</dd>
          <dt>Revision</dt><dd>{selected.part.revision}</dd>
          <dt>설명</dt><dd>{selected.part.description || "—"}</dd>
          <dt>제조사 자료</dt><dd className="part-resource-links">{selectedResources.length ? selectedResources.map(([label, url]) => <a key={label} href={url} target="_blank" rel="noreferrer"><ExternalLink size={11} />{label}</a>) : "등록 자료 없음"}</dd>
          <dt>호환 터미널</dt><dd>{getCompatibleTerminalIds(selected.part).map((id) => allParts.find((part) => part.id === id)).filter(Boolean).map((part) => part!.partNumber).join(", ") || "미지정"}</dd>
          <dt>호환 클램프</dt><dd className="connector-clamp-selector"><select value={selectedClampId} onChange={(event) => setSelectedClampId(event.target.value)}><option value="">선택 안 함</option>{compatibleClamps.map((part) => <option key={part.id} value={part.id}>{part.partNumber} · {getPartName(part)}</option>)}</select><small>{compatibleClamps.length ? `${compatibleClamps.length}개 호환 부품` : selected.part.manufacturer.toLowerCase() === "molex" ? "공식 호환 관계가 등록된 클램프가 없습니다." : "등록된 호환 클램프가 없습니다."}</small></dd>
          {Object.entries(selected.part.attributes).filter(([key]) => !resourceAttributeKeys.has(key) && !["pinMap", "compatibleTerminalPartIds", "compatibleClampPartIds", "defaultTerminalPartId"].includes(key)).map(([key, value]) => <Fragment key={key}><dt>{key}</dt><dd>{value}</dd></Fragment>)}
        </dl>
      </> : <div className="empty-state">부품을 선택하세요.</div>}</aside>
    </div>
    {error && <div className="connector-library-error">{error}</div>}
    <footer><button onClick={closeConnectorPicker}>취소</button><button className="primary" disabled={!selected || !getPartPinCount(selected.part)} onClick={() => selected && void usePart(selected.part)}>{connectorPicker.mode === "replace" ? "선택 부품으로 변경" : "선택 부품 배치"}</button></footer>
  </section>{pendingRemap && <div className="modal-backdrop"><section className="connector-remap-dialog" role="dialog" aria-modal="true" aria-label="연결 자동 재매핑"><header><div><strong>연결 자동 재매핑</strong><span>{pendingRemap.part.partNumber}의 핀 번호가 달라 자동 배정한 결과입니다.</span></div><IconButton title="닫기" onClick={() => setPendingRemap(null)}><X size={14} /></IconButton></header><div className="data-table-wrap"><table className="data-table"><thead><tr><th>기존 핀</th><th>연결</th><th>새 핀</th></tr></thead><tbody>{pendingRemap.groups.map((group) => <tr key={group.oldPinId}><td><strong>{group.oldPinNumber}</strong></td><td>{group.conductorIds.map((id) => snapshot.project.harnesses.find((item) => item.id === activeHarnessId)?.conductors.find((wire) => wire.id === id)?.reference).filter(Boolean).join(", ")}</td><td><select value={group.targetPinId ?? ""} onChange={(event) => setPendingRemap((current) => current ? { ...current, groups: current.groups.map((item) => item.oldPinId === group.oldPinId ? { ...item, targetPinId: event.target.value || undefined } : item) } : null)}><option value="">핀 선택</option>{pendingRemap.pins.map((pin) => <option key={pin.id} value={pin.id}>{pin.number}{pin.name ? ` · ${pin.name}` : ""}</option>)}</select></td></tr>)}</tbody></table></div>{pendingErrors.length > 0 && <div className="connector-library-error">{pendingErrors.join(" ")}</div>}<footer><button onClick={() => setPendingRemap(null)}>취소</button><button className="primary" disabled={pendingErrors.length > 0} onClick={() => { const current = pendingRemap; setPendingRemap(null); void commitPart(current.part, current.clampPart, current.pins, current.modelAsset, current.symbolAsset, current.groups); }}>재매핑 후 부품 변경</button></footer></section></div>}{registeringPart && <PartRegistrationDialog onClose={() => setRegisteringPart(false)} onSaved={(saved) => { setLibraryParts((current) => [...current.filter((part) => !saved.some((item) => item.id === part.id)), ...saved]); const housing = saved.find((part) => part.category === "housing"); if (housing) setSelectedId(housing.id); }} />}{cadResult && <CadImportDialog result={cadResult} onClose={() => setCadResult(null)} onSaved={(part, relatedParts) => { setLibraryParts((current) => [...current.filter((item) => ![part, ...relatedParts].some((saved) => saved.id === item.id)), ...relatedParts, part]); setSelectedId(part.id); }} />}</div>;
}
