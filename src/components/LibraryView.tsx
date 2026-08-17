import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { Boxes, Clipboard, FileInput, Filter, PackagePlus, Plug, Search, Sliders } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getPartName, getPartPinCount } from "../domain/parts";
import { partCategories, partCategoryLabel } from "../domain/partCategories";
import type { PartCategory, PartSnapshot } from "../domain/types";
import type { CadImportResult } from "../import/cadImport";
import { importCad } from "../import/cadImport";
import { translate } from "../i18n";
import { backendInvoke, isTauri } from "../platform";
import { loadAppPreferences } from "../preferences";
import { useProjectStore } from "../store/projectStore";
import { IconButton, PanelHeader } from "./common";
import { CadImportDialog } from "./CadImportDialog";
import { PartRegistrationDialog } from "./PartRegistrationDialog";
import { ModelAlignmentDialog } from "./ModelAlignmentDialog";
import { PartThumbnail } from "./PartThumbnail";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";

export function LibraryView() {
  const { snapshot, locale, openConnectorPicker } = useProjectStore();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | PartCategory>("all");
  const [cadResult, setCadResult] = useState<CadImportResult | null>(null);
  const [registeringPart, setRegisteringPart] = useState(false);
  const [editingPart, setEditingPart] = useState<PartSnapshot | null>(null);
  const [aligningPart, setAligningPart] = useState<PartSnapshot | null>(null);
  const [libraryParts, setLibraryParts] = useState<PartSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [libraryRevision, setLibraryRevision] = useState(0);
  const [menu, setMenu] = useState<{ x: number; y: number; partId: string } | null>(null);
  const projectPartCount = snapshot?.project.parts.length ?? 0;
  useEffect(() => {
    if (!isTauri()) return;
    setLoading(true);
    setLoadError(null);
    void backendInvoke<PartSnapshot[]>("list_library_parts")
      .then(setLibraryParts)
      .catch((reason) => setLoadError(`공용 부품 라이브러리를 읽지 못했습니다: ${String(reason)}`))
      .finally(() => setLoading(false));
  }, [cadResult, projectPartCount, libraryRevision]);
  useEffect(() => {
    if (!isTauri()) return;
    let cleanup: () => void = () => undefined;
    void listen("library-changed", () => setLibraryRevision((current) => current + 1)).then((unlisten) => { cleanup = unlisten; });
    return () => cleanup();
  }, []);
  const parts = useMemo(() => {
    return libraryParts
      .filter((part) => category === "all" || part.category === category)
      .filter((part) => `${getPartName(part)} ${part.partNumber} ${part.description} ${part.manufacturer}`.toLowerCase().includes(query.toLowerCase()));
  }, [category, libraryParts, query]);
  const categoryCounts = useMemo(() => new Map(partCategories.map((item) => [item, libraryParts.filter((part) => part.category === item).length])), [libraryParts]);
  if (!snapshot) return null;
  const openCad = async () => {
    if (!isTauri()) return;
    const path = await open({ multiple: false, defaultPath: loadAppPreferences().defaultImportDirectory || undefined, filters: [{ name: "2D CAD", extensions: ["dxf", "svg"] }] });
    if (!path) return;
    const source = await backendInvoke<string>("read_text_file", { path });
    setCadResult(importCad(source, path.split(/[\\/]/).pop() ?? "symbol"));
  };
  const menuItems = (): ContextMenuItem[] => {
    const part = libraryParts.find((item) => item.id === menu?.partId);
    if (!part) return [];
    return [
      { label: "파트번호 복사", icon: <Clipboard size={12} />, action: () => void navigator.clipboard.writeText(part.partNumber) },
      { label: "제조사 · 파트번호 복사", icon: <Clipboard size={12} />, action: () => void navigator.clipboard.writeText(`${part.manufacturer} · ${part.partNumber}`) },
      { label: "이 카테고리만 보기", icon: <Filter size={12} />, action: () => setCategory(part.category) },
      { label: "하네스에 커넥터로 추가", icon: <Plug size={12} />, separatorBefore: true, disabled: part.category !== "housing", action: () => openConnectorPicker("add", undefined, part.id) },
      { label: "3D 모델 정렬", icon: <Sliders size={12} />, disabled: !part.modelAssetId, action: () => setAligningPart(part) },
    ];
  };
  return <div className="library-view">
    <PanelHeader title={translate(locale, "sharedLibrary")} icon={<Boxes size={14} />} view="library" sessionId={snapshot.sessionId} actions={<><IconButton title="수동 부품 등록" onClick={() => setRegisteringPart(true)}><PackagePlus size={13} /></IconButton><IconButton title="DXF/SVG 하우징 등록" onClick={() => void openCad()}><FileInput size={13} /></IconButton></>} />
    <div className="library-controls">
      <div className="filter-row"><Search size={13} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="파트명, 파트번호, 설명, 제조사 검색" /><span>{parts.length}</span></div>
      <nav className="library-categories" aria-label={locale === "ko" ? "부품 카테고리" : "Part categories"}>
        <button className={category === "all" ? "active" : ""} aria-pressed={category === "all"} onClick={() => setCategory("all")}><span>{locale === "ko" ? "전체" : "ALL"}</span><code>{libraryParts.length}</code></button>
        {partCategories.map((item) => <button key={item} className={category === item ? "active" : ""} aria-pressed={category === item} onClick={() => setCategory(item)}><span>{partCategoryLabel(item, locale)}</span><code>{categoryCounts.get(item) ?? 0}</code></button>)}
      </nav>
    </div>
    <div className="library-grid">{loading ? <div className="empty-state">공용 부품 목록을 불러오는 중…</div> : loadError ? <div className="empty-state">{loadError}</div> : parts.length ? parts.map((part) => <article key={part.id} title="더블 클릭하여 부품 데이터 수정" onDoubleClick={(event) => { if (!(event.target as HTMLElement).closest("button")) setEditingPart(part); }} onContextMenu={(event) => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, partId: part.id }); }}><PartThumbnail part={part} project={snapshot.project} /><div className="library-card-copy"><strong>{getPartName(part)}</strong><span>{part.manufacturer}</span><p><code>{part.partNumber}</code> · {part.description}</p></div><div className="library-card-actions"><em>{partCategoryLabel(part.category, locale)}{part.category === "housing" ? ` · ${getPartPinCount(part)}P` : ""}{part.modelAssetId ? " · 3D" : ""}</em><code>REV {part.revision}</code>{part.modelAssetId && <button onClick={() => setAligningPart(part)}><Sliders size={10} />3D 정렬</button>}</div></article>) : <div className="empty-state">{category === "all" ? "등록된 공용 부품이 없습니다." : `${partCategoryLabel(category, locale)} 카테고리에 표시할 부품이 없습니다.`}</div>}</div>
    {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems()} onClose={() => setMenu(null)} />}
    {registeringPart && <PartRegistrationDialog onClose={() => setRegisteringPart(false)} onSaved={(saved) => setLibraryParts((current) => [...current.filter((part) => !saved.some((item) => item.id === part.id)), ...saved])} />}
    {editingPart && <PartRegistrationDialog part={editingPart} onClose={() => setEditingPart(null)} onSaved={(saved) => { setLibraryParts((current) => [...current.filter((part) => !saved.some((item) => item.id === part.id)), ...saved]); const updated = saved.find((part) => part.id === editingPart.id); if (updated) setEditingPart(updated); }} />}
    {aligningPart && <ModelAlignmentDialog part={aligningPart} onClose={() => setAligningPart(null)} onSaved={(saved) => setLibraryParts((current) => current.map((part) => part.id === saved.id ? saved : part))} />}
    {cadResult && <CadImportDialog result={cadResult} onClose={() => setCadResult(null)} />}
  </div>;
}
