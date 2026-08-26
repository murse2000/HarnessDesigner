import { open, save } from "@tauri-apps/plugin-dialog";
import { Database, FileImage, FolderOpen, Plus, Save, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { backendInvoke } from "../platform";
import {
  createLibraryPartDraft,
  libraryPartToConnectorDraft,
  resizeLibraryCores,
  resizeLibraryPins,
  type LibraryPage2D,
  type LibraryPart2D,
  type LibraryPartCategory2D,
  type LibraryPartDraft2D,
  type LibrarySummary2D,
} from "./library";
import type { ConnectorDraft } from "./model";
import { drawingPathData, partDrawingStrokeWidth } from "./dxfSymbol";
import { PartSymbolEditor } from "./PartSymbolEditor";
import { preferStepShadedDrawing } from "./stepSymbol";

type LibraryManagerProps = {
  summary: LibrarySummary2D | null;
  onSummaryChange: (summary: LibrarySummary2D) => void;
  onClose: () => void;
};

export function PartsLibraryDialog({ summary, onSummaryChange, onClose }: LibraryManagerProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<LibraryPartCategory2D | "all">("all");
  const [page, setPage] = useState<LibraryPage2D | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<LibraryPartDraft2D>(() => createLibraryPartDraft());

  const loadPage = useCallback(async (search: string, nextOffset: number) => {
    if (!summary) return;
    setLoading(true);
    setError("");
    try {
      const loaded = await backendInvoke<LibraryPage2D>("query_rebuilt_parts_library", {
        query: search,
        category: category === "all" ? null : category,
        offset: nextOffset,
        limit: 100,
      });
      setPage(loaded);
      setOffset(nextOffset);
      onSummaryChange(loaded.summary);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, [category, onSummaryChange, summary]);

  useEffect(() => {
    if (summary) void loadPage(query, 0);
  }, [summary?.path, category]);

  const createLibrary = async () => {
    const path = await save({
      defaultPath: "HarnessParts.hlib2d",
      filters: [{ name: "Harness Designer 2D Parts", extensions: ["hlib2d"] }],
    });
    if (!path) return;
    setLoading(true);
    setError("");
    try {
      const created = await backendInvoke<LibrarySummary2D>("create_rebuilt_parts_library", {
        path,
        name: "공용 2D 부품 라이브러리",
      });
      onSummaryChange(created);
      setPage({ summary: created, parts: [], total: 0, offset: 0, limit: 100 });
      setDraft(createLibraryPartDraft());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  };

  const openLibrary = async () => {
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Harness Designer 2D Parts", extensions: ["hlib2d"] }],
    });
    if (!path) return;
    setLoading(true);
    setError("");
    try {
      const opened = await backendInvoke<LibrarySummary2D>("open_rebuilt_parts_library", { path });
      onSummaryChange(opened);
      setDraft(createLibraryPartDraft());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  };

  const savePart = async () => {
    setLoading(true);
    setError("");
    try {
      const savedPart = await backendInvoke<LibraryPart2D>("upsert_rebuilt_library_part", {
        part: { ...draft, id: draft.id ?? "" },
      });
      setDraft(savedPart);
      await loadPage(query, offset);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setLoading(false);
    }
  };

  const deletePart = async () => {
    if (!draft.id || !window.confirm(`${draft.partNumber} 부품을 라이브러리에서 삭제하시겠습니까?`)) return;
    setLoading(true);
    setError("");
    try {
      await backendInvoke("delete_rebuilt_library_part", { partId: draft.id });
      setDraft(createLibraryPartDraft());
      await loadPage(query, Math.max(0, offset - (page?.parts.length === 1 ? 100 : 0)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setLoading(false);
    }
  };

  return <div className="hd2-dialog-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="hd2-library-dialog" role="dialog" aria-label="외부 2D 부품 라이브러리">
      <header>
        <div><Database size={17} /><strong>외부 2D 부품 라이브러리</strong><span>{summary ? `${summary.name} · REV ${summary.revision}` : "라이브러리를 만들거나 연결하세요."}</span></div>
        <button type="button" onClick={() => void createLibrary()}><Plus size={14} />새 라이브러리</button>
        <button type="button" onClick={() => void openLibrary()}><FolderOpen size={14} />열기</button>
        <button type="button" onClick={onClose}>닫기</button>
      </header>

      {loading && <div className="hd2-library-progress"><progress /><span>라이브러리 작업을 처리하고 있습니다.</span></div>}
      {error && <div className="hd2-library-error">{error}</div>}

      {!summary ? <div className="hd2-library-empty">
        <Database size={42} />
        <strong>연결된 외부 라이브러리가 없습니다.</strong>
        <span>단일 .hlib2d 파일에 부품과 핀 정의를 저장합니다.</span>
      </div> : <div className="hd2-library-body">
        <section className="hd2-library-list">
          <div className="hd2-library-path" title={summary.path}>{summary.path}</div>
          <div className="hd2-library-categories">{(["all", "housing", "wire", "cable"] as const).map((item) => <button type="button" key={item} className={category === item ? "is-selected" : ""} onClick={() => { setCategory(item); setOffset(0); }}>{item.toUpperCase()}</button>)}</div>
          <form className="hd2-library-search" onSubmit={(event) => { event.preventDefault(); void loadPage(query, 0); }}>
            <Search size={14} /><input aria-label="라이브러리 검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="파트명, 파트번호, 제조사" /><button type="submit">검색</button>
          </form>
          <div className="hd2-library-count">검색 결과 {page?.total ?? 0}개 · 전체 {summary.partCount}개</div>
          <div className="hd2-library-items">
            {page?.parts.map((part) => <button type="button" key={part.id} className={draft.id === part.id ? "is-selected" : ""} onClick={() => setDraft(cloneLibraryPart(part))}>
              <LibraryDrawingThumbnail part={part} /><span>{part.category.toUpperCase()}</span><strong>{part.partNumber}</strong><em>{part.name}</em><small>{partCountLabel(part)}</small>
            </button>)}
            {page && page.parts.length === 0 && <p>등록된 부품이 없습니다.</p>}
          </div>
          <footer>
            <button type="button" disabled={offset === 0} onClick={() => void loadPage(query, Math.max(0, offset - 100))}>이전</button>
            <span>{page ? `${Math.min(page.total, offset + 1)}–${Math.min(page.total, offset + page.parts.length)} / ${page.total}` : "0 / 0"}</span>
            <button type="button" disabled={!page || offset + page.parts.length >= page.total} onClick={() => void loadPage(query, offset + 100)}>다음</button>
          </footer>
        </section>

        <PartEditor
          draft={draft}
          onDraftChange={setDraft}
          onNew={() => setDraft(createLibraryPartDraft(category === "all" ? "housing" : category))}
          onSave={() => void savePart()}
          onDelete={() => void deletePart()}
          disabled={loading}
        />
      </div>}
    </section>
  </div>;
}

function PartEditor({ draft, onDraftChange, onNew, onSave, onDelete, disabled }: {
  draft: LibraryPartDraft2D;
  onDraftChange: (draft: LibraryPartDraft2D) => void;
  onNew: () => void;
  onSave: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  const [symbolEditorOpen, setSymbolEditorOpen] = useState(false);
  const setValue = (changes: Partial<LibraryPartDraft2D>) => onDraftChange({ ...draft, ...changes });
  const changeCategory = (category: LibraryPartCategory2D) => {
    const replacement = createLibraryPartDraft(category);
    onDraftChange({
      ...replacement,
      id: draft.id,
      name: draft.name,
      partNumber: draft.partNumber,
      manufacturer: draft.manufacturer,
      description: draft.description,
    });
  };
  return <section className={`hd2-library-editor${draft.drawing ? " has-drawing" : ""}`}>
    <header><strong>{draft.id ? "부품 수정" : "새 부품 등록"}</strong>{draft.category === "housing" && <button type="button" className={draft.drawing ? "has-drawing" : ""} onClick={() => setSymbolEditorOpen(true)}><FileImage size={14} />2D 도면 · {draft.drawing ? "등록됨" : "없음"}</button>}<button type="button" onClick={onNew}><Plus size={14} />새 부품</button></header>
    <div className="hd2-library-fields">
      <label><span>카테고리</span><select aria-label="라이브러리 카테고리" value={draft.category} onChange={(event) => changeCategory(event.target.value as LibraryPartCategory2D)}><option value="housing">HOUSING</option><option value="wire">WIRE</option><option value="cable">CABLE</option></select></label>
      <label><span>파트명</span><input aria-label="라이브러리 파트명" value={draft.name} onChange={(event) => setValue({ name: event.target.value })} /></label>
      <label><span>파트번호</span><input aria-label="라이브러리 파트번호" value={draft.partNumber} onChange={(event) => setValue({ partNumber: event.target.value })} /></label>
      <label><span>제조사</span><input aria-label="라이브러리 제조사" value={draft.manufacturer} onChange={(event) => setValue({ manufacturer: event.target.value })} /></label>
      {draft.category === "housing" ? <label><span>핀 수</span><input aria-label="라이브러리 핀 수" type="number" min="1" max="256" value={draft.pins.length} onChange={(event) => setValue({ pins: resizeLibraryPins(draft.pins, Number(event.target.value)) })} /></label> : <>
        <label><span>외경 (mm)</span><input aria-label="라이브러리 외경" type="number" min="0.01" step="0.01" value={draft.outerDiameterMm ?? ""} onChange={(event) => setValue({ outerDiameterMm: Number(event.target.value) })} /></label>
        <label><span>{draft.category === "wire" ? "도체 수" : "코어 수"}</span><input aria-label="라이브러리 코어 수" type="number" min={draft.category === "wire" ? 1 : 2} max={draft.category === "wire" ? 1 : 256} disabled={draft.category === "wire"} value={draft.cores.length} onChange={(event) => setValue({ cores: resizeLibraryCores(draft.cores, Number(event.target.value)) })} /></label>
      </>}
      <label className="is-wide"><span>설명</span><input value={draft.description} onChange={(event) => setValue({ description: event.target.value })} /></label>
    </div>
    {draft.category === "housing" && draft.drawing && <DrawingPreview draft={draft} />}
    {draft.category === "housing" ? <div className="hd2-library-pins"><h3>PIN DEFINITION · {draft.pins.length}</h3><div>
      {draft.pins.map((pin, index) => <label key={index}><b>{index + 1}</b><input aria-label={`라이브러리 ${index + 1}번 핀 번호`} value={pin.number} onChange={(event) => setValue({ pins: draft.pins.map((item, itemIndex) => itemIndex === index ? { ...item, number: event.target.value } : item) })} /><input aria-label={`라이브러리 ${index + 1}번 핀 이름`} value={pin.name} onChange={(event) => setValue({ pins: draft.pins.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) })} /></label>)}
    </div></div> : <div className="hd2-library-pins hd2-library-cores"><h3>{draft.category === "wire" ? "CONDUCTOR DEFINITION" : "CORE DEFINITION"} · {draft.cores.length}</h3><div>
      {draft.cores.map((core, index) => <label key={index}><b>{index + 1}</b><input aria-label={`라이브러리 ${index + 1}번 코어 이름`} value={core.name} onChange={(event) => setValue({ cores: draft.cores.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) })} /><input aria-label={`라이브러리 ${index + 1}번 코어 색상`} value={core.color} onChange={(event) => setValue({ cores: draft.cores.map((item, itemIndex) => itemIndex === index ? { ...item, color: event.target.value.toUpperCase() } : item) })} /><input aria-label={`라이브러리 ${index + 1}번 코어 규격`} value={core.gauge} onChange={(event) => setValue({ cores: draft.cores.map((item, itemIndex) => itemIndex === index ? { ...item, gauge: event.target.value } : item) })} /></label>)}
    </div></div>}
    <footer><button type="button" disabled={!draft.id || disabled} className="is-danger" onClick={onDelete}><Trash2 size={14} />삭제</button><button type="button" disabled={disabled} className="is-primary" onClick={onSave}><Save size={14} />부품 저장</button></footer>
    {symbolEditorOpen && <PartSymbolEditor draft={draft} onClose={() => setSymbolEditorOpen(false)} onApply={(next) => { onDraftChange(next); setSymbolEditorOpen(false); }} />}
  </section>;
}

function LibraryDrawingThumbnail({ part }: { part: LibraryPart2D }) {
  if (!part.drawing) return <span className="hd2-library-drawing-thumb is-empty" aria-label={`${part.partNumber} 2D 도면 없음`}>도면 없음</span>;
  const drawing = preferStepShadedDrawing(part.drawing);
  return <span className="hd2-library-drawing-thumb" aria-label={`${part.partNumber} 2D 도면 등록됨`} title={drawing.sourceName}>
    <svg viewBox={`0 0 ${drawing.widthMm} ${drawing.heightMm}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {drawing.imageDataUrl && <image href={drawing.imageDataUrl} width={drawing.widthMm} height={drawing.heightMm} preserveAspectRatio="none" />}
      {drawing.paths.map((path, index) => <path key={index} d={drawingPathData(path)} style={{ strokeWidth: partDrawingStrokeWidth(drawing.outlineStrength) }} />)}
    </svg>
    <b>2D</b>
  </span>;
}

function DrawingPreview({ draft }: { draft: LibraryPartDraft2D }) {
  const drawing = preferStepShadedDrawing(draft.drawing!);
  return <section className="hd2-library-drawing-preview">
    <header><strong>2D DRAWING</strong><span>{drawing.sourceName}</span><em>{drawing.widthMm.toFixed(2)} × {drawing.heightMm.toFixed(2)} mm</em></header>
    <svg viewBox={`0 0 ${drawing.widthMm} ${drawing.heightMm}`} preserveAspectRatio="xMidYMid meet">
      {drawing.imageDataUrl && <image href={drawing.imageDataUrl} width={drawing.widthMm} height={drawing.heightMm} preserveAspectRatio="none" />}
      {drawing.paths.map((path, index) => <path key={index} d={drawingPathData(path)} style={{ strokeWidth: partDrawingStrokeWidth(drawing.outlineStrength) }} />)}
      {draft.pins.map((pin, index) => pin.anchor && <g key={index}><circle cx={pin.anchor.xMm} cy={pin.anchor.yMm} r={Math.max(drawing.widthMm, drawing.heightMm) / 70} /><text x={pin.anchor.xMm} y={pin.anchor.yMm}>{pin.number}</text></g>)}
    </svg>
  </section>;
}

function cloneLibraryPart(part: LibraryPart2D): LibraryPartDraft2D {
  return {
    ...part,
    pins: part.pins.map((pin) => ({ ...pin, anchor: pin.anchor ? { ...pin.anchor } : undefined })),
    cores: part.cores.map((core) => ({ ...core })),
    drawing: part.drawing ? {
      ...part.drawing,
      paths: part.drawing.paths.map((path) => ({ ...path, points: path.points.map((point) => ({ ...point })) })),
      unsupportedEntities: part.drawing.unsupportedEntities.map((item) => ({ ...item })),
      editorState: part.drawing.editorState ? structuredClone(part.drawing.editorState) : undefined,
    } : undefined,
  };
}

type ConnectorPickerProps = {
  summary: LibrarySummary2D | null;
  onCancel: () => void;
  onOpenLibrary: () => void;
  onSubmit: (draft: ConnectorDraft) => void;
};

export function ConnectorPickerDialog({ summary, onCancel, onOpenLibrary, onSubmit }: ConnectorPickerProps) {
  const [mode, setMode] = useState<"library" | "manual">(summary ? "library" : "manual");
  const [query, setQuery] = useState("");
  const [parts, setParts] = useState<LibraryPart2D[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [manual, setManual] = useState<ConnectorDraft>({ name: "새 커넥터", partNumber: "", manufacturer: "", pinCount: 4 });
  const selected = useMemo(() => parts.find((part) => part.id === selectedId), [parts, selectedId]);

  const search = useCallback(async () => {
    if (!summary) return;
    setLoading(true);
    setError("");
    try {
      const page = await backendInvoke<LibraryPage2D>("query_rebuilt_parts_library", { query, category: "housing", offset: 0, limit: 100 });
      setParts(page.parts.filter((part) => part.category === "housing"));
      setSelectedId((current) => page.parts.some((part) => part.id === current) ? current : page.parts[0]?.id ?? "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, [query, summary]);

  useEffect(() => {
    if (mode === "library" && summary) void search();
  }, [mode, summary?.path]);

  return <div className="hd2-dialog-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <form className="hd2-dialog hd2-connector-picker" onSubmit={(event) => {
      event.preventDefault();
      if (mode === "library" && selected && summary) onSubmit(libraryPartToConnectorDraft(selected, summary));
      if (mode === "manual") onSubmit(manual);
    }}>
      <header><strong>커넥터 추가</strong><span>{mode === "library" ? "외부 라이브러리 부품의 스냅샷을 배치합니다." : "새 2D 부품 인스턴스를 만듭니다."}</span></header>
      <div className="hd2-dialog-tabs"><button type="button" className={mode === "library" ? "is-selected" : ""} disabled={!summary} onClick={() => setMode("library")}>부품 라이브러리</button><button type="button" className={mode === "manual" ? "is-selected" : ""} onClick={() => setMode("manual")}>직접 입력</button><button type="button" onClick={onOpenLibrary}>라이브러리 관리</button></div>
      {mode === "library" ? <div className="hd2-picker-library">
        <div className="hd2-picker-search"><Search size={14} /><input aria-label="커넥터 라이브러리 검색" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void search(); } }} /><button type="button" onClick={() => void search()}>검색</button></div>
        {loading && <div className="hd2-picker-loading">검색 중...</div>}
        {error && <div className="hd2-library-error">{error}</div>}
        <div>{parts.map((part) => <button type="button" className={selectedId === part.id ? "is-selected" : ""} key={part.id} onClick={() => setSelectedId(part.id)} onDoubleClick={() => onSubmit(libraryPartToConnectorDraft(part, summary!))}><span>{part.manufacturer}</span><strong>{part.partNumber}</strong><em>{part.name}</em><small>{part.pins.length}P</small></button>)}</div>
      </div> : <div className="hd2-picker-manual">
        <DialogField label="파트명" value={manual.name} onChange={(name) => setManual((current) => ({ ...current, name }))} />
        <DialogField label="파트번호" value={manual.partNumber} onChange={(partNumber) => setManual((current) => ({ ...current, partNumber }))} />
        <DialogField label="제조사" value={manual.manufacturer} onChange={(manufacturer) => setManual((current) => ({ ...current, manufacturer }))} />
        <label className="hd2-field"><span>핀 수</span><input aria-label="핀 수" type="number" min="1" max="256" value={manual.pinCount} onChange={(event) => setManual((current) => ({ ...current, pinCount: Number(event.target.value) }))} /></label>
      </div>}
      <footer><button type="button" onClick={onCancel}>취소</button><button type="submit" className="is-primary" disabled={mode === "library" && !selected}><Plus size={15} />추가</button></footer>
    </form>
  </div>;
}

function partCountLabel(part: LibraryPart2D) {
  if (part.category === "housing") return `${part.pins.length}P`;
  if (part.category === "wire") return part.cores[0]?.gauge ?? "WIRE";
  return `${part.cores.length}C`;
}

function DialogField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="hd2-field"><span>{label}</span><input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
