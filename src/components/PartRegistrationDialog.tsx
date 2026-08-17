import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Boxes,
  ExternalLink,
  FileBox,
  ImagePlus,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { partCategories as categories } from "../domain/partCategories";
import {
  createDrawingPreview,
  createModelPreview,
  createPhotoPreview,
  getPartDrawingPreview,
  getPartPhotoPreview,
} from "../domain/partPreview";
import {
  defaultCableCores,
  getCableCores,
  validateCableCoreDefinitions,
} from "../domain/cables";
import {
  createPinsFromPart,
  getCompatibleTerminalIds,
  getPartName,
} from "../domain/parts";
import { hydrateLibraryModelAsset } from "../three/modelAssetHydration";
import type {
  CableConstruction,
  CableCoreDefinition,
  ModelAsset,
  PartCategory,
  PartPreview,
  PartSnapshot,
  PinDefinition,
  QuantityUnit,
  SymbolAsset,
} from "../domain/types";
import { backendInvoke, isTauri } from "../platform";
import { loadAppPreferences } from "../preferences";
import { useProjectStore } from "../store/projectStore";
import { importStepAsset } from "../three/stepImport";
import {
  defaultModelPlacement,
  getModelPlacement,
  saveModelPlacement,
  type ModelPlacement,
} from "../three/modelPlacement";
import { Field, IconButton } from "./common";
import { CableDefinitionEditor } from "./CableDefinitionEditor";
import { ModelPlacementControls } from "./ModelPlacementControls";
import { Part3DPreview } from "./ThreeDView";
import {
  assetDropZoneAtPoint,
  type AssetDropZone,
} from "./partAssetDrop";

interface NewTerminal {
  id: string;
  name: string;
  partNumber: string;
  manufacturer: string;
  revision: string;
  wireRange: string;
  maxConductors: string;
}

