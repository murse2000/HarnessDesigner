import { Cable, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { backendInvoke } from "../platform";
import { libraryPartToCableSnapshot, libraryPartToWireSnapshot, type LibraryPage2D, type LibraryPart2D, type LibrarySummary2D } from "./library";
import type { CableRunDraft2D, Harness2D, PinEndpoint2D, WireRunDraft2D } from "./model";

type Props = {
  kind: "wire" | "cable";
  summary: LibrarySummary2D | null;
  harness: Harness2D;
  onCancel: () => void;
  onOpenLibrary: () => void;
  onSubmit: (draft: WireRunDraft2D | CableRunDraft2D) => void;
};

type CoreMappingState = {
  used: boolean;
  fromPinId: string;
  toPinId: string;
};

export function WireCableRunDialog({ kind, summary, harness, onCancel, onOpenLibrary, onSubmit }: Props) {
  const [query, setQuery] = useState("");
  const [parts, setParts] = useState<LibraryPart2D[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [fromComponentId, setFromComponentId] = useState(harness.components[0]?.id ?? "");
  const [toComponentId, setToComponentId] = useState(harness.components[1]?.id ?? harness.components[0]?.id ?? "");
  const [fromPinId, setFromPinId] = useState("");
  const [toPinId, setToPinId] = useState("");
  const [lengthMm, setLengthMm] = useState(300);
  const [coreMappings, setCoreMappings] = useState<CoreMappingState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selected = useMemo(() => parts.find((part) => part.id === selectedId), [parts, selectedId]);
  const fromComponent = harness.components.find((component) => component.id === fromComponentId);
  const toComponent = harness.components.find((component) => component.id === toComponentId);

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
      used: Boolean(fromComponent?.pins[index] && toComponent?.pins[index]),
      fromPinId: fromComponent?.pins[index]?.id ?? "",
      toPinId: toComponent?.pins[index]?.id ?? "",
    })));
    setFromPinId(fromComponent?.pins[0]?.id ?? "");
    setToPinId(toComponent?.pins[0]?.id ?? "");
  }, [selected?.id, fromComponentId, toComponentId]);

  const submit = () => {
    if (!selected || !summary || !fromComponent || !toComponent) return;
    try {
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
          from: endpoint(fromComponent.id, fromPinId),
          to: endpoint(toComponent.id, toPinId),
          lengthMm,
        });
        return;
      }
      const snapshot = libraryPartToCableSnapshot(selected, summary);
      onSubmit({
        part: snapshot,
        lengthMm,
        mappings: coreMappings.flatMap((mapping, coreIndex) => mapping.used ? [{
          coreIndex,
          from: endpoint(fromComponent.id, mapping.fromPinId),
          to: endpoint(toComponent.id, mapping.toPinId),
        }] : []),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  return <div className="hd2-dialog-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="hd2-dialog hd2-run-dialog" role="dialog" aria-label={kind === "wire" ? "단선 추가" : "멀티코어 케이블 추가"}>
      <header><Cable size={17} /><strong>{kind === "wire" ? "단선 추가" : "멀티코어 케이블 추가"}</strong><span>외부 라이브러리 부품을 하우징 핀에 매핑합니다.</span></header>
      {!summary ? <div className="hd2-run-empty"><strong>외부 부품 라이브러리가 필요합니다.</strong><button type="button" onClick={onOpenLibrary}>라이브러리 관리</button></div> : <div className="hd2-run-body">
        <section className="hd2-run-parts">
          <div className="hd2-picker-search"><Search size={14} /><input aria-label={`${kind === "wire" ? "단선" : "케이블"} 라이브러리 검색`} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void search(); } }} /><button type="button" onClick={() => void search()}>검색</button></div>
          {loading && <div className="hd2-picker-loading">검색 중...</div>}
          <div className="hd2-run-part-list">{parts.map((part) => <button type="button" className={selectedId === part.id ? "is-selected" : ""} key={part.id} onClick={() => setSelectedId(part.id)}><span>{part.manufacturer}</span><strong>{part.partNumber}</strong><em>{part.name}</em><small>{kind === "wire" ? part.cores[0]?.gauge : `${part.cores.length}C · Ø${part.outerDiameterMm} mm`}</small></button>)}{!loading && parts.length === 0 && <p>등록된 {kind === "wire" ? "단선" : "케이블"} 부품이 없습니다.</p>}</div>
        </section>
        <section className="hd2-run-mapping">
          <div className="hd2-run-fields">
            <label><span>From Housing</span><select aria-label="From Housing" value={fromComponentId} onChange={(event) => setFromComponentId(event.target.value)}>{harness.components.map((component) => <option value={component.id} key={component.id}>{component.reference} · {component.name}</option>)}</select></label>
            <label><span>To Housing</span><select aria-label="To Housing" value={toComponentId} onChange={(event) => setToComponentId(event.target.value)}>{harness.components.map((component) => <option value={component.id} key={component.id}>{component.reference} · {component.name}</option>)}</select></label>
            <label><span>Length (mm)</span><input aria-label="Length (mm)" type="number" min="0.1" value={lengthMm} onChange={(event) => setLengthMm(Number(event.target.value))} /></label>
          </div>
          {kind === "wire" ? <div className="hd2-wire-mapping">
            <label><span>From Pin</span><PinSelect ariaLabel="From Pin" pins={fromComponent?.pins ?? []} value={fromPinId} onChange={setFromPinId} /></label>
            <div className="hd2-core-color"><i style={{ background: colorValue(selected?.cores[0]?.color ?? "BK") }} />{selected?.cores[0]?.color ?? "—"} · {selected?.cores[0]?.gauge ?? "—"}</div>
            <label><span>To Pin</span><PinSelect ariaLabel="To Pin" pins={toComponent?.pins ?? []} value={toPinId} onChange={setToPinId} /></label>
          </div> : <div className="hd2-core-map"><h3>CORE PIN MAPPING <span>{coreMappings.filter((item) => item.used).length} / {selected?.cores.length ?? 0}</span></h3><div className="hd2-core-map-scroll"><table><thead><tr><th>사용</th><th>Core</th><th>Name</th><th>Color</th><th>Gauge</th><th>{fromComponent?.reference ?? "From"} Pin</th><th>{toComponent?.reference ?? "To"} Pin</th></tr></thead><tbody>{selected?.cores.map((core, index) => {
            const mapping = coreMappings[index] ?? { used: false, fromPinId: "", toPinId: "" };
            return <tr key={index} className={mapping.used ? "" : "is-unused"}><td><input aria-label={`${index + 1}번 코어 사용`} type="checkbox" checked={mapping.used} onChange={(event) => setCoreMappings((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, used: event.target.checked } : item))} /></td><td>{index + 1}</td><td>{core.name}</td><td><span className="hd2-core-color"><i style={{ background: colorValue(core.color) }} />{core.color}</span></td><td>{core.gauge}</td><td><PinSelect ariaLabel={`${index + 1}번 코어 From Pin`} pins={fromComponent?.pins ?? []} value={mapping.fromPinId} disabled={!mapping.used} onChange={(value) => setCoreMappings((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, fromPinId: value } : item))} /></td><td><PinSelect ariaLabel={`${index + 1}번 코어 To Pin`} pins={toComponent?.pins ?? []} value={mapping.toPinId} disabled={!mapping.used} onChange={(value) => setCoreMappings((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, toPinId: value } : item))} /></td></tr>;
          })}</tbody></table></div></div>}
        </section>
      </div>}
      {error && <div className="hd2-library-error">{error}</div>}
      <footer><button type="button" onClick={onCancel}>취소</button><button type="button" className="is-primary" disabled={!summary || !selected || harness.components.length < 2} onClick={submit}><Plus size={15} />{kind === "wire" ? "전선 생성" : "케이블 런 생성"}</button></footer>
    </section>
  </div>;
}

function PinSelect({ ariaLabel, pins, value, disabled, onChange }: { ariaLabel: string; pins: Harness2D["components"][number]["pins"]; value: string; disabled?: boolean; onChange: (value: string) => void }) {
  return <select aria-label={ariaLabel} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}><option value="">핀 선택</option>{pins.map((pin) => <option key={pin.id} value={pin.id}>{pin.number} · {pin.name}</option>)}</select>;
}

function endpoint(componentId: string, pinId: string): PinEndpoint2D {
  if (!componentId || !pinId) throw new Error("양쪽 하우징과 핀을 모두 지정하세요.");
  return { componentId, pinId };
}

function colorValue(code: string) {
  const colors: Record<string, string> = { BK: "#20262c", WH: "#f4f6f8", RD: "#d73c3c", BU: "#2c7ec8", GN: "#28965a", YE: "#e7bd20", OR: "#e87924", BN: "#7a4d2c", VT: "#7557a6", GY: "#788590" };
  return colors[code.toUpperCase()] ?? "#7a8792";
}
