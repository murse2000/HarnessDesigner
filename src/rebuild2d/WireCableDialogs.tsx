import { Cable, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { backendInvoke } from "../platform";
import { endpointPosition } from "./geometry";
import { libraryPartToCableSnapshot, libraryPartToWireSnapshot, type LibraryPage2D, type LibraryPart2D, type LibrarySummary2D } from "./library";
import { LibraryPartThumbnail } from "./LibraryPartThumbnail";
import { PartAddTabs, type PartAddKind } from "./PartAddTabs";
import type { CableRunDraft2D, Harness2D, PinEndpoint2D, WireRunDraft2D } from "./model";
import { joinWireColor, splitWireColor, WIRE_COLOR_CODES, wireColorBackground, wireColorValue } from "./wireColor";

type Props = {
  kind: "wire" | "cable";
  summary: LibrarySummary2D | null;
  harness: Harness2D;
  onCancel: () => void;
  onOpenLibrary: () => void;
  onSubmit: (draft: WireRunDraft2D | CableRunDraft2D) => void;
  onKindChange?: (kind: PartAddKind) => void;
};

type CoreMappingState = {
  used: boolean;
  color: string;
  fromPinId: string;
  toPinId: string;
};

const FREE_END_ID = "__free_end__";

export function WireCableRunDialog({ kind, summary, harness, onCancel, onOpenLibrary, onSubmit, onKindChange }: Props) {
  const [query, setQuery] = useState("");
  const [parts, setParts] = useState<LibraryPart2D[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [fromComponentId, setFromComponentId] = useState(harness.components[0]?.id ?? "");
  const [toComponentId, setToComponentId] = useState(harness.components[1]?.id ?? harness.components[0]?.id ?? "");
  const [fromPinId, setFromPinId] = useState("");
  const [toPinId, setToPinId] = useState("");
  const [lengthMm, setLengthMm] = useState(300);
  const [fromStripLengthMm, setFromStripLengthMm] = useState(8);
  const [toStripLengthMm, setToStripLengthMm] = useState(8);
  const [coreMappings, setCoreMappings] = useState<CoreMappingState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selected = useMemo(() => parts.find((part) => part.id === selectedId), [parts, selectedId]);
  const fromComponent = harness.components.find((component) => component.id === fromComponentId);
  const toComponent = harness.components.find((component) => component.id === toComponentId);
  const fromIsFree = fromComponentId === FREE_END_ID;
  const toIsFree = toComponentId === FREE_END_ID;

  const search = useCallback(async () => {
    if (!summary) return;
    setLoading(true);
    setError("");
    try {
      const page = await backendInvoke<LibraryPage2D>("query_rebuilt_parts_library", { query, category: kind, offset: 0, limit: 100 });
      const filtered = page.parts.filter((part) => part.category === kind);
      setParts(filtered);
      setSelectedId((current) => filtered.some((part) => part.id === current) ? current : filtered[0]?.id ?? "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, [kind, query, summary]);

  useEffect(() => {
    if (summary) void search();
  }, [kind, summary?.path]);

  useEffect(() => {
    if (!selected) return;
    const count = selected.cores.length;
    setCoreMappings(Array.from({ length: count }, (_, index) => ({
      used: Boolean((fromIsFree || fromComponent?.pins[index]) && (toIsFree || toComponent?.pins[index])),
      color: selected.cores[index]?.color ?? "BK",
      fromPinId: fromComponent?.pins[index]?.id ?? "",
      toPinId: toComponent?.pins[index]?.id ?? "",
    })));
    setFromPinId(fromComponent?.pins[0]?.id ?? "");
    setToPinId(toComponent?.pins[0]?.id ?? "");
  }, [selected?.id, fromComponentId, toComponentId, fromIsFree, toIsFree]);

  const submit = () => {
    if (!selected || !summary) return;
    try {
      if (fromIsFree && toIsFree) throw new Error("한쪽 끝에는 커넥터를 지정하세요.");
      if (kind === "wire") {
        const snapshot = libraryPartToWireSnapshot(selected, summary);
        onSubmit({
          part: {
            name: snapshot.name,
            partNumber: snapshot.partNumber,
            manufacturer: snapshot.manufacturer,
            outerDiameterMm: snapshot.outerDiameterMm,
            color: snapshot.core.color,
            gauge: snapshot.core.gauge,
            source: snapshot.source,
          },
          from: runEndpoint(harness, "from", fromComponent, fromPinId, toComponent, toPinId, fromStripLengthMm),
          to: runEndpoint(harness, "to", toComponent, toPinId, fromComponent, fromPinId, toStripLengthMm),
          lengthMm,
        });
        return;
      }
      const snapshot = libraryPartToCableSnapshot(selected, summary);
      const usedMappings = coreMappings.flatMap((mapping, coreIndex) => mapping.used ? [{ mapping, coreIndex }] : []);
      onSubmit({
        part: {
          ...snapshot,
          cores: snapshot.cores.map((core, index) => ({ ...core, color: coreMappings[index]?.color ?? core.color })),
        },
        lengthMm,
        mappings: usedMappings.map(({ mapping, coreIndex }) => ({
          coreIndex,
          from: runEndpoint(harness, "from", fromComponent, mapping.fromPinId, toComponent, mapping.toPinId, fromStripLengthMm),
          to: runEndpoint(harness, "to", toComponent, mapping.toPinId, fromComponent, mapping.fromPinId, toStripLengthMm),
        })),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  return <div className="hd2-dialog-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className={`hd2-dialog hd2-run-dialog${onKindChange ? " is-unified" : ""}`} role="dialog" aria-label={onKindChange ? "부품 추가" : kind === "wire" ? "단선 추가" : "멀티코어 케이블 추가"}>
      <header><Cable size={17} /><strong>{onKindChange ? "부품 추가" : kind === "wire" ? "단선 추가" : "멀티코어 케이블 추가"}</strong><span>{kind === "wire" ? "단선" : "멀티코어 케이블"}의 각 끝을 커넥터 핀 또는 탈피 끝단으로 지정합니다.</span></header>
      {onKindChange && <PartAddTabs active={kind} onChange={onKindChange} />}
      {!summary ? <div className="hd2-run-empty"><strong>외부 부품 라이브러리가 필요합니다.</strong><button type="button" onClick={onOpenLibrary}>라이브러리 관리</button></div> : <div className="hd2-run-body">
        <section className="hd2-run-parts">
          <div className="hd2-picker-search"><Search size={14} /><input aria-label={`${kind === "wire" ? "단선" : "케이블"} 라이브러리 검색`} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void search(); } }} /><button type="button" onClick={() => void search()}>검색</button></div>
          {loading && <div className="hd2-picker-loading">검색 중...</div>}
          <div className="hd2-run-part-list">{parts.map((part) => <button type="button" className={selectedId === part.id ? "is-selected" : ""} key={part.id} onClick={() => setSelectedId(part.id)}><LibraryPartThumbnail part={part} /><span>{part.manufacturer}</span><strong>{part.partNumber}</strong><em>{part.name}</em><small>{kind === "wire" ? part.cores[0]?.gauge : `${part.cores.length}C · Ø${part.outerDiameterMm} mm`}</small></button>)}{!loading && parts.length === 0 && <p>등록된 {kind === "wire" ? "단선" : "케이블"} 부품이 없습니다.</p>}</div>
        </section>
        <section className="hd2-run-mapping">
          <div className="hd2-run-fields">
            <label><span>From End</span><select aria-label="From Housing" value={fromComponentId} onChange={(event) => setFromComponentId(event.target.value)}><option value={FREE_END_ID}>커넥터 없음 · 탈피 끝단</option>{harness.components.map((component) => <option value={component.id} key={component.id}>{component.reference} · {component.name}</option>)}</select></label>
            <label><span>To End</span><select aria-label="To Housing" value={toComponentId} onChange={(event) => setToComponentId(event.target.value)}><option value={FREE_END_ID}>커넥터 없음 · 탈피 끝단</option>{harness.components.map((component) => <option value={component.id} key={component.id}>{component.reference} · {component.name}</option>)}</select></label>
            <label><span>Length (mm)</span><input aria-label="Length (mm)" type="number" min="0.1" value={lengthMm} onChange={(event) => setLengthMm(Number(event.target.value))} /></label>
            {fromIsFree && <label><span>From 탈피 길이 (mm)</span><input aria-label="From 탈피 길이 (mm)" type="number" min="0" value={fromStripLengthMm} onChange={(event) => setFromStripLengthMm(Number(event.target.value))} /></label>}
            {toIsFree && <label><span>To 탈피 길이 (mm)</span><input aria-label="To 탈피 길이 (mm)" type="number" min="0" value={toStripLengthMm} onChange={(event) => setToStripLengthMm(Number(event.target.value))} /></label>}
          </div>
          {kind === "wire" ? <div className="hd2-wire-mapping">
            <label><span>From Pin</span>{fromIsFree ? <strong className="hd2-free-end-value">탈피 끝단</strong> : <PinSelect ariaLabel="From Pin" pins={fromComponent?.pins ?? []} value={fromPinId} onChange={setFromPinId} />}</label>
            <div className="hd2-core-color"><i style={{ background: wireColorValue(selected?.cores[0]?.color ?? "BK") }} />{selected?.cores[0]?.color ?? "—"} · {selected?.cores[0]?.gauge ?? "—"}</div>
            <label><span>To Pin</span>{toIsFree ? <strong className="hd2-free-end-value">탈피 끝단</strong> : <PinSelect ariaLabel="To Pin" pins={toComponent?.pins ?? []} value={toPinId} onChange={setToPinId} />}</label>
          </div> : <div className="hd2-core-map"><h3>CORE PIN MAPPING <span>{coreMappings.filter((item) => item.used).length} / {selected?.cores.length ?? 0}</span></h3><div className="hd2-core-map-scroll"><table><thead><tr><th>사용</th><th>Core</th><th>Name</th><th>Color</th><th>Gauge</th><th>{fromComponent?.reference ?? "From"} Pin</th><th>{toComponent?.reference ?? "To"} Pin</th></tr></thead><tbody>{selected?.cores.map((core, index) => {
            const mapping = coreMappings[index] ?? { used: false, color: core.color, fromPinId: "", toPinId: "" };
            return <tr key={index} className={mapping.used ? "" : "is-unused"}><td><input aria-label={`${index + 1}번 코어 사용`} type="checkbox" checked={mapping.used} onChange={(event) => setCoreMappings((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, used: event.target.checked } : item))} /></td><td>{index + 1}</td><td>{core.name}</td><td><CoreColorEditor index={index} value={mapping.color} onChange={(color) => setCoreMappings((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, color } : item))} /></td><td>{core.gauge}</td><td>{fromIsFree ? <strong className="hd2-free-end-value">탈피</strong> : <PinSelect ariaLabel={`${index + 1}번 코어 From Pin`} pins={fromComponent?.pins ?? []} value={mapping.fromPinId} disabled={!mapping.used} onChange={(value) => setCoreMappings((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, fromPinId: value } : item))} />}</td><td>{toIsFree ? <strong className="hd2-free-end-value">탈피</strong> : <PinSelect ariaLabel={`${index + 1}번 코어 To Pin`} pins={toComponent?.pins ?? []} value={mapping.toPinId} disabled={!mapping.used} onChange={(value) => setCoreMappings((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, toPinId: value } : item))} />}</td></tr>;
          })}</tbody></table></div></div>}
        </section>
      </div>}
      {error && <div className="hd2-library-error">{error}</div>}
      <footer><button type="button" onClick={onCancel}>취소</button><button type="button" className="is-primary" disabled={!summary || !selected || harness.components.length < 1 || (fromIsFree && toIsFree)} onClick={submit}><Plus size={15} />{kind === "wire" ? "전선 생성" : "케이블 런 생성"}</button></footer>
    </section>
  </div>;
}

function CoreColorEditor({ index, value, onChange }: { index: number; value: string; onChange: (value: string) => void }) {
  const { primary, secondary } = splitWireColor(value);
  return <span className="hd2-core-color-editor">
    <i style={{ background: wireColorBackground(value) }} />
    <select aria-label={`${index + 1}번 코어 기본 색상`} value={primary} onChange={(event) => onChange(joinWireColor(event.target.value, secondary))}>{WIRE_COLOR_CODES.map((color) => <option key={color}>{color}</option>)}</select>
    <select aria-label={`${index + 1}번 코어 보조 색상`} value={secondary} onChange={(event) => onChange(joinWireColor(primary, event.target.value))}><option value="">없음</option>{WIRE_COLOR_CODES.map((color) => <option key={color}>{color}</option>)}</select>
  </span>;
}

function PinSelect({ ariaLabel, pins, value, disabled, onChange }: { ariaLabel: string; pins: Harness2D["components"][number]["pins"]; value: string; disabled?: boolean; onChange: (value: string) => void }) {
  return <select aria-label={ariaLabel} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}><option value="">핀 선택</option>{pins.map((pin) => <option key={pin.id} value={pin.id}>{pin.number} · {pin.name}</option>)}</select>;
}

function runEndpoint(
  harness: Harness2D,
  side: "from" | "to",
  component: Harness2D["components"][number] | undefined,
  pinId: string,
  oppositeComponent: Harness2D["components"][number] | undefined,
  oppositePinId: string,
  stripLengthMm: number,
): PinEndpoint2D {
  if (component) {
    if (!pinId) throw new Error("커넥터 핀을 지정하세요.");
    return { componentId: component.id, pinId };
  }
  if (!oppositeComponent || !oppositePinId) throw new Error("탈피 끝단 반대쪽의 커넥터 핀을 지정하세요.");
  if (!Number.isFinite(stripLengthMm) || stripLengthMm < 0) throw new Error("탈피 길이는 0 이상이어야 합니다.");
  const anchor = endpointPosition(harness, { componentId: oppositeComponent.id, pinId: oppositePinId });
  return {
    componentId: "",
    pinId: "",
    freeEnd: {
      position: { x: anchor.x + (side === "from" ? -300 : 300), y: anchor.y },
      stripLengthMm,
    },
  };
}