export function PartRegistrationDialog({
  onClose,
  onSaved,
  part: editingPart,
}: {
  onClose: () => void;
  onSaved?: (parts: PartSnapshot[]) => void;
  part?: PartSnapshot;
}) {
  const { snapshot, updateProject } = useProjectStore();
  const [category, setCategory] = useState<PartCategory>(
    editingPart?.category ?? "housing",
  );
  const [name, setName] = useState(editingPart ? getPartName(editingPart) : "");
  const [partNumber, setPartNumber] = useState(editingPart?.partNumber ?? "");
  const [manufacturer, setManufacturer] = useState(
    editingPart?.manufacturer ?? "",
  );
  const [revision, setRevision] = useState(editingPart?.revision ?? "A");
  const [description, setDescription] = useState(
    editingPart?.description ?? "",
  );
  const [unit, setUnit] = useState<QuantityUnit>(editingPart?.unit ?? "ea");
  const [color, setColor] = useState(editingPart?.color ?? "");
  const [gauge, setGauge] = useState(editingPart?.gauge ?? "");
  const [maxConductors, setMaxConductors] = useState(
    editingPart?.attributes.maxConductors ?? "1",
  );
  const [coreCount, setCoreCount] = useState(
    editingPart?.attributes.coreCount ?? "",
  );
  const [cableCores, setCableCores] = useState<CableCoreDefinition[]>(() =>
    editingPart?.category === "cable" ? getCableCores(editingPart) : [],
  );
  const [cableConstruction, setCableConstruction] = useState<CableConstruction>(
    () =>
      editingPart?.attributes.construction === "shieldedMultiCore"
        ? "shieldedMultiCore"
        : "multiCore",
  );
  const [shieldConstruction, setShieldConstruction] = useState(
    editingPart?.attributes.shieldConstruction ?? "",
  );
  const [shieldCount, setShieldCount] = useState(
    editingPart?.attributes.shieldCount ?? "1",
  );
  const [drainWireColor, setDrainWireColor] = useState(
    editingPart?.attributes.drainWireColor ?? "BARE",
  );
  const [drainWireGauge, setDrainWireGauge] = useState(
    editingPart?.attributes.drainWireGauge ?? "",
  );
  const [outerDiameterMm, setOuterDiameterMm] = useState(
    editingPart?.attributes.outerDiameterMm ?? "",
  );
  const [coreDiameterMm, setCoreDiameterMm] = useState(
    editingPart?.attributes.coreDiameterMm ?? "",
  );
  const [breakoutLengthMm, setBreakoutLengthMm] = useState(
    editingPart?.attributes.breakoutLengthMm ?? "",
  );
  const [minimumBendRadiusMm, setMinimumBendRadiusMm] = useState(
    editingPart?.attributes.minimumBendRadiusMm ?? "",
  );
  const [finishedDiameterMm, setFinishedDiameterMm] = useState(
    editingPart?.attributes.finishedDiameterMm ?? "",
  );
  const [heatShrinkLengthMm, setHeatShrinkLengthMm] = useState(
    editingPart?.attributes.lengthMm ?? "",
  );
  const [pins, setPins] = useState<PinDefinition[]>(() =>
    editingPart?.category === "housing" ? createPinsFromPart(editingPart) : [],
  );
  const [libraryParts, setLibraryParts] = useState<PartSnapshot[]>([]);
  const [selectedTerminalIds, setSelectedTerminalIds] = useState<string[]>(
    () => (editingPart ? getCompatibleTerminalIds(editingPart) : []),
  );
  const [defaultTerminalId, setDefaultTerminalId] = useState<string | null>(
    editingPart?.attributes.defaultTerminalPartId ?? null,
  );
  const [newTerminals, setNewTerminals] = useState<NewTerminal[]>([]);
  const [modelAsset, setModelAsset] = useState<ModelAsset | null>(null);
  const [photoPreview, setPhotoPreview] = useState<PartPreview | null>(
    editingPart?.preview?.kind === "photo" ? editingPart.preview : null,
  );
  const [drawingPreview, setDrawingPreview] = useState<PartPreview | null>(
    getPartDrawingPreview(editingPart) ?? null,
  );
  const [previewChanged, setPreviewChanged] = useState(false);
  const [modelChanged, setModelChanged] = useState(false);
  const [modelPlacement, setModelPlacement] = useState<ModelPlacement>(() =>
    editingPart ? getModelPlacement(editingPart) : { ...defaultModelPlacement },
  );
  const [modelState, setModelState] = useState<string | null>(
    editingPart?.modelAssetId ? "등록된 STEP 모델 불러오는 중…" : null,
  );
  const [photoState, setPhotoState] = useState<string | null>(null);
  const [drawingState, setDrawingState] = useState<string | null>(
    editingPart?.symbolAssetId ? "등록된 2D 도면 불러오는 중…" : null,
  );
  const [activeDropZone, setActiveDropZone] =
    useState<AssetDropZone | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const photoDropRef = useRef<HTMLDivElement>(null);
  const modelDropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isTauri()) return;
    void backendInvoke<PartSnapshot[]>("list_library_parts")
      .then(setLibraryParts)
      .catch((reason) => setError(String(reason)));
  }, []);

  useEffect(() => {
    if (!editingPart?.modelAssetId) return;
    const projectAsset = snapshot?.project.modelAssets.find(
      (asset) => asset.id === editingPart.modelAssetId,
    );
    if (projectAsset) {
      setModelAsset(projectAsset);
      setModelState(
        `${projectAsset.sourceName} · ${projectAsset.meshes.length} meshes`,
      );
      return;
    }
    if (!isTauri()) return;
    void backendInvoke<ModelAsset | null>("get_library_model_asset", {
      assetId: editingPart.modelAssetId,
    })
      .then(async (asset) => {
        const hydrated = asset ? await hydrateLibraryModelAsset(asset) : null;
        setModelAsset(hydrated);
        setModelState(
          hydrated
            ? `${hydrated.sourceName} · ${hydrated.meshes.length} meshes`
            : "등록된 STEP 모델을 찾지 못했습니다.",
        );
      })
      .catch((reason) => {
        setModelState(null);
        setError(`등록된 STEP 모델을 불러오지 못했습니다: ${String(reason)}`);
      });
  }, [editingPart, snapshot]);

  useEffect(() => {
    if (!editingPart?.symbolAssetId) return;
    const projectAsset = snapshot?.project.assets.find(
      (asset) => asset.id === editingPart.symbolAssetId,
    );
    if (projectAsset) {
      setDrawingPreview(createDrawingPreview(projectAsset));
      setDrawingState(projectAsset.sourceName);
      return;
    }
    if (!isTauri()) return;
    void backendInvoke<SymbolAsset | null>("get_library_symbol_asset", {
      assetId: editingPart.symbolAssetId,
    })
      .then((asset) => {
        setDrawingPreview(asset ? createDrawingPreview(asset) : null);
        setDrawingState(
          asset ? asset.sourceName : "등록된 2D 도면을 찾지 못했습니다.",
        );
      })
      .catch((reason) => {
        setDrawingState(null);
        setError(`등록된 2D 도면을 불러오지 못했습니다: ${String(reason)}`);
      });
  }, [editingPart, snapshot]);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let scaleFactor = window.devicePixelRatio || 1;
    let unlisten: () => void = () => undefined;
    void getCurrentWindow()
      .scaleFactor()
      .then((value) => {
        scaleFactor = value;
      });
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (disposed) return;
        if (event.payload.type === "leave") {
          setActiveDropZone(null);
          return;
        }
        const position = event.payload.position.toLogical(scaleFactor);
        const zone = assetDropZoneAtPoint(
          position,
          photoDropRef.current?.getBoundingClientRect(),
          modelDropRef.current?.getBoundingClientRect(),
        );
        setActiveDropZone(zone);
        if (event.payload.type === "drop") {
          setActiveDropZone(null);
          const path = event.payload.paths[0];
          if (zone && path) void handleDroppedPath(zone, path);
        }
      })
      .then((cleanup) => {
        if (disposed) cleanup();
        else unlisten = cleanup;
      });
    return () => {
      disposed = true;
      unlisten();
    };
  }, [editingPart, modelPlacement, onSaved, saving]);

  const terminals = useMemo(() => {
    const projectTerminals =
      snapshot?.project.parts.filter((part) => part.category === "terminal") ??
      [];
    const projectIds = new Set(projectTerminals.map((part) => part.id));
    return [
      ...projectTerminals,
      ...libraryParts.filter(
        (part) => part.category === "terminal" && !projectIds.has(part.id),
      ),
    ];
  }, [libraryParts, snapshot]);

  const displayedPhotoPreview =
    photoPreview ?? getPartPhotoPreview(editingPart) ?? null;
  const drawingUrl = editingPart?.attributes.drawingUrl;

  if (!snapshot) return null;

  const changeCategory = (next: PartCategory) => {
    setCategory(next);
    setUnit(
      ["wire", "cable", "sleeve", "shield", "tape"].includes(next) ? "m" : "ea",
    );
    setError(null);
  };
  const changePinCount = (count: number) => {
    const safeCount = Math.max(
      0,
      Math.min(512, Number.isFinite(count) ? Math.floor(count) : 0),
    );
    setPins((current) =>
      Array.from(
        { length: safeCount },
        (_, index) =>
          current[index] ?? {
            id: crypto.randomUUID(),
            number: String(index + 1),
            name: "",
            position: { x: (index % 8) * 20, y: Math.floor(index / 8) * 20 },
          },
      ),
    );
  };
  const changeCableCoreCount = (value: string) => {
    setCoreCount(value);
    const count = Number(value);
    setCableCores((current) =>
      defaultCableCores(
        Number.isInteger(count) && count > 0 ? count : 0,
        current,
      ).map((core) =>
        core.gauge || !gauge.trim() ? core : { ...core, gauge: gauge.trim() },
      ),
    );
  };
  const updateCableCore = (
    id: string,
    field: "number" | "name" | "color" | "gauge",
    value: string,
  ) => {
    setCableCores((current) =>
      current.map((core) =>
        core.id === id ? { ...core, [field]: value } : core,
      ),
    );
  };
  const applyCommonCoreGauge = () => {
    setCableCores((current) =>
      current.map((core) => ({ ...core, gauge: gauge.trim() })),
    );
  };
  const toggleTerminal = (id: string) => {
    setSelectedTerminalIds((current) => {
      const next = current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id];
      if (!next.includes(defaultTerminalId ?? ""))
        setDefaultTerminalId(next[0] ?? newTerminals[0]?.id ?? null);
      return next;
    });
  };
  const addTerminal = () => {
    const id = crypto.randomUUID();
    setNewTerminals((current) => [
      ...current,
      {
        id,
        name: "",
        partNumber: "",
        manufacturer: "",
        revision: "A",
        wireRange: "",
        maxConductors: "1",
      },
    ]);
    if (!defaultTerminalId) setDefaultTerminalId(id);
  };
  const updateTerminal = (
    id: string,
    field: keyof Omit<NewTerminal, "id">,
    value: string,
  ) => {
    setNewTerminals((current) =>
      current.map((terminal) =>
        terminal.id === id ? { ...terminal, [field]: value } : terminal,
      ),
    );
  };

  async function loadStepPath(path: string, autoSave: boolean) {
    if (!/\.(step|stp)$/i.test(path)) {
      setError("3D 모델 영역에는 STEP 또는 STP 파일만 놓을 수 있습니다.");
      return;
    }
    setError(null);
    setModelState("STEP 형상 변환 중…");
    try {
      const bytes = await backendInvoke<number[]>("read_binary_file", { path });
      const sourceName = path.split(/[\\/]/).pop() ?? "model.step";
      const asset = await importStepAsset(
        Uint8Array.from(bytes),
        sourceName,
        loadAppPreferences().stepImportQuality,
      );
      if (autoSave && editingPart) {
        setSaving(true);
        const updatedPart: PartSnapshot = {
          ...editingPart,
          attributes: saveModelPlacement(
            editingPart.attributes,
            modelPlacement,
          ),
          modelAssetId: asset.id,
          preview:
            editingPart.preview?.kind === "photo"
              ? editingPart.preview
              : createModelPreview(asset),
          sourceLibraryRevision:
            (editingPart.sourceLibraryRevision ?? 0) + 1,
        };
        await backendInvoke("upsert_library_model_asset", { asset });
        await backendInvoke("upsert_library_part", { part: updatedPart });
        onSaved?.([updatedPart]);
      }
      setModelAsset(asset);
      setModelChanged(!autoSave || !editingPart);
      setModelState(
        `${sourceName} · ${asset.meshes.length} meshes${autoSave && editingPart ? " · 자동 저장됨" : ""}`,
      );
    } catch (reason) {
      setModelState(
        editingPart?.modelAssetId ? "기존 STEP 모델 유지됨" : null,
      );
      setError(`STEP 파일을 불러오지 못했습니다: ${String(reason)}`);
    } finally {
      if (autoSave && editingPart) setSaving(false);
    }
  }

  async function loadPhotoPath(path: string, autoSave: boolean) {
    if (!/\.(jpg|jpeg|png|webp)$/i.test(path)) {
      setError("대표 사진 영역에는 JPG, PNG 또는 WebP 파일만 놓을 수 있습니다.");
      return;
    }
    setError(null);
    setPhotoState("대표 사진 불러오는 중…");
    try {
      const bytes = await backendInvoke<number[]>("read_binary_file", { path });
      const sourceName = path.split(/[\\/]/).pop() ?? "part-photo.jpg";
      const preview = await createPhotoPreview(
        Uint8Array.from(bytes),
        sourceName,
      );
      if (autoSave && editingPart) {
        setSaving(true);
        const updatedPart: PartSnapshot = {
          ...editingPart,
          preview,
          sourceLibraryRevision:
            (editingPart.sourceLibraryRevision ?? 0) + 1,
        };
        await backendInvoke("upsert_library_part", { part: updatedPart });
        onSaved?.([updatedPart]);
      }
      setPhotoPreview(preview);
      setPreviewChanged(!autoSave || !editingPart);
      setPhotoState(
        autoSave && editingPart
          ? `${sourceName} · 자동 저장됨`
          : `${sourceName} · 저장 대기`,
      );
    } catch (reason) {
      setPhotoState(
        editingPart?.preview?.kind === "photo" ? "기존 대표 사진 유지됨" : null,
      );
      setError(`대표 사진을 불러오지 못했습니다: ${String(reason)}`);
    } finally {
      if (autoSave && editingPart) setSaving(false);
    }
  }

  async function handleDroppedPath(zone: AssetDropZone, path: string) {
    if (saving) return;
    if (zone === "photo") await loadPhotoPath(path, true);
    else await loadStepPath(path, true);
  }

  const chooseStep = async () => {
    if (!isTauri()) return;
    const path = await open({
      multiple: false,
      directory: false,
      defaultPath: loadAppPreferences().defaultImportDirectory || undefined,
      filters: [{ name: "STEP 3D model", extensions: ["step", "stp"] }],
    });
    if (path) await loadStepPath(path, false);
  };

  const choosePhoto = async () => {
    if (!isTauri()) return;
    const path = await open({
      multiple: false,
      directory: false,
      defaultPath: loadAppPreferences().defaultImportDirectory || undefined,
      filters: [
        { name: "부품 사진", extensions: ["jpg", "jpeg", "png", "webp"] },
      ],
    });
    if (path) await loadPhotoPath(path, false);
  };

  const savePart = async () => {
    if (
      !name.trim() ||
      !partNumber.trim() ||
      !manufacturer.trim() ||
      !revision.trim()
    ) {
      setError("파트명, 파트번호, 제조사, Revision을 모두 입력하세요.");
      return;
    }
    const incompleteTerminal = newTerminals.some(
      (terminal) =>
        !terminal.name.trim() ||
        !terminal.partNumber.trim() ||
        !terminal.manufacturer.trim() ||
        !terminal.revision.trim() ||
        !["1", "2"].includes(terminal.maxConductors),
    );
    if (incompleteTerminal) {
      setError("신규 터미널의 필수 정보를 모두 입력하세요.");
      return;
    }
    if (category === "cable") {
      if (
        !color.trim() ||
        [coreCount, outerDiameterMm, coreDiameterMm, breakoutLengthMm].some(
          (value) => !Number.isFinite(Number(value)) || Number(value) <= 0,
        )
      ) {
        setError(
          "케이블의 외피 색상, 심 수, 외경, 내선 지름, 브레이크아웃 길이를 입력하세요.",
        );
        return;
      }
      if (
        !Number.isInteger(Number(coreCount)) ||
        Number(coreDiameterMm) > Number(outerDiameterMm)
      ) {
        setError(
          "심 수는 정수여야 하며 내선 지름은 케이블 외경보다 클 수 없습니다.",
        );
        return;
      }
      const coreError = validateCableCoreDefinitions(
        Number(coreCount),
        cableCores,
      );
      if (coreError) {
        setError(coreError);
        return;
      }
      if (
        minimumBendRadiusMm.trim() &&
        (!Number.isFinite(Number(minimumBendRadiusMm)) ||
          Number(minimumBendRadiusMm) <= 0)
      ) {
        setError("최소 굽힘 반경은 0보다 큰 값이어야 합니다.");
        return;
      }
      if (
        cableConstruction === "shieldedMultiCore" &&
        !shieldConstruction.trim()
      ) {
        setError("실드 멀티코어 케이블의 실드 구조를 입력하세요.");
        return;
      }
      if (
        cableConstruction === "shieldedMultiCore" &&
        (!Number.isInteger(Number(shieldCount)) ||
          Number(shieldCount) <= 0 ||
          !drainWireColor.trim() ||
          !drainWireGauge.trim())
      ) {
        setError("실드/드레인 결선 수, 드레인 색상과 Gauge를 입력하세요.");
        return;
      }
    }
    if (
      category === "heatShrink" &&
      (!color.trim() ||
        [finishedDiameterMm, heatShrinkLengthMm].some(
          (value) => !Number.isFinite(Number(value)) || Number(value) <= 0,
        ))
    ) {
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
      attributes: {
        ...(terminal.wireRange.trim()
          ? { wireRange: terminal.wireRange.trim() }
          : {}),
        maxConductors: terminal.maxConductors,
      },
      sourceLibraryRevision: 1,
    }));
    const selectedTerminals = terminals.filter((terminal) =>
      selectedTerminalIds.includes(terminal.id),
    );
    const compatibleTerminals =
      category === "housing" ? [...selectedTerminals, ...createdTerminals] : [];
    if (
      category === "housing" &&
      (!pins.length || !compatibleTerminals.length)
    ) {
      setError(
        "하우징은 핀을 하나 이상 정의하고 호환 터미널을 하나 이상 지정해야 합니다.",
      );
      return;
    }
    const terminalIds = compatibleTerminals.map((terminal) => terminal.id);
    const resolvedDefault = terminalIds.includes(defaultTerminalId ?? "")
      ? defaultTerminalId!
      : (terminalIds[0] ?? "");
    let attributes: Record<string, string> = editingPart
      ? { ...editingPart.attributes }
      : {};
    if (category === "housing") {
      attributes.pinCount = String(pins.length);
      attributes.pinMap = JSON.stringify(pins);
      attributes.compatibleTerminalPartIds = JSON.stringify(terminalIds);
      attributes.defaultTerminalPartId = resolvedDefault;
    } else if (category === "terminal") {
      if (gauge.trim()) attributes.wireRange = gauge.trim();
      else delete attributes.wireRange;
      attributes.maxConductors = maxConductors;
    } else if (category === "cable") {
      attributes.construction = cableConstruction;
      attributes.coreCount = String(Math.floor(Number(coreCount)));
      attributes.outerDiameterMm = String(Number(outerDiameterMm));
      attributes.coreDiameterMm = String(Number(coreDiameterMm));
      attributes.breakoutLengthMm = String(Number(breakoutLengthMm));
      attributes.cores = JSON.stringify(
        cableCores.map((core) => ({
          ...core,
          number: core.number.trim(),
          name: core.name.trim(),
          color: core.color.trim(),
          gauge: core.gauge.trim(),
        })),
      );
      attributes.coreColors = JSON.stringify(
        cableCores.map((core) => core.color.trim()),
      );
      if (minimumBendRadiusMm.trim())
        attributes.minimumBendRadiusMm = String(Number(minimumBendRadiusMm));
      else delete attributes.minimumBendRadiusMm;
      if (cableConstruction === "shieldedMultiCore") {
        attributes.shieldConstruction = shieldConstruction.trim();
        attributes.shieldCount = String(Number(shieldCount));
        attributes.drainWireColor = drainWireColor.trim();
        attributes.drainWireGauge = drainWireGauge.trim();
      } else {
        delete attributes.shieldConstruction;
        delete attributes.shieldCount;
        delete attributes.drainWireColor;
        delete attributes.drainWireGauge;
      }
    } else if (category === "heatShrink") {
      attributes.finishedDiameterMm = String(Number(finishedDiameterMm));
      attributes.lengthMm = String(Number(heatShrinkLengthMm));
    }
    if (modelAsset || editingPart?.modelAssetId)
      attributes = saveModelPlacement(attributes, modelPlacement);
    const preview = previewChanged
      ? (photoPreview ??
        (modelAsset ? createModelPreview(modelAsset) : undefined))
      : (editingPart?.preview ??
        photoPreview ??
        (modelAsset ? createModelPreview(modelAsset) : undefined));
    const part: PartSnapshot = {
      id: editingPart?.id ?? crypto.randomUUID(),
      name: name.trim(),
      partNumber: partNumber.trim(),
      manufacturer: manufacturer.trim(),
      description: description.trim(),
      revision: revision.trim(),
      category,
      unit,
      color: color.trim() || undefined,
      gauge:
        category === "cable"
          ? gauge.trim() || cableCores[0]?.gauge.trim() || undefined
          : gauge.trim() || undefined,
      attributes,
      preview,
      symbolAssetId: editingPart?.symbolAssetId,
      modelAssetId: modelAsset?.id ?? editingPart?.modelAssetId,
      sourceLibraryRevision: editingPart
        ? (editingPart.sourceLibraryRevision ?? 0) + 1
        : 1,
    };
    setSaving(true);
    setError(null);
    try {
      if (isTauri()) {
        for (const terminal of editingPart
          ? createdTerminals
          : compatibleTerminals)
          await backendInvoke("upsert_library_part", { part: terminal });
        if (modelAsset && (modelChanged || !editingPart))
          await backendInvoke("upsert_library_model_asset", {
            asset: modelAsset,
          });
        await backendInvoke("upsert_library_part", { part });
      }
      if (!editingPart) {
        await updateProject((project) => {
          for (const related of compatibleTerminals) {
            if (!project.parts.some((item) => item.id === related.id))
              project.parts.push(structuredClone(related));
          }
          if (
            modelAsset &&
            !project.modelAssets.some((item) => item.id === modelAsset.id)
          )
            project.modelAssets.push(structuredClone(modelAsset));
          project.parts.push(structuredClone(part));
        });
      }
      onSaved?.([
        ...(editingPart ? createdTerminals : compatibleTerminals),
        part,
      ]);
      onClose();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <section
        className="editor-dialog part-registration-dialog"
        role="dialog"
        aria-modal="true"
      >
        <header>
          <div>
            <Boxes size={15} />
            <strong>{editingPart ? "공용 부품 라이브러리 수정" : "공용 부품 라이브러리 등록"}</strong>
            <span>{editingPart ? "기존 부품 ID를 유지하며 공용 라이브러리 데이터를 수정합니다." : "등록한 부품은 다른 프로젝트에서도 불러올 수 있습니다."}</span>
          </div>
          <IconButton title="닫기" onClick={onClose}>
            <X size={14} />
          </IconButton>
        </header>
        <div className="part-registration-body">
          <section>
            <h3>PART INFORMATION</h3>
            <Field label="분류">
              <select
                value={category}
                disabled={Boolean(editingPart)}
                onChange={(event) =>
                  changeCategory(event.target.value as PartCategory)
                }
              >
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item === "heatShrink" ? "HEAT SHRINK" : item.toUpperCase()}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="파트명">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field label="Part No.">
              <input
                value={partNumber}
                onChange={(event) => setPartNumber(event.target.value)}
              />
            </Field>
            <Field label="제조사">
              <input
                value={manufacturer}
                onChange={(event) => setManufacturer(event.target.value)}
              />
            </Field>
            <Field label="Revision">
              <input
                value={revision}
                onChange={(event) => setRevision(event.target.value)}
              />
            </Field>
            <Field label="설명">
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <Field label="단위">
              <select
                value={unit}
                onChange={(event) =>
                  setUnit(event.target.value as QuantityUnit)
                }
              >
                <option value="ea">ea</option>
                <option value="m">m</option>
              </select>
            </Field>
            {["wire", "terminal"].includes(category) && (
              <Field label={category === "wire" ? "Gauge" : "Wire Range"}>
                <input
                  value={gauge}
                  onChange={(event) => setGauge(event.target.value)}
                />
              </Field>
            )}
            {category === "terminal" && (
              <Field label="터미널당 전선 수">
                <input
                  type="number"
                  min="1"
                  max="2"
                  value={maxConductors}
                  onChange={(event) => setMaxConductors(event.target.value)}
                />
              </Field>
            )}
            {["wire", "cable", "heatShrink"].includes(category) && (
              <Field label={category === "cable" ? "Jacket Color" : "Color"}>
                <input
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                />
              </Field>
            )}
            {category === "cable" && (
              <>
                <Field label="케이블 구조">
                  <select
                    value={cableConstruction}
                    onChange={(event) =>
                      setCableConstruction(
                        event.target.value as CableConstruction,
                      )
                    }
                  >
                    <option value="multiCore">멀티코어</option>
                    <option value="shieldedMultiCore">실드 멀티코어</option>
                  </select>
                </Field>
                {cableConstruction === "shieldedMultiCore" && (
                  <Field label="실드 구조">
                    <input
                      value={shieldConstruction}
                      placeholder="예: 알루미늄 포일 + 드레인 와이어"
                      onChange={(event) =>
                        setShieldConstruction(event.target.value)
                      }
                    />
                  </Field>
                )}
                <Field label="심 수">
                  <input
                    type="number"
                    min="1"
                    value={coreCount}
                    onChange={(event) =>
                      changeCableCoreCount(event.target.value)
                    }
                  />
                </Field>
                <Field label="외경 (mm)">
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={outerDiameterMm}
                    onChange={(event) => setOuterDiameterMm(event.target.value)}
                  />
                </Field>
                <Field label="내선 지름 (mm)">
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={coreDiameterMm}
                    onChange={(event) => setCoreDiameterMm(event.target.value)}
                  />
                </Field>
                <Field label="브레이크아웃 (mm)">
                  <input
                    type="number"
                    min="0.1"
                    step="1"
                    value={breakoutLengthMm}
                    onChange={(event) =>
                      setBreakoutLengthMm(event.target.value)
                    }
                  />
                </Field>
              </>
            )}
            {category === "heatShrink" && (
              <>
                <Field label="마감 외경 (mm)">
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={finishedDiameterMm}
                    onChange={(event) =>
                      setFinishedDiameterMm(event.target.value)
                    }
                  />
                </Field>
                <Field label="길이 (mm)">
                  <input
                    type="number"
                    min="0.1"
                    step="1"
                    value={heatShrinkLengthMm}
                    onChange={(event) =>
                      setHeatShrinkLengthMm(event.target.value)
                    }
                  />
                </Field>
              </>
            )}
            <div
              ref={photoDropRef}
              className={`photo-registration asset-drop-zone${activeDropZone === "photo" ? " drop-active" : ""}`}
              data-drop-label="사진을 놓아서 자동 저장"
            >
              <div>
                <h3>대표 사진</h3>
                <button onClick={() => void choosePhoto()}>
                  <ImagePlus size={12} />
                  JPG/PNG/WebP 선택
                </button>
              </div>
              {displayedPhotoPreview ? (
                <div>
                  <img src={displayedPhotoPreview.dataUrl} alt="대표 사진 미리보기" />
                  {photoPreview && (
                    <button
                      title="대표 사진 제거"
                      onClick={() => {
                        setPhotoPreview(null);
                        setPreviewChanged(true);
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ) : (
                <span>
                  JPG/PNG/WebP 파일을 이 영역에 놓으세요.
                  <br />
                  사진이 있으면 3D와 도면보다 우선 표시됩니다.
                </span>
              )}
              {(photoState ?? displayedPhotoPreview?.sourceName) && (
                <small className="asset-drop-state">
                  {photoState ?? displayedPhotoPreview?.sourceName}
                </small>
              )}
            </div>
            <div className="drawing-registration">
              <div>
                <h3>2D 도면</h3>
                {drawingUrl && (
                  <a href={drawingUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={11} />
                    원본 열기
                  </a>
                )}
              </div>
              {drawingPreview ? (
                <div>
                  <img src={drawingPreview.dataUrl} alt="등록된 2D 도면 미리보기" />
                </div>
              ) : drawingUrl ? (
                <a
                  className="drawing-resource"
                  href={drawingUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <FileBox size={22} />
                  <span>등록된 제조사 도면</span>
                  <small>PDF 원본을 열어 확인할 수 있습니다.</small>
                </a>
              ) : (
                <span>등록된 DXF/SVG 도면이 없습니다.</span>
              )}
              {(drawingState ?? drawingPreview?.sourceName) && (
                <small className="asset-drop-state">
                  {drawingState ?? drawingPreview?.sourceName}
                </small>
              )}
            </div>
            <div
              ref={modelDropRef}
              className={`model-registration asset-drop-zone${activeDropZone === "model" ? " drop-active" : ""}`}
              data-drop-label="STEP을 놓아서 자동 저장"
            >
              <div>
                <h3>3D STEP MODEL</h3>
                <button
                  onClick={() => void chooseStep()}
                  disabled={modelState === "STEP 형상 변환 중…"}
                >
                  <Upload size={12} />
                  STEP/STP 선택
                </button>
              </div>
              <Part3DPreview
                asset={modelAsset}
                placement={modelPlacement}
                showCable
              />
              <p>
                <FileBox size={11} />
                {modelState ??
                  "STEP/STP 파일을 이 영역에 놓으세요 · 단위는 mm로 변환됩니다."}
              </p>
              {modelAsset && (
                <ModelPlacementControls
                  value={modelPlacement}
                  onChange={setModelPlacement}
                />
              )}
            </div>
          </section>
          {category === "cable" && (
            <CableDefinitionEditor
              construction={cableConstruction}
              cores={cableCores}
              commonGauge={gauge}
              shieldCount={shieldCount}
              drainWireColor={drainWireColor}
              drainWireGauge={drainWireGauge}
              minimumBendRadiusMm={minimumBendRadiusMm}
              onCoreChange={updateCableCore}
              onCommonGaugeChange={setGauge}
              onApplyCommonGauge={applyCommonCoreGauge}
              onShieldCountChange={setShieldCount}
              onDrainWireColorChange={setDrainWireColor}
              onDrainWireGaugeChange={setDrainWireGauge}
              onMinimumBendRadiusChange={setMinimumBendRadiusMm}
            />
          )}
          {category === "housing" && (
            <>
              <section className="pin-definition-editor">
                <h3>
                  PIN DEFINITION <span>{pins.length}</span>
                </h3>
                <Field label="핀 수">
                  <input
                    type="number"
                    min="1"
                    max="512"
                    value={pins.length || ""}
                    onChange={(event) =>
                      changePinCount(Number(event.target.value))
                    }
                  />
                </Field>
                <div className="pin-definition-table">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Pin</th>
                        <th>Name / Signal</th>
                        <th>X</th>
                        <th>Y</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pins.map((pin) => (
                        <tr key={pin.id}>
                          <td>
                            <input
                              value={pin.number}
                              onChange={(event) =>
                                setPins((current) =>
                                  current.map((item) =>
                                    item.id === pin.id
                                      ? { ...item, number: event.target.value }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </td>
                          <td>
                            <input
                              value={pin.name}
                              onChange={(event) =>
                                setPins((current) =>
                                  current.map((item) =>
                                    item.id === pin.id
                                      ? { ...item, name: event.target.value }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </td>
                          <td className="number">{pin.position.x}</td>
                          <td className="number">{pin.position.y}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="terminal-registration">
                <div className="section-heading">
                  <h3>COMPATIBLE TERMINALS</h3>
                  <button onClick={addTerminal}>
                    <Plus size={11} />
                    신규 터미널
                  </button>
                </div>
                <div className="terminal-candidate-list">
                  {terminals.map((terminal) => (
                    <label className="terminal-choice" key={terminal.id}>
                      <input
                        type="checkbox"
                        checked={selectedTerminalIds.includes(terminal.id)}
                        onChange={() => toggleTerminal(terminal.id)}
                      />
                      <span>
                        <strong>{getPartName(terminal)}</strong>
                        <code>{terminal.partNumber}</code>
                        <small>
                          {terminal.manufacturer} ·{" "}
                          {terminal.gauge ||
                            terminal.attributes.wireRange ||
                            "규격 미지정"}{" "}
                          ·{" "}
                          {terminal.attributes.maxConductors === "2"
                            ? "2선"
                            : "1선"}
                        </small>
                      </span>
                      <input
                        type="radio"
                        name="part-default-terminal"
                        title="기본 터미널"
                        checked={defaultTerminalId === terminal.id}
                        disabled={!selectedTerminalIds.includes(terminal.id)}
                        onChange={() => setDefaultTerminalId(terminal.id)}
                      />
                    </label>
                  ))}
                </div>
                {newTerminals.map((terminal) => (
                  <div className="new-terminal" key={terminal.id}>
                    <div>
                      <strong>신규 터미널</strong>
                      <label>
                        <input
                          type="radio"
                          name="part-default-terminal"
                          checked={defaultTerminalId === terminal.id}
                          onChange={() => setDefaultTerminalId(terminal.id)}
                        />
                        기본
                      </label>
                      <IconButton
                        title="터미널 삭제"
                        onClick={() => {
                          setNewTerminals((current) =>
                            current.filter((item) => item.id !== terminal.id),
                          );
                          if (defaultTerminalId === terminal.id)
                            setDefaultTerminalId(
                              selectedTerminalIds[0] ?? null,
                            );
                        }}
                      >
                        <Trash2 size={11} />
                      </IconButton>
                    </div>
                    <input
                      placeholder="파트명 *"
                      value={terminal.name}
                      onChange={(event) =>
                        updateTerminal(terminal.id, "name", event.target.value)
                      }
                    />
                    <input
                      placeholder="파트번호 *"
                      value={terminal.partNumber}
                      onChange={(event) =>
                        updateTerminal(
                          terminal.id,
                          "partNumber",
                          event.target.value,
                        )
                      }
                    />
                    <input
                      placeholder="제조사 *"
                      value={terminal.manufacturer}
                      onChange={(event) =>
                        updateTerminal(
                          terminal.id,
                          "manufacturer",
                          event.target.value,
                        )
                      }
                    />
                    <input
                      placeholder="Revision *"
                      value={terminal.revision}
                      onChange={(event) =>
                        updateTerminal(
                          terminal.id,
                          "revision",
                          event.target.value,
                        )
                      }
                    />
                    <input
                      className="full"
                      placeholder="적용 전선 규격"
                      value={terminal.wireRange}
                      onChange={(event) =>
                        updateTerminal(
                          terminal.id,
                          "wireRange",
                          event.target.value,
                        )
                      }
                    />
                    <input
                      className="full"
                      type="number"
                      min="1"
                      max="2"
                      title="터미널당 허용 전선 수"
                      value={terminal.maxConductors}
                      onChange={(event) =>
                        updateTerminal(
                          terminal.id,
                          "maxConductors",
                          event.target.value,
                        )
                      }
                    />
                  </div>
                ))}
              </section>
            </>
          )}
        </div>
        {error && <div className="connector-library-error">{error}</div>}
        <footer>
          <button onClick={onClose}>취소</button>
          <button
            className="primary"
            disabled={saving}
            onClick={() => void savePart()}
          >
            <Save size={13} />
            {saving ? "저장 중…" : editingPart ? "변경 사항 저장" : "공용 라이브러리에 저장"}
          </button>
        </footer>
      </section>
    </div>
  );
}
