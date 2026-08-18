import { PackagePlus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { partCategoryLabel } from "../domain/partCategories";
import { getPartName } from "../domain/parts";
import type { PartCategory, PartSnapshot } from "../domain/types";
import { backendInvoke, isTauri } from "../platform";
import { useProjectStore } from "../store/projectStore";
import { IconButton } from "./common";

export const accessoryCategories: PartCategory[] = ["heatShrink", "sleeve", "shield", "tape", "label", "clip", "seal", "lug", "splice"];

type PlacementTarget = "free" | "node" | "segment";

export function AccessoryLibraryDialog() {
  const { snapshot, activeHarnessId, accessoryPicker, closeAccessoryPicker, updateProject, selectEntity, locale } = useProjectStore();
  const [libraryParts, setLibraryParts] = useState<PartSnapshot[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<PartCategory | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [targetType, setTargetType] = useState<PlacementTarget>("free");
  const [targetId, setTargetId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessoryPicker || !isTauri()) return;
    void backendInvoke<PartSnapshot[]>("list_library_parts").then(setLibraryParts).catch((reason) => setError(`공용 부품 라이브러리를 읽지 못했습니다: ${String(reason)}`));
  }, [accessoryPicker]);

  useEffect(() => {
    if (!accessoryPicker?.partId) return;
    setCategory("all");
    setQuery("");
  }, [accessoryPicker?.partId]);

  const items = useMemo(() => {
    if (!snapshot) return [];
    const projectIds = new Set(snapshot.project.parts.map((part) => part.id));
    const combined = [...snapshot.project.parts, ...libraryParts.filter((part) => !projectIds.has(part.id))];
    const needle = query.trim().toLowerCase();
    return combined.filter((part) => accessoryCategories.includes(part.category)
      && (category === "all" || part.category === category)
      && (!needle || `${getPartName(part)} ${part.partNumber} ${part.manufacturer} ${part.description}`.toLowerCase().includes(needle)));
  }, [category, libraryParts, query, snapshot]);
  const selected = items.find((part) => part.id === selectedId);
  const harness = snapshot?.project.harnesses.find((item) => item.id === activeHarnessId);

  useEffect(() => {
    if (accessoryPicker?.partId && items.some((part) => part.id === accessoryPicker.partId)) setSelectedId(accessoryPicker.partId);
    else if (!items.some((part) => part.id === selectedId) && items[0]) setSelectedId(items[0].id);
  }, [accessoryPicker?.partId, items, selectedId]);

  useEffect(() => {
    setTargetId(targetType === "node" ? harness?.nodes[0]?.id ?? "" : targetType === "segment" ? harness?.segments[0]?.id ?? "" : "");
  }, [harness?.id, targetType]);

  if (!snapshot || !accessoryPicker || !harness) return null;

  const addAccessory = (part = selected) => {
    if (!part || !Number.isFinite(quantity) || quantity <= 0) {
      setError("부자재와 0보다 큰 수량을 선택하세요.");
      return;
    }
    if (targetType !== "free" && !targetId) {
      setError("부자재를 연결할 대상을 선택하세요.");
      return;
    }
    const id = crypto.randomUUID();
    const freeIndex = harness.accessories.filter((item) => !item.nodeId && !item.segmentId).length;
    void updateProject((project) => {
      if (!project.parts.some((item) => item.id === part.id)) project.parts.push(structuredClone(part));
      const current = project.harnesses.find((item) => item.id === harness.id);
      if (!current) return;
      current.accessories.push({
        id,
        partId: part.id,
        quantity,
        nodeId: targetType === "node" ? targetId : undefined,
        segmentId: targetType === "segment" ? targetId : undefined,
        drawingPosition: targetType === "free" ? { x: 280 + (freeIndex % 6) * 28, y: 130 + (freeIndex % 6) * 28 } : undefined,
        note: getPartName(part),
      });
    }).then(() => {
      selectEntity(id, "accessory");
      closeAccessoryPicker();
    });
  };

  return <div className="modal-backdrop"><section className="accessory-library-dialog" role="dialog" aria-modal="true" aria-label="부자재 선택">
    <header><div><PackagePlus size={16} /><strong>부자재 추가</strong><span>라이브러리 부품을 선택해 자유 배치하거나 커넥터·케이블에 연결합니다.</span></div><IconButton title="닫기" onClick={closeAccessoryPicker}><X size={14} /></IconButton></header>
    <div className="accessory-library-tools"><label><Search size={13} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="파트명, 파트번호, 제조사 검색" /></label><select aria-label="부자재 카테고리" value={category} onChange={(event) => setCategory(event.target.value as PartCategory | "all")}><option value="all">전체 부자재</option>{accessoryCategories.map((item) => <option key={item} value={item}>{partCategoryLabel(item, locale)}</option>)}</select><span>{items.length} PARTS</span></div>
    <div className="accessory-library-body">
      <div className="accessory-library-table"><table className="data-table"><thead><tr><th>종류</th><th>파트명</th><th>파트번호</th><th>제조사</th><th>단위</th><th>설명</th></tr></thead><tbody>{items.map((part) => <tr key={part.id} className={selected?.id === part.id ? "is-selected" : ""} onClick={() => { setSelectedId(part.id); setError(null); }} onDoubleClick={() => addAccessory(part)}><td><span className="category-pill">{partCategoryLabel(part.category, locale)}</span></td><td><strong>{getPartName(part)}</strong></td><td><code>{part.partNumber}</code></td><td>{part.manufacturer || "—"}</td><td>{part.unit}</td><td>{part.description || "—"}</td></tr>)}</tbody></table>{!items.length && <div className="empty-state">조건에 맞는 부자재가 없습니다.</div>}</div>
      <aside><strong>배치 설정</strong><label><span>수량</span><input aria-label="부자재 수량" type="number" min="0.01" step="0.01" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label><label><span>배치 대상</span><select aria-label="부자재 배치 대상" value={targetType} onChange={(event) => setTargetType(event.target.value as PlacementTarget)}><option value="free">도면 자유 배치</option><option value="node">커넥터 / 노드</option><option value="segment">케이블 / 구간</option></select></label>{targetType === "node" && <label><span>커넥터 / 노드</span><select aria-label="부자재 연결 노드" value={targetId} onChange={(event) => setTargetId(event.target.value)}>{harness.nodes.map((node) => <option key={node.id} value={node.id}>{node.reference} · {node.label}</option>)}</select></label>}{targetType === "segment" && <label><span>케이블 / 구간</span><select aria-label="부자재 연결 구간" value={targetId} onChange={(event) => setTargetId(event.target.value)}>{harness.segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.label} · {segment.lengthMm} mm</option>)}</select></label>}{selected ? <dl><dt>선택 부품</dt><dd>{getPartName(selected)}</dd><dt>파트번호</dt><dd><code>{selected.partNumber}</code></dd><dt>카테고리</dt><dd>{partCategoryLabel(selected.category, locale)}</dd></dl> : <div className="empty-state">부자재를 선택하세요.</div>}</aside>
    </div>
    {error && <div className="connector-library-error">{error}</div>}
    <footer><button onClick={closeAccessoryPicker}>취소</button><button className="primary" disabled={!selected} onClick={() => addAccessory()}>선택 부자재 배치</button></footer>
  </section></div>;
}
