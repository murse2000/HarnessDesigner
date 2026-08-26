import { open, save } from "@tauri-apps/plugin-dialog";
import { Boxes, Cable, ChevronRight, Circle, CircleHelp, FileDown, FolderOpen, ImagePlus, Plus, Printer, Redo2, RotateCw, Save, Settings2, Square, Tag, Trash2, Type, Undo2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent } from "react";
import { backendInvoke, isTauri } from "../platform";
import { Canvas2D, type CanvasSelection, type SelectedConnectorLabel } from "./Canvas2D";
import { ConnectorPickerDialog, PartsLibraryDialog } from "./LibraryDialogs";
import { WireCableRunDialog } from "./WireCableDialogs";
import { SettingsDialog } from "./SettingsDialog";
import { AutoUpdater } from "./AutoUpdater";
import { createDrawingPdfBytes, preparePaperDrawing, printPaperDrawing } from "./drawingOutput";
import { prepareProjectPaperDrawings } from "./projectDrawingOutput";
import type { DefaultLibraryInstallation2D, LibrarySummary2D } from "./library";
import { displayLength, loadSettings2D, normalizeSettings2D, saveSettings2D, storedLength, type LengthUnit2D, type Settings2D } from "./settings";
import {
  addConnector,
  addCableHeatShrink,
  addCableRun,
  addDrawingAnnotation,
  addHarness,
  addWireRun,
  assertProject2D,
  connectPins,
  copyHarness,
  copyHarnessDrawing,
  createEmptyProject,
  deleteDrawingAnnotation,
  deleteCableHeatShrink,
  deleteHarness,
  deleteItems,
  moveItems,
  pasteHarness,
  pasteHarnessDrawing,
  reorderHarness,
  setCableRunBreakout,
  setCableRunRoute,
  setCableRunLabelOffset,
  setComponentLabelPlacement,
  setComponentDisplayScale,
  setComponentPinMapOffset,
  setComponentPinSide,
  setComponentRotation,
  setConnectionRoute,
  updateComponent,
  updateConnection,
  updateCableRun,
  updateCableHeatShrink,
  updateDrawingAnnotation,
  updateDrawingTitleBlock,
  updateHarnessMetadata,
  updatePin,
  updateProjectMetadata,
  type ConnectorDraft,
  type CableRunDraft2D,
  type CableHeatShrink2D,
  type ComponentRotation2D,
  type CopiedHarness2D,
  type CopiedHarnessDrawing2D,
  type DrawingAnnotation2D,
  type DrawingAnnotationKind2D,
  type PinEndpoint2D,
  type Point2D,
  type Project2D,
  type WireRunDraft2D,
} from "./model";

const APP_VERSION = "0.3.47";

type HistoryState = {
  past: Project2D[];
  present: Project2D;
  future: Project2D[];
};

const emptySelection: CanvasSelection = { componentIds: [], connectionIds: [], cableRunIds: [] };

