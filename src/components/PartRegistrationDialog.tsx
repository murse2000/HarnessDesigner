import { open } from "@tauri-apps/plugin-dialog";
import { Boxes, FileBox, ImagePlus, Plus, Save, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { partCategories as categories } from "../domain/partCategories";
import { createModelPreview, createPhotoPreview } from "../domain/partPreview";
import { getPartName } from "../domain/parts";
import type { CableConstruction, ModelAsset, PartCategory, PartPreview, PartSnapshot, PinDefinition, QuantityUnit } from "../domain/types";
import { backendInvoke, isTauri } from "../platform";
import { loadAppPreferences } from "../preferences";
import { useProjectStore } from "../store/projectStore";
import { importStepAsset } from "../three/stepImport";
import { defaultModelPlacement, saveModelPlacement, type ModelPlacement } from "../three/modelPlacement";
import { Field, IconButton } from "./common";
import { ModelPlacementControls } from "./ModelPlacementControls";
import { Part3DPreview } from "./ThreeDView";

interface NewTerminal {
  id: string;
  name: string;
  partNumber: string;
  manufacturer: string;
  revision: string;
  wireRange: string;
  maxConductors: string;
}

export function PartRegistrationDialog({ onClose, onSaved }: { onClose: () => void; onSaved?: (parts: PartSnapshot[]) => void }) {
  const { snapshot, updateProject } = useProjectStore();
  const [category, setCategory] = useState<PartCategory>("housing");
  const [name, setName] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [revision, setRevision] = useState("A");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState<QuantityUnit>("ea");
  const [color, setColor] = useState("");
  const [gauge, setGauge] = useState("");
  const [maxConductors, setMaxConductors] = useState("1");
  const [coreCount, setCoreCount] = useState("");
  const [cableConstruction, setCableConstruction] = useState<CableConstruction>("multiCore");
  const [shieldConstruction, setShieldConstruction] = useState("");
  const [outerDiameterMm, setOuterDiameterMm] = useState("");
  const [coreDiameterMm, setCoreDiameterMm] = useState("");
  const [breakoutLengthMm, setBreakoutLengthMm] = useState("");
  const [finishedDiameterMm, setFinishedDiameterMm] = useState("");
  const [heatShrinkLengthMm, setHeatShrinkLengthMm] = useState("");
  const [pins, setPins] = useState<PinDefinition[]>([]);
  const [libraryParts, setLibraryParts] = useState<PartSnapshot[]>([]);
  const [selectedTerminalIds, setSelectedTerminalIds] = useState<string[]>([]);
  const [defaultTerminalId, setDefaultTerminalId] = useState<string | null>(null);
  const [newTerminals, setNewTerminals] = useState<NewTerminal[]>([]);
  const [modelAsset, setModelAsset] = useState<ModelAsset | null>(null);
  const [photoPreview, setPhotoPreview] = useState<PartPreview | null>(null);
  const [modelPlacement, setModelPlacement] = useState<ModelPlacement>({ ...defaultModelPlacement });
  const [modelState, setModelState] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    void backendInvoke<PartSnapshot[]>("list_library_parts").then(setLibraryParts).catch((reason) => setError(String(reason)));
  }, []);

  const terminals = useMemo(() => {
    const projectTerminals = snapshot?.project.parts.filter((part) => part.category === "terminal") ?? [];
    const projectIds = new Set(projectTerminals.map((part) => part.id));
    return [...projectTerminals, ...libraryParts.filter((part) => part.category === "terminal" && !projectIds.has(part.id))];
  }, [libraryParts, snapshot]);

  if (!snapshot) return null;

  const changeCategory = (next: PartCategory) => {
    setCategory(next);
    setUnit(["wire", "cable", "sleeve", "shield", "tape"].includes(next) ? "m" : "ea");
    setError(null);
  };
  const changePinCount = (count: number) => {
    const safeCount = Math.max(0, Math.min(512, Number.isFinite(count) ? Math.floor(count) : 0));
    setPins((current) => Array.from({ length: safeCount }, (_, index) => current[index] ?? ({ id: crypto.randomUUID(), number: String(index + 1), name: "", position: { x: (index % 8) * 20, y: Math.floor(index / 8) * 20 } })));
  };
  const toggleTerminal = (id: string) => {
    setSelectedTerminalIds((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      if (!next.includes(defaultTerminalId ?? "")) setDefaultTerminalId(next[0] ?? newTerminals[0]?.id ?? null);
      return next;
    });
  };
  const addTerminal = () => {
    const id = crypto.randomUUID();
    setNewTerminals((current) => [...current, { id, name: "", partNumber: "", manufacturer: "", revision: "A", wireRange: "", maxConductors: "1" }]);
    if (!defaultTerminalId) setDefaultTerminalId(id);
  };
  const updateTerminal = (id: string, field: keyof Omit<NewTerminal, "id">, value: string) => {
    setNewTerminals((current) => current.map((terminal) => terminal.id === id ? { ...terminal, [field]: value } : terminal));
  };

  const chooseStep = async () => {
    if (!isTauri()) return;
    const path = await open({ multiple: false, directory: false, defaultPath: loadAppPreferences().defaultImportDirectory || undefined, filters: [{ name: "STEP 3D model", extensions: ["step", "stp"] }] });
    if (!path) return;
    setError(null);
    setModelState("STEP 형상 변환 중…");
    try {
      const bytes = await backendInvoke<number[]>("read_binary_file", { path });
      const sourceName = path.split(/[\\/]/).pop() ?? "model.step";
      const asset = await importStepAsset(Uint8Array.from(bytes), sourceName, loadAppPreferences().stepImportQuality);
      setModelAsset(asset);
      setModelState(`${sourceName} · ${asset.meshes.length} meshes`);
    } catch (reason) {
      setModelAsset(null);
      setModelState(null);
      setError(`STEP 파일을 불러오지 못했습니다: ${String(reason)}`);
    }
  };

  const choosePhoto = async () => {
    if (!isTauri()) return;
    const path = await open({ multiple: false, directory: false, defaultPath: loadAppPreferences().defaultImportDirectory || undefined, filters: [{ name: "부품 사진", extensions: ["jpg", "jpeg", "png", "webp"] }] });
    if (!path) return;
    setError(null);
    try {
      const bytes = await backendInvoke<number[]>("read_binary_file", { path });
      const sourceName = path.split(/[\\/]/).pop() ?? "part-photo.jpg";
      setPhotoPreview(await createPhotoPreview(Uint8Array.from(bytes), sourceName));
    } catch (reason) {
      setPhotoPreview(null);
      setError(`대표 사진을 불러오지 못했습니다: ${String(reason)}`);
    }
  };

  const savePart = async () => {
    if (!name.trim() || !partNumber.trim() || !manufacturer.trim() || !revision.trim()) {
      setError("파트명, 파트번호, 제조사, Revision을 모두 입력하세요.");
      return;
    }
    const incompleteTerminal = newTerminals.some((terminal) => !terminal.name.trim() || !terminal.partNumber.trim() || !terminal.manufacturer.trim() || !terminal.revision.trim() || !["1", "2"].includes(terminal.maxConductors));
    if (incompleteTerminal) {
      setError("신규 터미널의 필수 정보를 모두 입력하세요.");
      return;
    }
    if (category === "cable") {
      if (!color.trim() || [coreCount, outerDiameterMm, coreDiameterMm, breakoutLengthMm].some((value) => !Number.isFinite(Number(value)) || Number(value) <= 0)) {
        setError("케이블의 외피 색상, 심 수, 외경, 내선 지름, 브레이크아웃 길이를 입력하세요.");
        return;
      }
      if (!Number.isInteger(Number(coreCount)) || Number(coreDiameterMm) > Number(outerDiameterMm)) {
        setError("심 수는 정수여야 하며 내선 지름은 케이블 외경보다 클 수 없습니다.");
        return;
      }
      if (cableConstruction === "shieldedMultiCore" && !shieldConstruction.trim()) {
        setError("실드 멀티코어 케이블의 실드 구조를 입력하세요.");
        return;
      }
    }
    if (category === "heatShrink" && (!color.trim() || [finishedDiameterMm, heatShrinkLengthMm].some((value) => !Number.isFinite(Number(value)) || Number(value) <= 0))) {
      setError("수축튜브의 색상, 마감 외경, 길이를 입력하세요.");
      return;
    }
    if (category === "terminal" && !["1", "2"].includes(maxConductors)) {
      setError("터미널당 허용 전선 수는 1 또는 2여야 합니다.");
      return;
    }
    const createdTerminals = newTerminals.map((terminal): PartSnapshot => ({
      id: terminal.id,
      name: terminal.name.trim(),
      partNumber: terminal.partNumber.trim(),
      manufacturer: terminal.manufacturer.trim(),
      description: "",
      revision: terminal.revision.trim(),
      category: "terminal",
      unit: "ea",
      gauge: terminal.wireRange.trim() || undefined,
      attributes: { ...(terminal.wireRange.trim() ? { wireRange: terminal.wireRange.trim() } : {}), maxConductors: terminal.maxConductors },
      sourceLibraryRevision: 1,
    }));
    const selectedTerminals = terminals.filter((terminal) => selectedTerminalIds.includes(terminal.id));
    const compatibleTerminals = category === "housing" ? [...selectedTerminals, ...createdTerminals] : [];
    if (category === "housing" && (!pins.length || !compatibleTerminals.length)) {
      setError("하우징은 핀을 하나 이상 정의하고 호환 터미널을 하나 이상 지정해야 합니다.");
      return;
    }
    const terminalIds = compatibleTerminals.map((terminal) => terminal.id);
    const resolvedDefault = terminalIds.includes(defaultTerminalId ?? "") ? defaultTerminalId! : (terminalIds[0] ?? "");
    let attributes: Record<string, string> = {};
    if (category === "housing") {
      attributes.pinCount = String(pins.length);
      attributes.pinMap = JSON.stringify(pins);
      attributes.compatibleTerminalPartIds = JSON.stringify(terminalIds);
      attributes.defaultTerminalPartId = resolvedDefault;
    } else if (category === "terminal") {
      if (gauge.trim()) attributes.wireRange = gauge.trim();
      attributes.maxConductors = maxConductors;
    } else if (category === "cable") {
      attributes.construction = cableConstruction;
      attributes.coreCount = String(Math.floor(Number(coreCount)));
      attributes.outerDiameterMm = String(Number(outerDiameterMm));
      attributes.coreDiameterMm = String(Number(coreDiameterMm));
      attributes.breakoutLengthMm = String(Number(breakoutLengthMm));
      if (cableConstruction === "shieldedMultiCore") attributes.shieldConstruction = shieldConstruction.trim();
    } else if (category === "heatShrink") {
      attributes.finishedDiameterMm = String(Number(finishedDiameterMm));
      attributes.lengthMm = String(Number(heatShrinkLengthMm));
    }
    if (modelAsset) attributes = saveModelPlacement(attributes, modelPlacement);
    const part: PartSnapshot = {
      id: crypto.randomUUID(),
      name: name.trim(),
      partNumber: partNumber.trim(),
      manufacturer: manufacturer.trim(),
      description: description.trim(),
      revision: revision.trim(),
      category,
      unit,
      color: color.trim() || undefined,
      gauge: gauge.trim() || undefined,
      attributes,
      preview: photoPreview ?? (modelAsset ? createModelPreview(modelAsset) : undefined),
      modelAssetId: modelAsset?.id,
      sourceLibraryRevision: 1,
    };
    setSaving(true);
    setError(null);
    try {
      if (isTauri()) {
        for (const terminal of compatibleTerminals) await backendInvoke("upsert_library_part", { part: terminal });
        if (modelAsset) await backendInvoke("upsert_library_model_asset", { asset: modelAsset });
        await backendInvoke("upsert_library_part", { part });
      }
      await updateProject((project) => {
        for (const related of compatibleTerminals) {
          if (!project.parts.some((item) => item.id === related.id)) project.parts.push(structuredClone(related));
        }
        if (modelAsset && !project.modelAssets.some((item) => item.id === modelAsset.id)) project.modelAssets.push(structuredClone(modelAsset));
        project.parts.push(structuredClone(part));
      });
      onSaved?.([...compatibleTerminals, part]);
      onClose();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setSaving(false);
    }
  };

  return <div className="modal-backdrop"><section className="editor-dialog part-registration-dialog" role="dialog" aria-modal="true"><header><div><Boxes size={15} /><strong>공용 부품 라이브러리 등록</strong><span>등록한 부품은 다른 프로젝트에서도 불러올 수 있습니다.</span></div><IconButton title="닫기" onClick={onClose}><X size={14} /></IconButton></header><div className="part-registration-body"><section><h3>PART INFORMATION</h3><Field label="분류"><select value={category} onChange={(event) => changeCategory(event.target.value as PartCategory)}>{categories.map((item) => <option key={item} value={item}>{item === "heatShrink" ? "HEAT SHRINK" : item.toUpperCase()}</option>)}</select></Field><Field label="파트명"><input value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="Part No."><input value={partNumber} onChange={(event) => setPartNumber(event.target.value)} /></Field><Field label="제조사"><input value={manufacturer} onChange={(event) => setManufacturer(event.target.value)} /></Field><Field label="Revision"><input value={revision} onChange={(event) => setRevision(event.target.value)} /></Field><Field label="설명"><input value={description} onChange={(event) => setDescription(event.target.value)} /></Field><Field label="단위"><select value={unit} onChange={(event) => setUnit(event.target.value as QuantityUnit)}><option value="ea">ea</option><option value="m">m</option></select></Field>{["wire", "terminal"].includes(category) && <Field label={category === "wire" ? "Gauge" : "Wire Range"}><input value={gauge} onChange={(event) => setGauge(event.target.value)} /></Field>}{category === "terminal" && <Field label="터미널당 전선 수"><input type="number" min="1" max="2" value={maxConductors} onChange={(event) => setMaxConductors(event.target.value)} /></Field>}{["wire", "cable", "heatShrink"].includes(category) && <Field label={category === "cable" ? "Jacket Color" : "Color"}><input value={color} onChange={(event) => setColor(event.target.value)} /></Field>}{category === "cable" && <><Field label="케이블 구조"><select value={cableConstruction} onChange={(event) => setCableConstruction(event.target.value as CableConstruction)}><option value="multiCore">멀티코어</option><option value="shieldedMultiCore">실드 멀티코어</option></select></Field>{cableConstruction === "shieldedMultiCore" && <Field label="실드 구조"><input value={shieldConstruction} placeholder="예: 알루미늄 포일 + 드레인 와이어" onChange={(event) => setShieldConstruction(event.target.value)} /></Field>}<Field label="심 수"><input type="number" min="1" value={coreCount} onChange={(event) => setCoreCount(event.target.value)} /></Field><Field label="외경 (mm)"><input type="number" min="0.1" step="0.1" value={outerDiameterMm} onChange={(event) => setOuterDiameterMm(event.target.value)} /></Field><Field label="내선 지름 (mm)"><input type="number" min="0.1" step="0.1" value={coreDiameterMm} onChange={(event) => setCoreDiameterMm(event.target.value)} /></Field><Field label="브레이크아웃 (mm)"><input type="number" min="0.1" step="1" value={breakoutLengthMm} onChange={(event) => setBreakoutLengthMm(event.target.value)} /></Field></>}{category === "heatShrink" && <><Field label="마감 외경 (mm)"><input type="number" min="0.1" step="0.1" value={finishedDiameterMm} onChange={(event) => setFinishedDiameterMm(event.target.value)} /></Field><Field label="길이 (mm)"><input type="number" min="0.1" step="1" value={heatShrinkLengthMm} onChange={(event) => setHeatShrinkLengthMm(event.target.value)} /></Field></>}<div className="photo-registration"><div><h3>대표 사진</h3><button onClick={() => void choosePhoto()}><ImagePlus size={12} />JPG/PNG/WebP 선택</button></div>{photoPreview ? <div><img src={photoPreview.dataUrl} alt="대표 사진 미리보기" /><button title="대표 사진 제거" onClick={() => setPhotoPreview(null)}><Trash2 size={12} /></button></div> : <span>사진이 있으면 3D와 도면보다 우선 표시됩니다.</span>}</div><div className="model-registration"><div><h3>3D STEP MODEL</h3><button onClick={() => void chooseStep()} disabled={modelState === "STEP 형상 변환 중…"}><Upload size={12} />STEP/STP 선택</button></div><Part3DPreview asset={modelAsset} placement={modelPlacement} showCable /><p><FileBox size={11} />{modelState ?? "등록 선택 사항 · 단위는 mm로 변환됩니다."}</p>{modelAsset && <ModelPlacementControls value={modelPlacement} onChange={setModelPlacement} />}</div></section>{category === "housing" && <><section className="pin-definition-editor"><h3>PIN DEFINITION <span>{pins.length}</span></h3><Field label="핀 수"><input type="number" min="1" max="512" value={pins.length || ""} onChange={(event) => changePinCount(Number(event.target.value))} /></Field><div className="pin-definition-table"><table className="data-table"><thead><tr><th>Pin</th><th>Name / Signal</th><th>X</th><th>Y</th></tr></thead><tbody>{pins.map((pin) => <tr key={pin.id}><td><input value={pin.number} onChange={(event) => setPins((current) => current.map((item) => item.id === pin.id ? { ...item, number: event.target.value } : item))} /></td><td><input value={pin.name} onChange={(event) => setPins((current) => current.map((item) => item.id === pin.id ? { ...item, name: event.target.value } : item))} /></td><td className="number">{pin.position.x}</td><td className="number">{pin.position.y}</td></tr>)}</tbody></table></div></section><section className="terminal-registration"><div className="section-heading"><h3>COMPATIBLE TERMINALS</h3><button onClick={addTerminal}><Plus size={11} />신규 터미널</button></div><div className="terminal-candidate-list">{terminals.map((terminal) => <label className="terminal-choice" key={terminal.id}><input type="checkbox" checked={selectedTerminalIds.includes(terminal.id)} onChange={() => toggleTerminal(terminal.id)} /><span><strong>{getPartName(terminal)}</strong><code>{terminal.partNumber}</code><small>{terminal.manufacturer} · {terminal.gauge || terminal.attributes.wireRange || "규격 미지정"} · {terminal.attributes.maxConductors === "2" ? "2선" : "1선"}</small></span><input type="radio" name="part-default-terminal" title="기본 터미널" checked={defaultTerminalId === terminal.id} disabled={!selectedTerminalIds.includes(terminal.id)} onChange={() => setDefaultTerminalId(terminal.id)} /></label>)}</div>{newTerminals.map((terminal) => <div className="new-terminal" key={terminal.id}><div><strong>신규 터미널</strong><label><input type="radio" name="part-default-terminal" checked={defaultTerminalId === terminal.id} onChange={() => setDefaultTerminalId(terminal.id)} />기본</label><IconButton title="터미널 삭제" onClick={() => { setNewTerminals((current) => current.filter((item) => item.id !== terminal.id)); if (defaultTerminalId === terminal.id) setDefaultTerminalId(selectedTerminalIds[0] ?? null); }}><Trash2 size={11} /></IconButton></div><input placeholder="파트명 *" value={terminal.name} onChange={(event) => updateTerminal(terminal.id, "name", event.target.value)} /><input placeholder="파트번호 *" value={terminal.partNumber} onChange={(event) => updateTerminal(terminal.id, "partNumber", event.target.value)} /><input placeholder="제조사 *" value={terminal.manufacturer} onChange={(event) => updateTerminal(terminal.id, "manufacturer", event.target.value)} /><input placeholder="Revision *" value={terminal.revision} onChange={(event) => updateTerminal(terminal.id, "revision", event.target.value)} /><input className="full" placeholder="적용 전선 규격" value={terminal.wireRange} onChange={(event) => updateTerminal(terminal.id, "wireRange", event.target.value)} /><input className="full" type="number" min="1" max="2" title="터미널당 허용 전선 수" value={terminal.maxConductors} onChange={(event) => updateTerminal(terminal.id, "maxConductors", event.target.value)} /></div>)}</section></>}</div>{error && <div className="connector-library-error">{error}</div>}<footer><button onClick={onClose}>취소</button><button className="primary" disabled={saving} onClick={() => void savePart()}><Save size={13} />{saving ? "저장 중…" : "공용 라이브러리에 저장"}</button></footer></section></div>;
}
