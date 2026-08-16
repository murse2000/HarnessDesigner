import { MousePointer2, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createDrawingPreview } from "../domain/partPreview";
import { getPartName } from "../domain/parts";
import type { PartSnapshot } from "../domain/types";
import type { CadImportResult } from "../import/cadImport";
import { backendInvoke, isTauri } from "../platform";
import { useProjectStore } from "../store/projectStore";
import { Field, IconButton } from "./common";

interface NewTerminal {
  id: string;
  name: string;
  partNumber: string;
  manufacturer: string;
  revision: string;
  wireRange: string;
  maxConductors: string;
  description: string;
}

export function CadImportDialog({ result, onClose, onSaved }: {
  result: CadImportResult;
  onClose: () => void;
  onSaved?: (part: PartSnapshot, relatedParts: PartSnapshot[]) => void;
}) {
  const { snapshot, updateProject } = useProjectStore();
  const [name, setName] = useState(result.asset.name);
  const [partNumber, setPartNumber] = useState(result.asset.name.toUpperCase());
  const [manufacturer, setManufacturer] = useState("");
  const [description, setDescription] = useState("");
  const [revision, setRevision] = useState("A");
  const [libraryParts, setLibraryParts] = useState<PartSnapshot[]>([]);
  const [selectedTerminalIds, setSelectedTerminalIds] = useState<string[]>([]);
  const [defaultTerminalId, setDefaultTerminalId] = useState<string | null>(null);
  const [newTerminals, setNewTerminals] = useState<NewTerminal[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pins, setPins] = useState<Array<{ id: string; number: string; name: string; position: { x: number; y: number } }>>([]);
  const [viewX, viewY, viewWidth, viewHeight] = useMemo(() => result.asset.viewBox.split(/\s+/).map(Number), [result.asset.viewBox]);

  useEffect(() => {
    if (!isTauri()) return;
    void backendInvoke<PartSnapshot[]>("list_library_parts").then(setLibraryParts).catch((error) => setSaveError(String(error)));
  }, []);

  const terminalParts = useMemo(() => {
    const projectParts = snapshot?.project.parts.filter((part) => part.category === "terminal") ?? [];
    const projectIds = new Set(projectParts.map((part) => part.id));
    return [...projectParts, ...libraryParts.filter((part) => part.category === "terminal" && !projectIds.has(part.id))];
  }, [libraryParts, snapshot]);

  const addPin = (event: React.MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = viewX + ((event.clientX - bounds.left) / bounds.width) * viewWidth;
    const y = viewY + ((event.clientY - bounds.top) / bounds.height) * viewHeight;
    setPins((current) => [...current, { id: crypto.randomUUID(), number: String(current.length + 1), name: "", position: { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) } }]);
  };

  const toggleTerminal = (id: string) => {
    setSelectedTerminalIds((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      if (!next.includes(defaultTerminalId ?? "")) setDefaultTerminalId(next[0] ?? newTerminals[0]?.id ?? null);
      return next;
    });
  };

  const addNewTerminal = () => {
    const id = crypto.randomUUID();
    setNewTerminals((current) => [...current, { id, name: "", partNumber: "", manufacturer: "", revision: "A", wireRange: "", maxConductors: "1", description: "" }]);
    if (!defaultTerminalId) setDefaultTerminalId(id);
  };

  const updateNewTerminal = (id: string, field: keyof Omit<NewTerminal, "id">, value: string) => {
    setNewTerminals((current) => current.map((terminal) => terminal.id === id ? { ...terminal, [field]: value } : terminal));
  };

  const savePart = async () => {
    const incomplete = newTerminals.some((terminal) => !terminal.name.trim() || !terminal.partNumber.trim() || !terminal.manufacturer.trim() || !terminal.revision.trim() || !["1", "2"].includes(terminal.maxConductors));
    if (incomplete) {
      setSaveError("신규 터미널의 파트명, 파트번호, 제조사, Revision을 모두 입력하세요.");
      return;
    }
    const createdTerminals = newTerminals.map((terminal): PartSnapshot => ({
      id: terminal.id,
      name: terminal.name.trim(),
      partNumber: terminal.partNumber.trim(),
      manufacturer: terminal.manufacturer.trim(),
      description: terminal.description.trim(),
      revision: terminal.revision.trim(),
      category: "terminal",
      unit: "ea",
      gauge: terminal.wireRange.trim() || undefined,
      attributes: { ...(terminal.wireRange.trim() ? { wireRange: terminal.wireRange.trim() } : {}), maxConductors: terminal.maxConductors },
      sourceLibraryRevision: 1,
    }));
    const selectedTerminals = terminalParts.filter((terminal) => selectedTerminalIds.includes(terminal.id));
    const compatibleTerminals = [...selectedTerminals, ...createdTerminals];
    if (!compatibleTerminals.length) {
      setSaveError("하우징에 사용 가능한 터미널을 하나 이상 선택하거나 등록하세요.");
      return;
    }
    const compatibleTerminalIds = compatibleTerminals.map((terminal) => terminal.id);
    const resolvedDefaultTerminalId = compatibleTerminalIds.includes(defaultTerminalId ?? "") ? defaultTerminalId! : compatibleTerminalIds[0];
    const part: PartSnapshot = {
      id: crypto.randomUUID(),
      name: name.trim(),
      partNumber: partNumber.trim(),
      manufacturer: manufacturer.trim(),
      description: description.trim(),
      revision: revision.trim(),
      category: "housing",
      unit: "ea",
      attributes: {
        pinCount: String(pins.length),
        pinMap: JSON.stringify(pins),
        compatibleTerminalPartIds: JSON.stringify(compatibleTerminalIds),
        defaultTerminalPartId: resolvedDefaultTerminalId,
      },
      preview: createDrawingPreview(result.asset),
      symbolAssetId: result.asset.id,
      sourceLibraryRevision: 1,
    };
    setSaving(true);
    setSaveError(null);
    try {
      if (isTauri()) {
        for (const terminal of compatibleTerminals) await backendInvoke("upsert_library_part", { part: terminal });
        await backendInvoke("upsert_library_symbol_asset", { asset: result.asset });
        await backendInvoke("upsert_library_part", { part });
      }
      await updateProject((project) => {
        if (!project.assets.some((asset) => asset.id === result.asset.id)) project.assets.push(result.asset);
        for (const terminal of compatibleTerminals) {
          if (!project.parts.some((item) => item.id === terminal.id)) project.parts.push(terminal);
        }
        if (!project.parts.some((item) => item.id === part.id)) project.parts.push(part);
      });
      onSaved?.(part, compatibleTerminals);
      onClose();
    } catch (error) {
      setSaveError(String(error));
    } finally {
      setSaving(false);
    }
  };

  return <div className="modal-backdrop"><section className="cad-dialog"><header><div><strong>하우징 및 터미널 등록</strong><span>{result.asset.sourceName} · {result.asset.sourceFormat.toUpperCase()}</span></div><IconButton title="닫기" onClick={onClose}><X size={14} /></IconButton></header><div className="cad-body"><div className="cad-preview" onClick={addPin}><div dangerouslySetInnerHTML={{ __html: result.asset.svg }} />{pins.map((pin) => <span key={pin.id} style={{ left: `${((pin.position.x - viewX) / viewWidth) * 100}%`, top: `${((pin.position.y - viewY) / viewHeight) * 100}%` }}>{pin.number}</span>)}</div><aside><div className="cad-hint"><MousePointer2 size={14} />외형의 캐비티 중심을 순서대로 클릭해 핀 좌표를 지정하세요.</div><div className="part-form-section"><strong>HOUSING</strong><Field label="파트명"><input value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="Part No."><input value={partNumber} onChange={(event) => setPartNumber(event.target.value)} /></Field><Field label="제조사"><input value={manufacturer} onChange={(event) => setManufacturer(event.target.value)} /></Field><Field label="Revision"><input value={revision} onChange={(event) => setRevision(event.target.value)} /></Field><Field label="설명"><input value={description} onChange={(event) => setDescription(event.target.value)} /></Field></div><div className="pin-list"><div><strong>PIN MAP</strong><span>{pins.length}</span><IconButton title="마지막 핀 취소" onClick={() => setPins((current) => current.slice(0, -1))}><RotateCcw size={12} /></IconButton></div>{pins.map((pin) => <label key={pin.id}><input value={pin.number} onChange={(event) => setPins((current) => current.map((item) => item.id === pin.id ? { ...item, number: event.target.value } : item))} /><code>X {pin.position.x}</code><code>Y {pin.position.y}</code></label>)}</div><div className="terminal-section"><div className="terminal-section__head"><strong>COMPATIBLE TERMINALS</strong><button onClick={addNewTerminal}><Plus size={11} />신규 등록</button></div>{terminalParts.map((terminal) => <label className="terminal-choice" key={terminal.id}><input type="checkbox" checked={selectedTerminalIds.includes(terminal.id)} onChange={() => toggleTerminal(terminal.id)} /><span><strong>{getPartName(terminal)}</strong><code>{terminal.partNumber}</code><small>{terminal.manufacturer} · {terminal.gauge || terminal.attributes.wireRange || "규격 미지정"}</small></span><input title="기본 터미널" type="radio" name="default-terminal" checked={defaultTerminalId === terminal.id} disabled={!selectedTerminalIds.includes(terminal.id)} onChange={() => setDefaultTerminalId(terminal.id)} /></label>)}{newTerminals.map((terminal) => <div className="new-terminal" key={terminal.id}><div><strong>신규 터미널</strong><label><input type="radio" name="default-terminal" checked={defaultTerminalId === terminal.id} onChange={() => setDefaultTerminalId(terminal.id)} />기본</label><IconButton title="터미널 삭제" onClick={() => { setNewTerminals((current) => current.filter((item) => item.id !== terminal.id)); if (defaultTerminalId === terminal.id) setDefaultTerminalId(selectedTerminalIds[0] ?? null); }}><Trash2 size={11} /></IconButton></div><input placeholder="파트명 *" value={terminal.name} onChange={(event) => updateNewTerminal(terminal.id, "name", event.target.value)} /><input placeholder="파트번호 *" value={terminal.partNumber} onChange={(event) => updateNewTerminal(terminal.id, "partNumber", event.target.value)} /><input placeholder="제조사 *" value={terminal.manufacturer} onChange={(event) => updateNewTerminal(terminal.id, "manufacturer", event.target.value)} /><input placeholder="Revision *" value={terminal.revision} onChange={(event) => updateNewTerminal(terminal.id, "revision", event.target.value)} /><input placeholder="적용 전선 규격" value={terminal.wireRange} onChange={(event) => updateNewTerminal(terminal.id, "wireRange", event.target.value)} /><input placeholder="설명" value={terminal.description} onChange={(event) => updateNewTerminal(terminal.id, "description", event.target.value)} /></div>)}</div>{result.warnings.length > 0 && <ul className="cad-warnings">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}{saveError && <div className="connector-library-error">{saveError}</div>}</aside></div><footer><button onClick={onClose}>취소</button><button className="primary" disabled={saving || !name.trim() || !partNumber.trim() || !manufacturer.trim() || !revision.trim() || !pins.length} onClick={() => void savePart()}><Save size={13} />{saving ? "저장 중…" : "하우징과 터미널 저장"}</button></footer></section></div>;
}