export default function App2D() {
  const [history, setHistory] = useState<HistoryState>(() => ({ past: [], present: createEmptyProject(), future: [] }));
  const [savedDocument, setSavedDocument] = useState(() => JSON.stringify(history.present));
  const [filePath, setFilePath] = useState<string | null>(null);
  const [activeHarnessId, setActiveHarnessId] = useState(() => history.present.harnesses[0].id);
  const [selectedHarnessId, setSelectedHarnessId] = useState<string | null>(null);
  const [selection, setSelection] = useState<CanvasSelection>(emptySelection);
  const [selectedLabel, setSelectedLabel] = useState<SelectedConnectorLabel | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [selectedHeatShrinkId, setSelectedHeatShrinkId] = useState<string | null>(null);
  const [connectorDialogOpen, setConnectorDialogOpen] = useState(false);
  const [libraryDialogOpen, setLibraryDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(loadSettings2D);
  const [runDialogKind, setRunDialogKind] = useState<"wire" | "cable" | null>(null);
  const [librarySummary, setLibrarySummary] = useState<LibrarySummary2D | null>(null);
  const [libraryFolder, setLibraryFolder] = useState<string | null>(null);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [mousePosition, setMousePosition] = useState<Point2D | null>(null);
  const [message, setMessage] = useState("새 2D 엔진 준비 완료");
  const [outputBusy, setOutputBusy] = useState(false);
  const copiedHarness = useRef<CopiedHarness2D | null>(null);
  const copiedDrawing = useRef<CopiedHarnessDrawing2D | null>(null);
  const pasteCount = useRef(0);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const project = history.present;
  const harness = project.harnesses.find((item) => item.id === activeHarnessId) ?? project.harnesses[0];
  const dirty = JSON.stringify(project) !== savedDocument;

  useEffect(() => {
    if (selection.componentIds.length + selection.connectionIds.length + selection.cableRunIds.length > 0 || selectedAnnotationId || selectedLabel || selectedHarnessId) {
      setSelectedHeatShrinkId(null);
    }
  }, [selectedAnnotationId, selectedHarnessId, selectedLabel, selection]);

  useEffect(() => {
    if (selectedHeatShrinkId && !(harness.drawing.cableHeatShrinks ?? []).some((heatShrink) => heatShrink.id === selectedHeatShrinkId)) {
      setSelectedHeatShrinkId(null);
    }
  }, [harness.drawing.cableHeatShrinks, selectedHeatShrinkId]);

  useEffect(() => {
    if (project.harnesses.some((item) => item.id === activeHarnessId)) return;
    setActiveHarnessId(project.harnesses[0].id);
    setSelectedHarnessId(null);
  }, [activeHarnessId, project.harnesses]);

  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    setLibraryLoading(true);
    void backendInvoke<LibrarySummary2D | null>("get_rebuilt_parts_library")
      .then((summary) => {
        if (!active) return;
        setLibrarySummary(summary);
        if (summary) {
          setMessage(`${summary.name} 라이브러리를 연결했습니다.`);
          void backendInvoke<string>("get_rebuilt_default_library_folder").then((folder) => {
            if (active) setLibraryFolder(folder);
          });
        }
      })
      .catch((error) => {
        if (active) setMessage(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) setLibraryLoading(false);
      });
    return () => { active = false; };
  }, []);

  const selectDefaultLibraryFolder = useCallback(async () => {
    if (!isTauri()) {
      setMessage("기본 라이브러리 폴더 지정은 데스크톱 앱에서 사용할 수 있습니다.");
      return;
    }
    const folder = await open({ multiple: false, directory: true });
    if (!folder) return;
    try {
      const installed = await backendInvoke<DefaultLibraryInstallation2D>("set_rebuilt_default_library_folder", { folder });
      setLibraryFolder(installed.folder);
      setLibrarySummary(installed.library);
      setMessage(`${installed.folder} 폴더의 기본 라이브러리를 연결했습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const commit = useCallback((next: Project2D) => {
    setHistory((current) => ({ past: [...current.past, current.present].slice(-100), present: next, future: [] }));
  }, []);

  const apply = useCallback((update: (current: Project2D) => Project2D) => {
    setHistory((current) => ({
      past: [...current.past, current.present].slice(-100),
      present: update(current.present),
      future: [],
    }));
  }, []);

  const undo = useCallback(() => {
    setHistory((current) => {
      const previous = current.past.at(-1);
      if (!previous) return current;
      return { past: current.past.slice(0, -1), present: previous, future: [current.present, ...current.future] };
    });
    setSelection(emptySelection);
    setSelectedLabel(null);
    setSelectedAnnotationId(null);
  }, []);

  const redo = useCallback(() => {
    setHistory((current) => {
      const next = current.future[0];
      if (!next) return current;
      return { past: [...current.past, current.present], present: next, future: current.future.slice(1) };
    });
    setSelection(emptySelection);
    setSelectedLabel(null);
    setSelectedAnnotationId(null);
  }, []);

  const startNewProject = useCallback(() => {
    if (dirty && !window.confirm("저장하지 않은 변경 사항을 버리고 새 프로젝트를 만드시겠습니까?")) return;
    const next = createEmptyProject();
    setHistory({ past: [], present: next, future: [] });
    setSavedDocument(JSON.stringify(next));
    setFilePath(null);
    setActiveHarnessId(next.harnesses[0].id);
    setSelectedHarnessId(null);
    setSelection(emptySelection);
    setSelectedLabel(null);
    setSelectedAnnotationId(null);
    setMessage("빈 프로젝트를 만들었습니다.");
  }, [dirty]);

  const openProject = useCallback(async () => {
    if (!isTauri()) {
      setMessage("프로젝트 열기는 데스크톱 앱에서 사용할 수 있습니다.");
      return;
    }
    if (dirty && !window.confirm("저장하지 않은 변경 사항을 버리고 다른 프로젝트를 여시겠습니까?")) return;
    const path = await open({ multiple: false, directory: false, filters: [{ name: "Harness Designer 2D", extensions: ["harness2d"] }] });
    if (!path) return;
    try {
      const loaded = await backendInvoke<unknown>("open_rebuilt_project", { path });
      assertProject2D(loaded);
      setHistory({ past: [], present: loaded, future: [] });
      setSavedDocument(JSON.stringify(loaded));
      setFilePath(path);
      setActiveHarnessId(loaded.harnesses[0].id);
      setSelectedHarnessId(null);
      setSelection(emptySelection);
      setSelectedLabel(null);
      setSelectedAnnotationId(null);
      setMessage(`${path} 파일을 열었습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, [dirty]);

  const saveProject = useCallback(async () => {
    if (!isTauri()) {
      setMessage("프로젝트 저장은 데스크톱 앱에서 사용할 수 있습니다.");
      return;
    }
    const path = filePath ?? await save({
      defaultPath: `${project.projectNumber}.harness2d`,
      filters: [{ name: "Harness Designer 2D", extensions: ["harness2d"] }],
    });
    if (!path) return;
    try {
      await backendInvoke("save_rebuilt_project", { path, project });
      setFilePath(path);
      setSavedDocument(JSON.stringify(project));
      setMessage(`${path} 파일에 저장했습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, [filePath, project]);

  const exportPdf = useCallback(async () => {
    const path = isTauri() ? await save({
      defaultPath: `${project.projectNumber}.pdf`,
      filters: [{ name: "PDF 도면", extensions: ["pdf"] }],
    }) : `${project.projectNumber}.pdf`;
    if (!path) return;

    setOutputBusy(true);
    setMessage(`${settings.drawingSheet} 용지 PDF ${project.harnesses.length}페이지를 생성하고 있습니다.`);
    try {
      const bytes = await createDrawingPdfBytes(prepareProjectPaperDrawings(project, settings));
      if (isTauri()) {
        await backendInvoke("write_rebuilt_binary_file", { path, content: Array.from(bytes) });
      } else {
        const pdfBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        const url = URL.createObjectURL(new Blob([pdfBuffer], { type: "application/pdf" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = path;
        link.click();
        URL.revokeObjectURL(url);
      }
      setMessage(`${settings.drawingSheet} 용지 PDF ${project.harnesses.length}페이지를 저장했습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setOutputBusy(false);
    }
  }, [project, settings]);

  const printDrawing = useCallback(async () => {
    const canvas = document.querySelector<SVGSVGElement>(".hd2-canvas");
    if (!canvas) {
      setMessage("출력할 2D 도면을 찾을 수 없습니다.");
      return;
    }
    try {
      await printPaperDrawing(preparePaperDrawing(canvas, settings.drawingSheet), async () => {
        if (isTauri()) {
          await backendInvoke("print_rebuilt_webview");
        } else {
          window.print();
        }
      });
      setMessage(`${settings.drawingSheet} 용지 크기로 인쇄 창을 열었습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, [settings.drawingSheet]);

  useEffect(() => {
    if (!dirty || !filePath || settings.autosaveMinutes === 0 || !isTauri()) return;
    const timer = window.setTimeout(() => {
      void backendInvoke("save_rebuilt_project", { path: filePath, project })
        .then(() => {
          setSavedDocument(JSON.stringify(project));
          setMessage("프로젝트를 자동 저장했습니다.");
        })
        .catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
    }, settings.autosaveMinutes * 60_000);
    return () => window.clearTimeout(timer);
  }, [dirty, filePath, project, settings.autosaveMinutes]);

  const removeSelection = useCallback(() => {
    if (selectedHeatShrinkId) {
      apply((current) => deleteCableHeatShrink(current, harness.id, selectedHeatShrinkId));
      setSelectedHeatShrinkId(null);
      setMessage("수축튜브를 삭제했습니다.");
      return;
    }
    if (selectedAnnotationId) {
      apply((current) => deleteDrawingAnnotation(current, harness.id, selectedAnnotationId));
      setSelectedAnnotationId(null);
      setMessage("도면 주석을 삭제했습니다.");
      return;
    }
    if (selection.componentIds.length === 0 && selection.connectionIds.length === 0 && selection.cableRunIds.length === 0) return;
    apply((current) => deleteItems(current, harness.id, new Set(selection.componentIds), new Set(selection.connectionIds), new Set(selection.cableRunIds)));
    setSelection(emptySelection);
    setSelectedLabel(null);
  }, [apply, harness.id, selectedAnnotationId, selectedHeatShrinkId, selection]);

  const copySelection = useCallback(() => {
    const selectedHarness = selectedHarnessId
      ? project.harnesses.find((item) => item.id === selectedHarnessId)
      : undefined;
    if (selectedHarness) {
      copiedHarness.current = copyHarness(selectedHarness);
      copiedDrawing.current = null;
      pasteCount.current = 0;
      setMessage(`${selectedHarness.partNumber} 하네스 도면을 복사했습니다.`);
      return;
    }
    const copied = copyHarnessDrawing(
      harness,
      new Set(selection.componentIds),
      new Set(selection.connectionIds),
      new Set(selection.cableRunIds),
    );
    if (copied.components.length === 0) {
      setMessage("복사할 도면 요소를 선택하세요.");
      return;
    }
    copiedHarness.current = null;
    copiedDrawing.current = copied;
    pasteCount.current = 0;
    setMessage(`${copied.components.length}개 부품 · ${copied.connections.length}개 연결을 복사했습니다.`);
  }, [harness, project.harnesses, selectedHarnessId, selection]);

  const pasteSelection = useCallback(() => {
    if (copiedHarness.current) {
      const result = pasteHarness(project, copiedHarness.current);
      const pastedHarness = result.project.harnesses.find((item) => item.id === result.harnessId)!;
      commit(result.project);
      setActiveHarnessId(result.harnessId);
      setSelectedHarnessId(result.harnessId);
      setSelection(emptySelection);
      setSelectedLabel(null);
      setSelectedAnnotationId(null);
      setMessage(`${pastedHarness.partNumber} 하네스 도면을 붙여넣었습니다.`);
      return;
    }
    if (!copiedDrawing.current) {
      setMessage("복사된 하네스 도면이 없습니다.");
      return;
    }
    pasteCount.current += 1;
    const distance = pasteCount.current * 20;
    const result = pasteHarnessDrawing(project, harness.id, copiedDrawing.current, { x: distance, y: distance });
    commit(result.project);
    setSelectedHarnessId(null);
    setSelection({ componentIds: result.componentIds, connectionIds: result.connectionIds, cableRunIds: result.cableRunIds });
    setSelectedLabel(null);
    setSelectedAnnotationId(null);
    setMessage(`${result.componentIds.length}개 부품 · ${result.connectionIds.length}개 연결을 붙여넣었습니다.`);
  }, [commit, harness.id, project]);

  const rotateSelection = useCallback(() => {
    if (selectedLabel) {
      const placement = harness.drawing.componentPlacements[selectedLabel.componentId];
      if (!placement) return;
      const rotation = ((placement[selectedLabel.label]?.rotation ?? 0) + 90) % 360;
      apply((current) => setComponentLabelPlacement(current, harness.id, selectedLabel.componentId, selectedLabel.label, { rotation }));
      setMessage("선택한 라벨을 90° 회전했습니다.");
      return;
    }
    if (selection.componentIds.length === 0) return;
    apply((current) => selection.componentIds.reduce((next, componentId) => {
      const rotation = (((next.harnesses.find((item) => item.id === harness.id)?.drawing.componentPlacements[componentId]?.rotation ?? 0) + 90) % 360) as ComponentRotation2D;
      return setComponentRotation(next, harness.id, componentId, rotation);
    }, current));
    setMessage("선택한 커넥터를 90° 회전했습니다.");
  }, [apply, harness.drawing.componentPlacements, harness.id, selectedLabel, selection.componentIds]);

  const insertAnnotation = useCallback((kind: DrawingAnnotationKind2D, imageDataUrl?: string) => {
    const index = harness.drawing.annotations?.length ?? 0;
    const result = addDrawingAnnotation(project, harness.id, {
      kind,
      position: { x: 120 + index * 15, y: 80 + index * 15 },
      imageDataUrl,
    });
    commit(result.project);
    setSelectedHarnessId(null);
    setSelection(emptySelection);
    setSelectedLabel(null);
    setSelectedAnnotationId(result.annotationId);
    setMessage(kind === "image" ? "이미지를 도면에 추가했습니다." : "도면 주석을 추가했습니다.");
  }, [commit, harness.drawing.annotations?.length, harness.id, project]);

  const insertImageFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setMessage("이미지 파일만 추가할 수 있습니다.");
      return;
    }
    try {
      insertAnnotation("image", await readFileAsDataUrl(file));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, [insertAnnotation]);

  const createHarness = useCallback(() => {
    const result = addHarness(project);
    commit(result.project);
    setActiveHarnessId(result.harnessId);
    setSelectedHarnessId(result.harnessId);
    setSelection(emptySelection);
    setSelectedLabel(null);
    setSelectedAnnotationId(null);
    const added = result.project.harnesses.find((item) => item.id === result.harnessId)!;
    setMessage(`${added.partNumber} 빈 하네스 도면을 생성했습니다.`);
  }, [commit, project]);

  const removeHarness = useCallback((harnessId: string) => {
    const index = project.harnesses.findIndex((item) => item.id === harnessId);
    const removed = project.harnesses[index];
    if (!removed || project.harnesses.length <= 1) return;
    if (!window.confirm(`${removed.partNumber} 하네스 도면을 삭제하시겠습니까?`)) return;

    const next = deleteHarness(project, harnessId);
    const nextActiveId = activeHarnessId === harnessId
      ? next.harnesses[Math.min(index, next.harnesses.length - 1)].id
      : activeHarnessId;
    commit(next);
    setActiveHarnessId(nextActiveId);
    setSelectedHarnessId(nextActiveId);
    setSelection(emptySelection);
    setSelectedLabel(null);
    setSelectedAnnotationId(null);
    setMessage(`${removed.partNumber} 하네스 도면을 삭제했습니다.`);
  }, [activeHarnessId, commit, project]);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (isEditingElement(event.target)) return;
      const file = Array.from(event.clipboardData?.items ?? [])
        .find((item) => item.kind === "file" && item.type.startsWith("image/"))
        ?.getAsFile();
      if (file) {
        event.preventDefault();
        void insertImageFile(file);
      } else if (copiedHarness.current || copiedDrawing.current) {
        event.preventDefault();
        pasteSelection();
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [insertImageFile, pasteSelection]);

  useEffect(() => {
    document.title = `${project.projectNumber} · ${harness.partNumber} · Harness Designer v${APP_VERSION}${dirty ? " •" : ""}`;
  }, [dirty, harness.partNumber, project.projectNumber]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditingElement(event.target)) return;
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveProject();
      } else if (command && event.key.toLowerCase() === "o") {
        event.preventDefault();
        void openProject();
      } else if (command && event.key.toLowerCase() === "n") {
        event.preventDefault();
        startNewProject();
      } else if (command && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((command && event.key.toLowerCase() === "y") || (command && event.shiftKey && event.key.toLowerCase() === "z")) {
        event.preventDefault();
        redo();
      } else if (command && event.key.toLowerCase() === "c") {
        event.preventDefault();
        copySelection();
      } else if (command && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelectedHarnessId(null);
        setSelection({
          componentIds: harness.components.map((component) => component.id),
          connectionIds: harness.connections.map((connection) => connection.id),
          cableRunIds: harness.cableRuns.map((cableRun) => cableRun.id),
        });
      } else if (command && event.key === ",") {
        event.preventDefault();
        setSettingsOpen(true);
      } else if (!command && event.key.toLowerCase() === "r" && (selectedLabel || selection.componentIds.length > 0)) {
        event.preventDefault();
        rotateSelection();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (selectedHarnessId) removeHarness(selectedHarnessId);
        else removeSelection();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [copySelection, harness, openProject, pasteSelection, redo, removeHarness, removeSelection, rotateSelection, saveProject, selectedHarnessId, selectedLabel, selection.componentIds.length, startNewProject, undo]);

  const addNewConnector = (draft: ConnectorDraft) => {
    const count = harness.components.length;
    const column = count % 3;
    const row = Math.floor(count / 3);
    const result = addConnector(project, harness.id, draft, { x: 100 + column * 390, y: 100 + row * 300 });
    commit(result.project);
    setSelectedHarnessId(null);
    setSelection({ componentIds: [result.componentId], connectionIds: [], cableRunIds: [] });
    setSelectedLabel(null);
    setSelectedAnnotationId(null);
    setConnectorDialogOpen(false);
    setMessage(`${draft.pinCount}핀 커넥터를 추가했습니다.`);
  };

  const selectedComponent = selection.componentIds.length === 1
    ? harness.components.find((component) => component.id === selection.componentIds[0])
    : undefined;
  const selectedConnection = selection.connectionIds.length === 1
    ? harness.connections.find((connection) => connection.id === selection.connectionIds[0])
    : undefined;
  const selectedCableRun = selection.cableRunIds.length === 1
    ? harness.cableRuns.find((cableRun) => cableRun.id === selection.cableRunIds[0])
    : undefined;
  const selectedComponentPosition = selectedComponent
    ? harness.drawing.componentPlacements[selectedComponent.id]?.position
    : undefined;
  const selectedAnnotation = selectedAnnotationId
    ? harness.drawing.annotations?.find((annotation) => annotation.id === selectedAnnotationId)
    : undefined;
  const selectedHeatShrink = selectedHeatShrinkId
    ? harness.drawing.cableHeatShrinks?.find((heatShrink) => heatShrink.id === selectedHeatShrinkId)
    : undefined;
  const coordinateDigits = settings.lengthUnit === "in" ? 3 : 1;
  const coordinate = (value: number) => displayLength(value, settings.lengthUnit).toFixed(coordinateDigits);

  return <main
    className="hd2-app"
    data-theme={settings.theme}
    data-density={settings.density}
    style={{ "--hd2-font-size": `${settings.fontSize}px` } as CSSProperties}
  >
    <header className="hd2-command-bar">
      <div className="hd2-brand"><span className="hd2-logo"><Cable size={17} /></span><strong>Harness Designer</strong><small>2D · v{APP_VERSION}</small></div>
      <button type="button" onClick={startNewProject}><Plus size={15} />새 프로젝트</button>
      <button type="button" onClick={() => void openProject()}><FolderOpen size={15} />열기</button>
      <button type="button" onClick={() => void saveProject()}><Save size={15} />저장</button>
      <button type="button" disabled={outputBusy} onClick={() => void exportPdf()}><FileDown size={15} />PDF</button>
      <button type="button" disabled={outputBusy} onClick={printDrawing}><Printer size={15} />인쇄</button>
      <button type="button" onClick={() => setLibraryDialogOpen(true)}><Boxes size={15} />부품 라이브러리</button>
      <button type="button" onClick={() => setSettingsOpen(true)}><Settings2 size={15} />환경설정</button>
      <div className="hd2-command-title">{project.projectNumber} · {project.name}</div>
      <AutoUpdater />
      <span className={`hd2-save-state${dirty ? " is-dirty" : ""}`}>{libraryLoading ? "라이브러리 확인 중" : dirty ? "수정됨" : "저장됨"}</span>
    </header>

    <div className="hd2-toolbar">
      <button type="button" disabled={history.past.length === 0} onClick={undo} title="실행 취소 (⌘/Ctrl+Z)"><Undo2 size={15} /></button>
      <button type="button" disabled={history.future.length === 0} onClick={redo} title="다시 실행 (⌘/Ctrl+Shift+Z)"><Redo2 size={15} /></button>
      <span className="hd2-separator" />
      <button type="button" className="is-primary" onClick={() => setConnectorDialogOpen(true)}><Plus size={15} />커넥터</button>
      <button type="button" onClick={() => setRunDialogKind("wire")}><Plus size={15} />단선</button>
      <button type="button" onClick={() => setRunDialogKind("cable")}><Plus size={15} />멀티코어 케이블</button>
      <button type="button" disabled={!selectedCableRun} onClick={() => {
        if (!selectedCableRun) return;
        const result = addCableHeatShrink(project, harness.id, selectedCableRun.id);
        commit(result.project);
        setSelection(emptySelection);
        setSelectedAnnotationId(null);
        setSelectedHeatShrinkId(result.heatShrinkId);
        setMessage(`${selectedCableRun.reference}에 수축튜브를 추가했습니다.`);
      }}><Cable size={15} />수축튜브</button>
      <span className="hd2-separator" />
      <button type="button" onClick={() => insertAnnotation("label")}><Tag size={15} />라벨</button>
      <button type="button" onClick={() => insertAnnotation("text")}><Type size={15} />텍스트</button>
      <button type="button" onClick={() => insertAnnotation("rectangle")}><Square size={15} />사각형</button>
      <button type="button" onClick={() => insertAnnotation("ellipse")}><Circle size={15} />원</button>
      <button type="button" onClick={() => imageInputRef.current?.click()}><ImagePlus size={15} />이미지</button>
      <input
        ref={imageInputRef}
        className="hd2-hidden-input"
        aria-label="도면 이미지 파일"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void insertImageFile(file);
          event.currentTarget.value = "";
        }}
      />
      <button type="button" disabled={!selectedLabel && selection.componentIds.length === 0} onClick={rotateSelection} title="선택 90° 회전 (R)"><RotateCw size={15} />선택 90° 회전</button>
      <span className="hd2-help"><CircleHelp size={14} />좌측 하네스 선택 후 C·V 전체 도면 복제 · Cmd/Ctrl+A 캔버스 전체 선택 · Space+드래그 화면 이동</span>
      <button type="button" disabled={!selectedHeatShrinkId && !selectedAnnotationId && selection.componentIds.length + selection.connectionIds.length + selection.cableRunIds.length === 0} onClick={removeSelection}><Trash2 size={15} />선택 삭제</button>
    </div>

    <section className="hd2-workspace">
      <Navigator
        project={project}
        activeHarnessId={harness.id}
        selectedHarnessId={selectedHarnessId}
        selectedComponentIds={selection.componentIds}
        selectedCableRunIds={selection.cableRunIds}
        onAddHarness={createHarness}
        onDeleteHarness={removeHarness}
        onReorderHarness={(sourceHarnessId, targetHarnessId, placement) => {
          const source = project.harnesses.find((item) => item.id === sourceHarnessId);
          const target = project.harnesses.find((item) => item.id === targetHarnessId);
          if (!source || !target || sourceHarnessId === targetHarnessId) return;
          apply((current) => reorderHarness(current, sourceHarnessId, targetHarnessId, placement));
          setMessage(`${source.partNumber} 도면을 ${target.partNumber} ${placement === "before" ? "앞" : "뒤"}에 이동했습니다.`);
        }}
        onSelectHarness={(harnessId) => {
          setActiveHarnessId(harnessId);
          setSelectedHarnessId(harnessId);
          setSelection(emptySelection);
          setSelectedLabel(null);
          setSelectedAnnotationId(null);
        }}
        onSelect={(harnessId, componentId) => {
          setActiveHarnessId(harnessId);
          setSelectedHarnessId(null);
          setSelection({ componentIds: [componentId], connectionIds: [], cableRunIds: [] });
          setSelectedLabel(null);
          setSelectedAnnotationId(null);
        }}
        onSelectCable={(harnessId, cableRunId) => {
          setActiveHarnessId(harnessId);
          setSelectedHarnessId(null);
          setSelection({ componentIds: [], connectionIds: [], cableRunIds: [cableRunId] });
          setSelectedLabel(null);
          setSelectedAnnotationId(null);
        }}
      />
      <section className="hd2-document">
        <div className="hd2-document-tab"><span>HARNESS</span><strong>{harness.partNumber}</strong><em>{harness.name}</em><small>REV {harness.revision}</small></div>
        <Canvas2D
          harness={harness}
          projectNumber={project.projectNumber}
          projectName={project.name}
          settings={settings}
          selection={selection}
          selectedLabel={selectedLabel}
          selectedAnnotationId={selectedAnnotationId}
          selectedHeatShrinkId={selectedHeatShrinkId}
          onSelectionChange={(next) => {
            setSelectedHarnessId(null);
            setSelection(next);
            setSelectedLabel(null);
            setSelectedAnnotationId(null);
            setSelectedHeatShrinkId(null);
          }}
          onSelectComponentLabel={setSelectedLabel}
          onSelectAnnotation={(annotationId) => {
            setSelectedHarnessId(null);
            setSelection(emptySelection);
            setSelectedLabel(null);
            setSelectedAnnotationId(annotationId);
            setSelectedHeatShrinkId(null);
          }}
          onSelectHeatShrink={(heatShrinkId) => {
            setSelectedHarnessId(null);
            setSelectedLabel(null);
            setSelectedAnnotationId(null);
            setSelectedHeatShrinkId(heatShrinkId);
          }}
          onMoveSelection={(selected, delta) => apply((current) => moveItems(
            current,
            harness.id,
            new Set(selected.componentIds),
            new Set(selected.connectionIds),
            new Set(selected.cableRunIds),
            delta,
          ))}
          onMoveConnectionRoute={(connectionId, point) => apply((current) => setConnectionRoute(current, harness.id, connectionId, point))}
          onMoveCableRunRoute={(cableRunId, point) => apply((current) => setCableRunRoute(current, harness.id, cableRunId, point))}
          onMoveCableRunBreakout={(cableRunId, end, point) => apply((current) => setCableRunBreakout(current, harness.id, cableRunId, end, point))}
          onMoveCableRunLabel={(cableRunId, offset) => apply((current) => setCableRunLabelOffset(current, harness.id, cableRunId, offset))}
          onMoveComponentLabel={(componentId, label, offset) => apply((current) => setComponentLabelPlacement(current, harness.id, componentId, label, { offset }))}
          onMoveComponentPinMap={(componentId, offset) => apply((current) => setComponentPinMapOffset(current, harness.id, componentId, offset))}
          onResizeComponent={(componentId, displayScale) => apply((current) => setComponentDisplayScale(current, harness.id, componentId, displayScale))}
          onRenameConnection={(connectionId, reference) => apply((current) => updateConnection(current, harness.id, connectionId, { reference }))}
          onUpdateProjectMetadata={(changes) => apply((current) => updateProjectMetadata(current, changes))}
          onUpdateHarnessMetadata={(changes) => apply((current) => updateHarnessMetadata(current, harness.id, changes))}
          onUpdateTitleBlock={(changes) => apply((current) => updateDrawingTitleBlock(current, harness.id, changes))}
          onUpdateAnnotation={(annotationId, changes) => apply((current) => updateDrawingAnnotation(current, harness.id, annotationId, changes))}
          onUpdateHeatShrink={(heatShrinkId, changes) => apply((current) => updateCableHeatShrink(current, harness.id, heatShrinkId, changes))}
          onMousePositionChange={setMousePosition}
          onConnect={(from: PinEndpoint2D, to: PinEndpoint2D) => {
            try {
              const result = connectPins(project, harness.id, from, to);
              commit(result.project);
              setSelectedHarnessId(null);
              setSelection({ componentIds: [], connectionIds: [result.connectionId], cableRunIds: [] });
              setSelectedLabel(null);
              setSelectedAnnotationId(null);
              setMessage("핀 연결을 추가했습니다.");
            } catch (error) {
              setMessage(error instanceof Error ? error.message : String(error));
            }
          }}
        />
        <PinMap project={project} harnessId={harness.id} onSelect={(connectionId) => {
          setSelectedHarnessId(null);
          setSelection({ componentIds: [], connectionIds: [connectionId], cableRunIds: [] });
          setSelectedLabel(null);
          setSelectedAnnotationId(null);
        }} />
      </section>
      <Inspector
        project={project}
        harnessId={harness.id}
        selectedComponent={selectedComponent}
        selectedConnection={selectedConnection}
        selectedCableRun={selectedCableRun}
        selectedHeatShrink={selectedHeatShrink}
        selectedAnnotation={selectedAnnotation}
        lengthUnit={settings.lengthUnit}
        onChange={apply}
      />
    </section>

    <footer className="hd2-status-bar">
      <span className={dirty ? "is-dirty" : "is-saved"}>●</span><strong>{dirty ? "Modified" : "Saved"}</strong>
      <span>{harness.components.length} COMPONENTS</span><span>{harness.connections.length} WIRES</span><span>{harness.cableRuns.length} CABLES</span>
      <span className="hd2-status-coordinate">{selectedComponent && selectedComponentPosition
        ? `SELECT ${selectedComponent.reference} · X ${coordinate(selectedComponentPosition.x)} · Y ${coordinate(selectedComponentPosition.y)}`
        : selectedAnnotation
          ? `SELECT ${annotationKindLabel(selectedAnnotation.kind)} · X ${coordinate(selectedAnnotation.position.x)} · Y ${coordinate(selectedAnnotation.position.y)}`
        : "SELECT · —"}</span>
      <span className="hd2-status-coordinate">{mousePosition
        ? `CURSOR · X ${coordinate(mousePosition.x)} · Y ${coordinate(mousePosition.y)}`
        : "CURSOR · —"}</span>
      <span className="hd2-status-message">{message}</span><span>{settings.lengthUnit}</span><span>2D SCHEMA 2</span>
    </footer>

    {settingsOpen && <SettingsDialog
      settings={settings}
      libraryPath={librarySummary?.path ?? null}
      libraryFolder={libraryFolder}
      onApply={(next: Settings2D) => {
        const normalized = normalizeSettings2D(next);
        saveSettings2D(normalized);
        setSettings(normalized);
        setSettingsOpen(false);
        setMessage("환경설정을 저장했습니다.");
      }}
      onClose={() => setSettingsOpen(false)}
      onOpenLibrary={() => { setSettingsOpen(false); setLibraryDialogOpen(true); }}
      onSelectLibraryFolder={() => void selectDefaultLibraryFolder()}
    />}

    {connectorDialogOpen && <ConnectorPickerDialog
      summary={librarySummary}
      onCancel={() => setConnectorDialogOpen(false)}
      onOpenLibrary={() => { setConnectorDialogOpen(false); setLibraryDialogOpen(true); }}
      onSubmit={addNewConnector}
    />}
    {libraryDialogOpen && <PartsLibraryDialog
      summary={librarySummary}
      onSummaryChange={(summary) => {
        setLibrarySummary(summary);
        setMessage(`${summary.name} · ${summary.partCount}개 부품`);
      }}
      onClose={() => setLibraryDialogOpen(false)}
    />}
    {runDialogKind && <WireCableRunDialog
      kind={runDialogKind}
      summary={librarySummary}
      harness={harness}
      onCancel={() => setRunDialogKind(null)}
      onOpenLibrary={() => { setRunDialogKind(null); setLibraryDialogOpen(true); }}
      onSubmit={(draft) => {
        try {
          if (runDialogKind === "wire") {
            const result = addWireRun(project, harness.id, draft as WireRunDraft2D);
            commit(result.project);
            setSelectedHarnessId(null);
            setSelection({ componentIds: [], connectionIds: [result.connectionId], cableRunIds: [] });
            setSelectedLabel(null);
            setSelectedAnnotationId(null);
            setMessage("라이브러리 단선을 추가했습니다.");
          } else {
            const result = addCableRun(project, harness.id, draft as CableRunDraft2D);
            commit(result.project);
            setSelectedHarnessId(null);
            setSelection({ componentIds: [], connectionIds: [], cableRunIds: [result.cableRunId] });
            setSelectedLabel(null);
            setSelectedAnnotationId(null);
            setMessage("멀티코어 케이블 런을 추가했습니다.");
          }
          setRunDialogKind(null);
        } catch (error) {
          setMessage(error instanceof Error ? error.message : String(error));
        }
      }}
    />}
  </main>;
}

type NavigatorProps = {
  project: Project2D;
  activeHarnessId: string;
  selectedHarnessId: string | null;
  selectedComponentIds: string[];
  selectedCableRunIds: string[];
  onAddHarness: () => void;
  onDeleteHarness: (harnessId: string) => void;
  onReorderHarness: (sourceHarnessId: string, targetHarnessId: string, placement: "before" | "after") => void;
  onSelectHarness: (harnessId: string) => void;
  onSelect: (harnessId: string, componentId: string) => void;
  onSelectCable: (harnessId: string, cableRunId: string) => void;
};

function Navigator({ project, activeHarnessId, selectedHarnessId, selectedComponentIds, selectedCableRunIds, onAddHarness, onDeleteHarness, onReorderHarness, onSelectHarness, onSelect, onSelectCable }: NavigatorProps) {
  const draggedHarnessId = useRef<string | null>(null);
  const dropTargetRef = useRef<{ harnessId: string; placement: "before" | "after" } | null>(null);
  const [draggingHarnessId, setDraggingHarnessId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ harnessId: string; placement: "before" | "after" } | null>(null);
  const clearDrag = () => {
    draggedHarnessId.current = null;
    dropTargetRef.current = null;
    setDraggingHarnessId(null);
    setDropTarget(null);
  };
  const updateDropTarget = (event: ReactDragEvent<HTMLButtonElement>, harnessId: string) => {
    event.preventDefault();
    if (!draggedHarnessId.current || draggedHarnessId.current === harnessId) {
      dropTargetRef.current = null;
      setDropTarget(null);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const placement = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    dropTargetRef.current = { harnessId, placement };
    setDropTarget({ harnessId, placement });
  };
  return <aside className="hd2-navigator">
    <h2>프로젝트</h2>
    <div className="hd2-project-summary"><strong>{project.projectNumber}</strong><span>{project.name}</span></div>
    <div className="hd2-tree-heading">하네스 <b>{project.harnesses.length}</b><button type="button" aria-label="새 하네스 도면 생성" onClick={onAddHarness}><Plus size={13} /></button><button type="button" aria-label="선택한 하네스 도면 삭제" disabled={!selectedHarnessId || project.harnesses.length <= 1} onClick={() => selectedHarnessId && onDeleteHarness(selectedHarnessId)}><Trash2 size={13} /></button></div>
    {project.harnesses.map((harness) => <div className="hd2-harness-tree" key={harness.id}>
      <button
        type="button"
        draggable
        aria-label={`${harness.partNumber} 하네스 도면`}
        className={`hd2-harness-row${activeHarnessId === harness.id ? " is-active" : ""}${selectedHarnessId === harness.id ? " is-selected" : ""}${draggingHarnessId === harness.id ? " is-dragging" : ""}${dropTarget?.harnessId === harness.id ? ` is-drop-${dropTarget.placement}` : ""}`}
        onClick={() => onSelectHarness(harness.id)}
        onDragStart={(event) => {
          draggedHarnessId.current = harness.id;
          setDraggingHarnessId(harness.id);
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", harness.id);
          }
        }}
        onDragOver={(event) => updateDropTarget(event, harness.id)}
        onDrop={(event) => {
          event.preventDefault();
          const sourceHarnessId = draggedHarnessId.current || event.dataTransfer?.getData("text/plain");
          const bounds = event.currentTarget.getBoundingClientRect();
          const placement = dropTargetRef.current?.harnessId === harness.id
            ? dropTargetRef.current.placement
            : event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
          if (sourceHarnessId && sourceHarnessId !== harness.id) onReorderHarness(sourceHarnessId, harness.id, placement);
          clearDrag();
        }}
        onDragEnd={clearDrag}
      ><ChevronRight size={14} /><Cable size={15} /><strong>{harness.partNumber}</strong><span>{harness.name}</span></button>
      {activeHarnessId === harness.id && <div className="hd2-tree-list">
        {harness.components.map((component) => <button
          type="button"
          className={selectedComponentIds.includes(component.id) ? "is-selected" : ""}
          key={component.id}
          onClick={() => onSelect(harness.id, component.id)}
        ><span>◇</span><strong>{component.reference}</strong><em>{component.name}</em></button>)}
        {harness.components.length === 0 && <p>등록된 부품이 없습니다.</p>}
        {harness.cableRuns.map((cableRun) => <button type="button" className={selectedCableRunIds.includes(cableRun.id) ? "is-selected" : ""} key={cableRun.id} onClick={() => onSelectCable(harness.id, cableRun.id)}><Cable size={13} /><strong>{cableRun.reference}</strong><em>{cableRun.name}</em></button>)}
      </div>}
    </div>)}
  </aside>;
}

type InspectorProps = {
  project: Project2D;
  harnessId: string;
  selectedComponent: Project2D["harnesses"][number]["components"][number] | undefined;
  selectedConnection: Project2D["harnesses"][number]["connections"][number] | undefined;
  selectedCableRun: Project2D["harnesses"][number]["cableRuns"][number] | undefined;
  selectedHeatShrink: CableHeatShrink2D | undefined;
  selectedAnnotation: DrawingAnnotation2D | undefined;
  lengthUnit: LengthUnit2D;
  onChange: (update: (project: Project2D) => Project2D) => void;
};

function Inspector({ project, harnessId, selectedComponent, selectedConnection, selectedCableRun, selectedHeatShrink, selectedAnnotation, lengthUnit, onChange }: InspectorProps) {
  const harness = project.harnesses.find((item) => item.id === harnessId)!;
  if (selectedHeatShrink) {
    const cableRun = harness.cableRuns.find((item) => item.id === selectedHeatShrink.cableRunId);
    return <aside className="hd2-inspector">
      <h2>속성 <span>HEAT SHRINK</span></h2>
      <InspectorField label="참조" value={selectedHeatShrink.reference} onChange={(reference) => onChange((current) => updateCableHeatShrink(current, harnessId, selectedHeatShrink.id, { reference }))} />
      <InspectorField label="표시 텍스트" value={selectedHeatShrink.text || selectedHeatShrink.reference} onChange={(text) => onChange((current) => updateCableHeatShrink(current, harnessId, selectedHeatShrink.id, { text }))} />
      <InspectorField label="적용 케이블" value={cableRun?.reference ?? "—"} onChange={() => {}} readOnly />
      <InspectorColor label="튜브 색상" value={selectedHeatShrink.color} onChange={(color) => onChange((current) => updateCableHeatShrink(current, harnessId, selectedHeatShrink.id, { color }))} />
      <InspectorColor label="글자 색상" value={selectedHeatShrink.textColor || "#ffffff"} onChange={(textColor) => onChange((current) => updateCableHeatShrink(current, harnessId, selectedHeatShrink.id, { textColor }))} />
      <div className="hd2-engine-note"><strong>경로 종속 수축튜브</strong><p>텍스트를 더블클릭해 직접 수정합니다. 몸체와 텍스트는 케이블 곡률을 따릅니다.</p></div>
    </aside>;
  }
  if (selectedAnnotation) {
    const update = (changes: Partial<Omit<DrawingAnnotation2D, "id" | "kind">>) => onChange((current) => updateDrawingAnnotation(current, harnessId, selectedAnnotation.id, changes));
    const hasText = selectedAnnotation.kind === "label" || selectedAnnotation.kind === "text";
    const hasFill = selectedAnnotation.kind === "label" || selectedAnnotation.kind === "rectangle" || selectedAnnotation.kind === "ellipse";
    const hasStroke = selectedAnnotation.kind !== "text" && selectedAnnotation.kind !== "image";
    return <aside className="hd2-inspector">
      <h2>속성 <span>{annotationKindLabel(selectedAnnotation.kind)}</span></h2>
      {hasText && <InspectorField label="텍스트" value={selectedAnnotation.text} onChange={(text) => update({ text })} />}
      <InspectorNumber label="X" value={selectedAnnotation.position.x} onChange={(x) => update({ position: { ...selectedAnnotation.position, x } })} />
      <InspectorNumber label="Y" value={selectedAnnotation.position.y} onChange={(y) => update({ position: { ...selectedAnnotation.position, y } })} />
      <InspectorNumber label="너비" value={selectedAnnotation.width} minimum={10} onChange={(width) => update({ width })} />
      <InspectorNumber label="높이" value={selectedAnnotation.height} minimum={10} onChange={(height) => update({ height })} />
      {hasText && <InspectorNumber label="글자 크기" value={selectedAnnotation.fontSize} minimum={6} onChange={(fontSize) => update({ fontSize })} />}
      {hasText && <InspectorColor label="글자 색상" value={selectedAnnotation.textColor} onChange={(textColor) => update({ textColor })} />}
      {hasFill && <InspectorColor label="채우기 색상" value={selectedAnnotation.fillColor} onChange={(fillColor) => update({ fillColor })} />}
      {hasStroke && <InspectorColor label="선 색상" value={selectedAnnotation.strokeColor} onChange={(strokeColor) => update({ strokeColor })} />}
      <div className="hd2-engine-note"><strong>도면 배치</strong><p>요소를 끌어 이동하고 오른쪽 아래 핸들을 끌어 크기를 조정합니다.</p></div>
    </aside>;
  }
  if (selectedComponent) {
    const placement = harness.drawing.componentPlacements[selectedComponent.id];
    return <aside className="hd2-inspector">
      <h2>속성 <span>CONNECTOR</span></h2>
      <InspectorField label="참조" value={selectedComponent.reference} onChange={(value) => onChange((current) => updateComponent(current, harnessId, selectedComponent.id, { reference: value }))} />
      <InspectorField label="파트명" value={selectedComponent.name} onChange={(value) => onChange((current) => updateComponent(current, harnessId, selectedComponent.id, { name: value }))} />
      <InspectorField label="파트번호" value={selectedComponent.partNumber} onChange={(value) => onChange((current) => updateComponent(current, harnessId, selectedComponent.id, { partNumber: value }))} />
      <InspectorField label="제조사" value={selectedComponent.manufacturer} onChange={(value) => onChange((current) => updateComponent(current, harnessId, selectedComponent.id, { manufacturer: value }))} />
      <label className="hd2-field"><span>핀 접속면</span><select value={placement.pinSide} onChange={(event) => onChange((current) => setComponentPinSide(current, harnessId, selectedComponent.id, event.target.value as "left" | "right"))}><option value="left">왼쪽</option><option value="right">오른쪽</option></select></label>
      <label className="hd2-field"><span>회전</span><select aria-label="커넥터 회전" value={placement.rotation ?? 0} onChange={(event) => onChange((current) => setComponentRotation(current, harnessId, selectedComponent.id, Number(event.target.value) as ComponentRotation2D))}><option value="0">0°</option><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select></label>
      <div className="hd2-engine-note"><strong>표시 배율 · {Math.round((placement.displayScale ?? 1) * 100)}%</strong><p>도면에서 커넥터를 선택한 뒤 오른쪽 아래 핸들을 끌어 조정합니다.</p></div>
      <label className="hd2-field"><span>참조 라벨 각도</span><input aria-label="참조 라벨 각도" type="number" step="1" value={placement.referenceLabel?.rotation ?? 0} onChange={(event) => onChange((current) => setComponentLabelPlacement(current, harnessId, selectedComponent.id, "referenceLabel", { rotation: Number(event.target.value) }))} /></label>
      <label className="hd2-field"><span>이름 라벨 각도</span><input aria-label="이름 라벨 각도" type="number" step="1" value={placement.nameLabel?.rotation ?? 0} onChange={(event) => onChange((current) => setComponentLabelPlacement(current, harnessId, selectedComponent.id, "nameLabel", { rotation: Number(event.target.value) }))} /></label>
      <div className="hd2-engine-note"><strong>라벨 위치</strong><p>도면의 참조/이름 라벨을 마우스로 끌어 배치합니다.</p></div>
      <div className="hd2-pin-editor"><h3>PIN DEFINITION · {selectedComponent.pins.length}</h3>{selectedComponent.pins.map((pin) => <div key={pin.id}><input aria-label={`${pin.number}번 핀 번호`} value={pin.number} onChange={(event) => onChange((current) => updatePin(current, harnessId, selectedComponent.id, pin.id, { number: event.target.value }))} /><input aria-label={`${pin.number}번 핀 이름`} value={pin.name} onChange={(event) => onChange((current) => updatePin(current, harnessId, selectedComponent.id, pin.id, { name: event.target.value }))} /></div>)}</div>
    </aside>;
  }
  if (selectedCableRun) return <aside className="hd2-inspector">
    <h2>속성 <span>MULTICORE CABLE</span></h2>
    <InspectorField label="케이블 참조" value={selectedCableRun.reference} onChange={(value) => onChange((current) => updateCableRun(current, harnessId, selectedCableRun.id, { reference: value }))} />
    <InspectorField label="파트명" value={selectedCableRun.name} onChange={() => {}} readOnly />
    <InspectorField label="파트번호" value={selectedCableRun.partNumber} onChange={() => {}} readOnly />
    <InspectorNumberField label="길이" unit={lengthUnit} value={selectedCableRun.lengthMm} onChange={(value) => onChange((current) => updateCableRun(current, harnessId, selectedCableRun.id, { lengthMm: value }))} />
    <div className="hd2-engine-note"><strong>{selectedCableRun.cores.length} CORE · Ø{selectedCableRun.outerDiameterMm} mm</strong><p>외피는 cableRunId가 같은 사용 코어만 묶어 표시합니다.</p></div>
  </aside>;
  if (selectedConnection) return <aside className="hd2-inspector">
    <h2>속성 <span>WIRE</span></h2>
    <InspectorField label="전선 참조" value={selectedConnection.reference} onChange={(value) => onChange((current) => updateConnection(current, harnessId, selectedConnection.id, { reference: value }))} />
    <label className="hd2-field"><span>색상</span><select value={selectedConnection.color} onChange={(event) => onChange((current) => updateConnection(current, harnessId, selectedConnection.id, { color: event.target.value }))}>{["BK", "WH", "RD", "BU", "GN", "YE", "OR", "BN", "VT", "GY"].map((color) => <option key={color}>{color}</option>)}</select></label>
    <InspectorField label="규격" value={selectedConnection.gauge} onChange={(value) => onChange((current) => updateConnection(current, harnessId, selectedConnection.id, { gauge: value }))} />
    <InspectorNumberField label="길이" unit={lengthUnit} value={selectedConnection.lengthMm} onChange={(value) => onChange((current) => updateConnection(current, harnessId, selectedConnection.id, { lengthMm: value }))} />
    <label className="hd2-field hd2-field--stack"><span>Notes</span><textarea value={selectedConnection.notes} onChange={(event) => onChange((current) => updateConnection(current, harnessId, selectedConnection.id, { notes: event.target.value }))} /></label>
  </aside>;
  return <aside className="hd2-inspector">
    <h2>속성 <span>PROJECT / HARNESS</span></h2>
    <InspectorField label="프로젝트 번호" value={project.projectNumber} onChange={(value) => onChange((current) => updateProjectMetadata(current, { projectNumber: value }))} />
    <InspectorField label="프로젝트 이름" value={project.name} onChange={(value) => onChange((current) => updateProjectMetadata(current, { name: value }))} />
    <InspectorField label="하네스 파트번호" value={harness.partNumber} onChange={(value) => onChange((current) => updateHarnessMetadata(current, harnessId, { partNumber: value }))} />
    <InspectorField label="하네스 이름" value={harness.name} onChange={(value) => onChange((current) => updateHarnessMetadata(current, harnessId, { name: value }))} />
    <InspectorField label="리비전" value={harness.revision} onChange={(value) => onChange((current) => updateHarnessMetadata(current, harnessId, { revision: value }))} />
    <InspectorField label="생성일" value={harness.drawing.titleBlock?.createdDate ?? ""} onChange={(createdDate) => onChange((current) => updateDrawingTitleBlock(current, harnessId, { createdDate }))} />
    <InspectorField label="작성자" value={harness.drawing.titleBlock?.createdBy ?? ""} onChange={(createdBy) => onChange((current) => updateDrawingTitleBlock(current, harnessId, { createdBy }))} />
    <InspectorField label="검토자" value={harness.drawing.titleBlock?.reviewedBy ?? ""} onChange={(reviewedBy) => onChange((current) => updateDrawingTitleBlock(current, harnessId, { reviewedBy }))} />
    <InspectorField label="승인자" value={harness.drawing.titleBlock?.approvedBy ?? ""} onChange={(approvedBy) => onChange((current) => updateDrawingTitleBlock(current, harnessId, { approvedBy }))} />
  </aside>;
}

function InspectorField({ label, value, onChange, readOnly }: { label: string; value: string; onChange: (value: string) => void; readOnly?: boolean }) {
  return <label className="hd2-field"><span>{label}</span><input value={value} readOnly={readOnly} onChange={(event) => onChange(event.target.value)} /></label>;
}

function InspectorNumberField({ label, unit, value, onChange }: { label: string; unit: LengthUnit2D; value: number; onChange: (value: number) => void }) {
  return <label className="hd2-field"><span>{label} ({unit})</span><input type="number" min="0.01" step={unit === "in" ? "0.01" : "0.1"} value={Number(displayLength(value, unit).toFixed(unit === "in" ? 3 : 1))} onChange={(event) => onChange(storedLength(Number(event.target.value), unit))} /></label>;
}

function InspectorNumber({ label, value, minimum, onChange }: { label: string; value: number; minimum?: number; onChange: (value: number) => void }) {
  return <label className="hd2-field"><span>{label}</span><input type="number" min={minimum} step="1" value={Number(value.toFixed(2))} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function InspectorColor({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="hd2-field"><span>{label}</span><span className="hd2-color-field"><input aria-label={label} type="color" value={value} onChange={(event) => onChange(event.target.value)} /><code>{value.toUpperCase()}</code></span></label>;
}

function annotationKindLabel(kind: DrawingAnnotationKind2D) {
  return { label: "LABEL", text: "TEXT", rectangle: "RECTANGLE", ellipse: "ELLIPSE", image: "IMAGE" }[kind];
}

function PinMap({ project, harnessId, onSelect }: { project: Project2D; harnessId: string; onSelect: (id: string) => void }) {
  const harness = project.harnesses.find((item) => item.id === harnessId)!;
  const endpointLabel = (endpoint: PinEndpoint2D) => {
    const component = harness.components.find((item) => item.id === endpoint.componentId);
    const pin = component?.pins.find((item) => item.id === endpoint.pinId);
    return { reference: component?.reference ?? "?", pin: pin?.number ?? "?" };
  };
  return <section className="hd2-pin-map">
    <h2>PIN MAP <span>{harness.connections.length}</span></h2>
    <div className="hd2-pin-map-scroll"><table><thead><tr><th>Wire</th><th>From</th><th>Pin</th><th>To</th><th>Pin</th><th>Color</th><th>Gauge</th><th>Notes</th></tr></thead><tbody>
      {harness.connections.map((connection) => {
        const from = endpointLabel(connection.from);
        const to = endpointLabel(connection.to);
        return <tr key={connection.id} onClick={() => onSelect(connection.id)}><td>{connection.reference}</td><td>{from.reference}</td><td>{from.pin}</td><td>{to.reference}</td><td>{to.pin}</td><td>{connection.color}</td><td>{connection.gauge}</td><td>{connection.notes}</td></tr>;
      })}
      {harness.connections.length === 0 && <tr><td colSpan={8} className="hd2-empty-row">핀을 드래그하여 연결하면 여기에 핀맵이 생성됩니다.</td></tr>}
    </tbody></table></div>
  </section>;
}

function isEditingElement(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("이미지를 읽을 수 없습니다."));
    reader.onerror = () => reject(reader.error ?? new Error("이미지를 읽을 수 없습니다."));
    reader.readAsDataURL(file);
  });
}
