import { open } from "@tauri-apps/plugin-dialog";
import { Boxes, FileInput, PackagePlus, Search, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import type { ModelAsset, PartSnapshot, SymbolAsset } from "../domain/types";
import { createPinsFromPart, getCompatibleTerminalIds, getPartName, getPartPinCount, nextConnectorReference } from "../domain/parts";
import type { CadImportResult } from "../import/cadImport";
import { importCad } from "../import/cadImport";
import { backendInvoke, isTauri } from "../platform";
import { loadAppPreferences } from "../preferences";
import { useProjectStore } from "../store/projectStore";
import { CadImportDialog } from "./CadImportDialog";
import { IconButton } from "./common";
import { PartRegistrationDialog } from "./PartRegistrationDialog";
import { PartThumbnail } from "./PartThumbnail";

type LibraryItem = { part: PartSnapshot; source: "공용 라이브러리" | "프로젝트" };

export function ConnectorLibraryDialog() {
  const { snapshot, activeHarnessId, connectorPicker, closeConnectorPicker, updateProject, selectEntity } = useProjectStore();
  const [libraryParts, setLibraryParts] = useState<PartSnapshot[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cadResult, setCadResult] = useState<CadImportResult | null>(null);
  const [registeringPart, setRegisteringPart] = useState(false);

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

  useEffect(() => {
    if (connectorPicker?.partId && items.some(({ part }) => part.id === connectorPicker.partId)) setSelectedId(connectorPicker.partId);
    else if (!selectedId && items[0]) setSelectedId(items[0].part.id);
  }, [connectorPicker?.partId, items, selectedId]);

  if (!snapshot || !connectorPicker) return null;

  const openCad = async () => {
    if (!isTauri()) return;
    const path = await open({ multiple: false, defaultPath: loadAppPreferences().defaultImportDirectory || undefined, filters: [{ name: "2D CAD", extensions: ["dxf", "svg"] }] });
    if (!path) return;
    const source = await backendInvoke<string>("read_text_file", { path });
    setCadResult(importCad(source, path.split(/[\\/]/).pop() ?? "symbol"));
  };

  const usePart = async (part: PartSnapshot) => {
    const pins = createPinsFromPart(part);
    if (!pins.length) {
      setError("핀 정보가 없는 하우징은 커넥터로 배치할 수 없습니다.");
      return;
    }
    const harness = snapshot.project.harnesses.find((item) => item.id === activeHarnessId);
    if (!harness) return;
    let modelAsset: ModelAsset | null = null;
    let symbolAsset: SymbolAsset | null = null;
    if (part.modelAssetId && !snapshot.project.modelAssets.some((item) => item.id === part.modelAssetId) && isTauri()) {
      try {
        modelAsset = await backendInvoke<ModelAsset | null>("get_library_model_asset", { assetId: part.modelAssetId });
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

    if (connectorPicker.mode === "replace" && connectorPicker.nodeId) {
      const node = harness.nodes.find((item) => item.id === connectorPicker.nodeId);
      if (!node) return;
      const connectedPinIds = new Set(harness.conductors.flatMap((wire) => [wire.from, wire.to]).filter((end) => end.nodeId === node.id && end.pinId).map((end) => end.pinId!));
      const connectedNumbers = node.pins.filter((pin) => connectedPinIds.has(pin.id)).map((pin) => pin.number);
      const newNumbers = new Set(pins.map((pin) => pin.number));
      const missing = connectedNumbers.filter((number) => !newNumbers.has(number));
      if (missing.length) {
        setError(`연결된 핀 ${missing.join(", ")}이 새 부품에 없어 변경할 수 없습니다.`);
        return;
      }
    }

    let createdNodeId: string | undefined;
    await updateProject((project) => {
      let projectPart = project.parts.find((item) => item.id === part.id);
      if (!projectPart) {
        projectPart = structuredClone(part);
        project.parts.push(projectPart);
      }
      if (modelAsset && !project.modelAssets.some((item) => item.id === modelAsset.id)) project.modelAssets.push(structuredClone(modelAsset));
      if (symbolAsset && !project.assets.some((item) => item.id === symbolAsset.id)) project.assets.push(structuredClone(symbolAsset));
      for (const terminalId of getCompatibleTerminalIds(projectPart)) {
        if (project.parts.some((item) => item.id === terminalId)) continue;
        const terminal = libraryParts.find((item) => item.id === terminalId);
        if (terminal) project.parts.push(structuredClone(terminal));
      }
      const current = project.harnesses.find((item) => item.id === activeHarnessId);
      if (!current) return;
      if (connectorPicker.mode === "replace" && connectorPicker.nodeId) {
        const node = current.nodes.find((item) => item.id === connectorPicker.nodeId);
        if (!node) return;
        const oldNumberById = new Map(node.pins.map((pin) => [pin.id, pin.number]));
        const newIdByNumber = new Map(pins.map((pin) => [pin.number, pin.id]));
        for (const wire of current.conductors) {
          for (const endpoint of [wire.from, wire.to]) {
            if (endpoint.nodeId !== node.id || !endpoint.pinId) continue;
            endpoint.pinId = newIdByNumber.get(oldNumberById.get(endpoint.pinId) ?? "");
          }
        }
        node.partId = projectPart.id;
        node.pins = pins;
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
    });
    if (createdNodeId) selectEntity(createdNodeId, "node");
    closeConnectorPicker();
  };

  return <div className="modal-backdrop"><section className="connector-library-dialog" role="dialog" aria-modal="true" aria-label="커넥터 부품 선택">
    <header><div><Boxes size={16} /><strong>{connectorPicker.mode === "replace" ? "커넥터 부품 변경" : "부품 라이브러리에서 커넥터 추가"}</strong><span>하우징 부품을 선택하면 등록된 핀 정보와 함께 배치됩니다.</span></div><IconButton title="닫기" onClick={closeConnectorPicker}><X size={14} /></IconButton></header>
    <div className="connector-library-tools"><div className="library-search"><Search size={13} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="파트명, 파트번호, 제조사, 설명 검색" /></div><button onClick={() => setRegisteringPart(true)}><PackagePlus size={13} />부품 등록</button><button onClick={() => void openCad()}><FileInput size={13} />CAD 등록</button><span>{items.length} PARTS</span></div>
    <div className="connector-library-body"><div className="connector-library-table"><table className="data-table"><thead><tr><th>파트명</th><th>파트번호</th><th>제조사</th><th>핀 수</th><th>3D</th><th>Rev.</th><th>설명</th><th>출처</th></tr></thead><tbody>{items.map(({ part, source }) => <tr key={`${source}-${part.id}`} className={selected?.part.id === part.id ? "is-selected" : ""} onClick={() => { setSelectedId(part.id); setError(null); }} onDoubleClick={() => void usePart(part)}><td><strong>{getPartName(part)}</strong></td><td><code>{part.partNumber}</code></td><td>{part.manufacturer || "—"}</td><td className="number">{getPartPinCount(part)}</td><td>{part.modelAssetId ? "STEP" : "—"}</td><td>{part.revision}</td><td>{part.description}</td><td><span className="category-pill">{source}</span></td></tr>)}</tbody></table>{!items.length && <div className="empty-state">조건에 맞는 하우징 부품이 없습니다.</div>}</div>
      <aside>{selected ? <><div className="part-detail-title"><PartThumbnail part={selected.part} project={snapshot.project} /><div><strong>{getPartName(selected.part)}</strong><code>{selected.part.partNumber}</code></div></div><dl><dt>제조사</dt><dd>{selected.part.manufacturer || "—"}</dd><dt>핀 수</dt><dd>{getPartPinCount(selected.part)} pins</dd><dt>3D 모델</dt><dd>{selected.part.modelAssetId ? "STEP 등록됨" : "미등록"}</dd><dt>Revision</dt><dd>{selected.part.revision}</dd><dt>설명</dt><dd>{selected.part.description || "—"}</dd><dt>호환 터미널</dt><dd>{getCompatibleTerminalIds(selected.part).map((id) => libraryParts.find((part) => part.id === id) ?? snapshot.project.parts.find((part) => part.id === id)).filter(Boolean).map((part) => part!.partNumber).join(", ") || "미지정"}</dd>{Object.entries(selected.part.attributes).filter(([key]) => !["pinMap", "compatibleTerminalPartIds", "defaultTerminalPartId"].includes(key)).map(([key, value]) => <Fragment key={key}><dt>{key}</dt><dd>{value}</dd></Fragment>)}</dl></> : <div className="empty-state">부품을 선택하세요.</div>}</aside>
    </div>
    {error && <div className="connector-library-error">{error}</div>}
    <footer><button onClick={closeConnectorPicker}>취소</button><button className="primary" disabled={!selected || !getPartPinCount(selected.part)} onClick={() => selected && void usePart(selected.part)}>{connectorPicker.mode === "replace" ? "선택 부품으로 변경" : "선택 부품 배치"}</button></footer>
  </section>{registeringPart && <PartRegistrationDialog onClose={() => setRegisteringPart(false)} onSaved={(saved) => { setLibraryParts((current) => [...current.filter((part) => !saved.some((item) => item.id === part.id)), ...saved]); const housing = saved.find((part) => part.category === "housing"); if (housing) setSelectedId(housing.id); }} />}{cadResult && <CadImportDialog result={cadResult} onClose={() => setCadResult(null)} onSaved={(part, relatedParts) => { setLibraryParts((current) => [...current.filter((item) => ![part, ...relatedParts].some((saved) => saved.id === item.id)), ...relatedParts, part]); setSelectedId(part.id); }} />}</div>;
}
