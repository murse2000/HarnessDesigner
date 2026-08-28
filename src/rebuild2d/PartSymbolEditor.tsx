import { ClipboardPaste, FileUp, Focus, MousePointer2, Palette, Rotate3D, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import { drawingPathData, extractPartDrawing, normalizeRectangle, parseDxfDrawing, partDrawingStrokeWidth, type ParsedDxf2D, type Rectangle2D } from "./dxfSymbol";
import type { ModelAsset } from "../domain/types";
import { importStepAsset } from "../three/stepImport";
import type { LibraryPartDraft2D } from "./library";
import type { PartDrawingEditorState2D, PinAnchor2D, Point2D } from "./model";
import { extractRasterPartDrawing, parseImageDrawing, type ParsedRaster2D } from "./pdfSymbol";
import { extractStepShadedPartDrawing, projectStepDrawing, stepSurfaceDefaultColor, stepSurfaceFill, type ParsedStepDrawing2D, type StepDrawingRotation, type StepRenderMode } from "./stepSymbol";

type EditorMode = "select" | "pins" | "rotate" | "color";
type ViewBox2D = Rectangle2D;
type ParsedSource2D = ParsedDxf2D | ParsedRaster2D;
const DEFAULT_SYMBOL_MAX_SIZE = 40;
const STEP_STANDARD_VIEWS: Array<{ name: string; rotation: StepDrawingRotation }> = [
  { name: "정면", rotation: { x: 0, y: 0, z: 0 } },
  { name: "후면", rotation: { x: 0, y: 180, z: 0 } },
  { name: "좌측", rotation: { x: 0, y: -90, z: 0 } },
  { name: "우측", rotation: { x: 0, y: 90, z: 0 } },
  { name: "상면", rotation: { x: -90, y: 0, z: 0 } },
  { name: "하면", rotation: { x: 90, y: 0, z: 0 } },
];

export function PartSymbolEditor({ draft, onApply, onClose, purpose = "part" }: {
  draft: LibraryPartDraft2D;
  onApply: (draft: LibraryPartDraft2D) => void;
  onClose: () => void;
  purpose?: "part" | "drawing";
}) {
  const initial = useMemo(() => existingDrawingAsParsed(draft), []);
  const svgRef = useRef<SVGSVGElement>(null);
  const drawingInputRef = useRef<HTMLInputElement>(null);
  const stepDragRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    rotation: StepDrawingRotation;
    zOnly: boolean;
  } | null>(null);
  const [parsed, setParsed] = useState<ParsedSource2D | null>(initial.parsed);
  const [viewBox, setViewBox] = useState<ViewBox2D>(initial.viewBox);
  const [selection, setSelection] = useState<Rectangle2D | null>(initial.selection);
  const [selectionStart, setSelectionStart] = useState<Point2D | null>(null);
  const [mode, setMode] = useState<EditorMode>("select");
  const [pinPoints, setPinPoints] = useState<Array<Point2D | null>>(initial.pinPoints);
  const [pinDirections, setPinDirections] = useState<PinAnchor2D[]>(initial.pinDirections);
  const [activePin, setActivePin] = useState(0);
  const [dragPin, setDragPin] = useState<number | null>(null);
  const [stepAsset, setStepAsset] = useState<ModelAsset | null>(initial.stepAsset);
  const [stepRotation, setStepRotation] = useState<StepDrawingRotation>(initial.stepRotation);
  const [stepRenderMode, setStepRenderMode] = useState<StepRenderMode>(initial.stepRenderMode);
  const [stepSurfaceColors, setStepSurfaceColors] = useState<Record<string, string>>(initial.stepSurfaceColors);
  const [activeStepSurface, setActiveStepSurface] = useState(0);
  const [outlineStrength, setOutlineStrength] = useState(draft.drawing ? draft.drawing.outlineStrength ?? 1 : 1.6);
  const [stepLoading, setStepLoading] = useState(Boolean(initial.stepAsset?.sourceDataBase64 && initial.stepAsset.meshes.length === 0));
  const [error, setError] = useState("");

  const currentSelection = selectionStart && selection
    ? normalizeRectangle({ x: selectionStart.x, y: selectionStart.y, width: selection.width - selectionStart.x, height: selection.height - selectionStart.y })
    : selection;
  const strokeWidth = Math.max(viewBox.width, viewBox.height) / 850;

  const resetImportedDrawing = (loaded: ParsedSource2D) => {
    const padded = padBounds(loaded.bounds, 0.035);
    setParsed(loaded);
    setViewBox(padded);
    setSelection(purpose === "drawing" ? { ...loaded.bounds } : null);
    setSelectionStart(null);
    setPinPoints(Array.from({ length: draft.pins.length }, () => null));
    setPinDirections(defaultDirections(draft.pins.length));
    setActivePin(0);
    setMode("select");
  };

  const importDrawing = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    try {
      if (isImageFile(file)) {
        setStepAsset(null);
        resetImportedDrawing(await parseImageDrawing(file, file.name));
      } else if (isStepFile(file)) {
        const asset = await importStepAsset(new Uint8Array(await file.arrayBuffer()), file.name);
        const rotation = { x: 0, y: 0, z: 0 };
        const colors = Object.fromEntries(asset.meshes.map((_, index) => [String(index), stepSurfaceDefaultColor(asset, index)]));
        setStepAsset(asset);
        setStepRotation(rotation);
        setStepRenderMode("shaded");
        setStepSurfaceColors(colors);
        setActiveStepSurface(0);
        resetImportedDrawing(projectStepDrawing(asset, rotation));
        setMode("rotate");
      } else {
        setStepAsset(null);
        resetImportedDrawing(parseDxfDrawing(await file.text(), file.name));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const updateStepSurfaceColor = (color: string) => {
    if (!stepAsset) return;
    setStepSurfaceColors((current) => ({ ...current, [String(activeStepSurface)]: color }));
  };

  const applyStepRotation = (rotation: StepDrawingRotation) => {
    if (!stepAsset) return;
    try {
      const loaded = projectStepDrawing(stepAsset, rotation);
      setStepRotation(rotation);
      setParsed(loaded);
      setViewBox((current) => centerViewBoxOnBounds(current, loaded.bounds));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const updateStepRotation = (axis: keyof StepDrawingRotation, value: number) => {
    if (!Number.isFinite(value)) return;
    applyStepRotation({ ...stepRotation, [axis]: normalizeDegrees(value) });
  };

  const pasteClipboardImage = async () => {
    setError("");
    try {
      if (!navigator.clipboard?.read) throw new Error("클립보드 읽기를 지원하지 않습니다. ⌘/Ctrl+V를 사용하세요.");
      const items = await navigator.clipboard.read();
      const imageType = items.flatMap((item) => item.types).find((type) => type.startsWith("image/"));
      const item = items.find((candidate) => imageType && candidate.types.includes(imageType));
      if (!imageType || !item) throw new Error("클립보드에 이미지가 없습니다.");
      resetImportedDrawing(await parseImageDrawing(await item.getType(imageType), "클립보드 이미지.png"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  useEffect(() => {
    const savedAsset = initial.stepAsset;
    if (!savedAsset?.sourceDataBase64 || savedAsset.meshes.length > 0) return;
    let cancelled = false;
    void importStepAsset(base64ToBytes(savedAsset.sourceDataBase64), savedAsset.sourceName)
      .then((loaded) => {
        if (cancelled) return;
        const hydrated = { ...loaded, id: savedAsset.id };
        setStepAsset(hydrated);
        setParsed(projectStepDrawing(hydrated, initial.stepRotation));
        setStepLoading(false);
      })
      .catch((reason) => {
        if (cancelled) return;
        setStepLoading(false);
        setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.items ?? [])
        .find((item) => item.type.startsWith("image/"))?.getAsFile();
      if (!file) return;
      event.preventDefault();
      void parseImageDrawing(file, file.name || "클립보드 이미지.png")
        .then(resetImportedDrawing)
        .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  const toDrawingPoint = (clientX: number, clientY: number): Point2D => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM()?.inverse();
    if (!svg || !matrix) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const transformed = point.matrixTransform(matrix);
    return { x: transformed.x, y: transformed.y };
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || !parsed) return;
    event.currentTarget.focus();
    if (mode === "rotate" && stepAsset) {
      event.currentTarget.setPointerCapture(event.pointerId);
      stepDragRef.current = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        rotation: stepRotation,
        zOnly: event.shiftKey,
      };
      return;
    }
    const point = toDrawingPoint(event.clientX, event.clientY);
    if (mode === "select") {
      event.currentTarget.setPointerCapture(event.pointerId);
      setSelectionStart(point);
      setSelection({ x: point.x, y: point.y, width: point.x, height: point.y });
    } else if (mode === "pins") {
      setPinPoints((current) => current.map((item, index) => index === activePin ? point : item));
      setActivePin((current) => Math.min(draft.pins.length - 1, current + 1));
    }
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!parsed) return;
    const stepDrag = stepDragRef.current;
    if (stepAsset && stepDrag?.pointerId === event.pointerId) {
      const rotation = stepRotationFromDrag(
        stepDrag.rotation,
        event.clientX - stepDrag.clientX,
        event.clientY - stepDrag.clientY,
        stepDrag.zOnly,
        0.4,
        event.altKey,
      );
      try {
        const loaded = projectStepDrawing(stepAsset, rotation);
        setStepRotation(rotation);
        setParsed(loaded);
        setViewBox((current) => centerViewBoxOnBounds(current, loaded.bounds));
        setError("");
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
      return;
    }
    const point = toDrawingPoint(event.clientX, event.clientY);
    if (dragPin !== null) {
      setPinPoints((current) => current.map((item, index) => index === dragPin ? point : item));
    } else if (selectionStart && mode === "select") {
      setSelection({ x: selectionStart.x, y: selectionStart.y, width: point.x, height: point.y });
    }
  };

  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (selectionStart && selection) {
      setSelection(normalizeRectangle({ x: selectionStart.x, y: selectionStart.y, width: selection.width - selectionStart.x, height: selection.height - selectionStart.y }));
      setSelectionStart(null);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    stepDragRef.current = null;
    setDragPin(null);
  };

  const onWheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratioX = (event.clientX - bounds.left) / bounds.width;
    const ratioY = (event.clientY - bounds.top) / bounds.height;
    const factor = partSymbolWheelScale(event.deltaY, event.deltaMode);
    setViewBox((current) => {
      const width = current.width * factor;
      const height = current.height * factor;
      return {
        x: current.x + (current.width - width) * ratioX,
        y: current.y + (current.height - height) * ratioY,
        width,
        height,
      };
    });
  };

  const autoPlacePins = () => {
    if (!selection) {
      setError("커넥터 투상도 영역을 먼저 선택하세요.");
      return;
    }
    const normalized = normalizeRectangle(selection);
    setPinPoints(draft.pins.map((_, index) => ({
      x: normalized.x + normalized.width,
      y: normalized.y + normalized.height * (index + 1) / (draft.pins.length + 1),
    })));
    setPinDirections(defaultDirections(draft.pins.length));
    setError("");
  };

  const apply = async () => {
    if (!parsed || !selection) {
      setError("도면 파일을 불러오고 커넥터 투상도 영역을 선택하세요.");
      return;
    }
    if (!draft.drawing && pinPoints.some((point) => !point)) {
      setError("모든 핀 접속점을 배치하세요.");
      return;
    }
    try {
      const normalizedSelection = normalizeRectangle(selection);
      const symbolScale = DEFAULT_SYMBOL_MAX_SIZE / Math.max(normalizedSelection.width, normalizedSelection.height);
      const drawing = stepAsset && stepRenderMode === "shaded" && isParsedStep(parsed)
        ? extractStepShadedPartDrawing(parsed, stepAsset, stepSurfaceColors, normalizedSelection, symbolScale, outlineStrength)
        : isParsedRaster(parsed)
        ? await extractRasterPartDrawing(parsed, normalizedSelection, symbolScale)
        : extractPartDrawing(parsed, normalizedSelection, symbolScale);
      const pins = draft.pins.map((pin, index) => {
        const sourcePoint = pinPoints[index];
        if (!sourcePoint) return pin;
        const direction = pinDirections[index];
        return {
          ...pin,
          anchor: {
            xMm: (sourcePoint.x - normalizedSelection.x) * symbolScale,
            yMm: (sourcePoint.y - normalizedSelection.y) * symbolScale,
            directionX: direction.directionX,
            directionY: direction.directionY,
          },
        };
      });
      onApply({
        ...draft,
        pins,
        drawing: {
          ...drawing,
          ...(drawing.paths.length > 0 ? { outlineStrength } : {}),
          editorState: {
            source: cloneParsedSource(parsed),
            selection: { ...normalizedSelection },
            viewBox: { ...viewBox },
            pinPoints: pinPoints.map((point) => point ? { ...point } : null),
            stepRotation: stepAsset ? { ...stepRotation } : undefined,
            stepAsset: stepAsset ? compactStepAsset(stepAsset) : undefined,
            stepRenderMode: stepAsset ? stepRenderMode : undefined,
            stepSurfaceColors: stepAsset ? { ...stepSurfaceColors } : undefined,
          },
        },
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const rotateStepQuarterTurn = () => {
    if (!stepAsset) return;
    updateStepRotation("z", stepRotation.z + 90);
  };

  const guideCenter = parsed ? {
    x: parsed.bounds.x + parsed.bounds.width / 2,
    y: parsed.bounds.y + parsed.bounds.height / 2,
  } : null;
  const guideRadius = parsed ? Math.max(parsed.bounds.width, parsed.bounds.height) * 0.58 : 0;
  const editorTitle = purpose === "drawing" ? "STEP 도면 객체 편집기" : "커넥터 2D 심벌 편집기";

  return <div className="hd2-dialog-backdrop hd2-symbol-editor-backdrop">
    <section className="hd2-symbol-editor" role="dialog" aria-label={editorTitle}>
      <header>
        <div><strong>{editorTitle}</strong><span>{purpose === "drawing" ? draft.drawing ? "저장된 STEP 각도와 표면 색상을 수정해 같은 객체에 적용합니다." : "STEP 각도와 표면 색상을 정한 뒤 투영 객체를 도면에 추가합니다." : "DXF·이미지 또는 STEP 투영에서 필요한 투상도와 핀 접속점을 지정합니다."}</span></div>
        <button type="button" onClick={() => drawingInputRef.current?.click()}><FileUp size={14} />도면 / STEP 열기</button>
        <button type="button" onClick={() => void pasteClipboardImage()}><ClipboardPaste size={14} />클립보드 이미지</button>
        <input ref={drawingInputRef} className="hd2-symbol-file-input" type="file" accept=".dxf,.png,.jpg,.jpeg,.webp,.step,.stp,image/png,image/jpeg,image/webp" onChange={(event) => void importDrawing(event.target.files?.[0])} />
        <button type="button" onClick={onClose}>닫기</button>
      </header>
      <div className="hd2-symbol-toolbar">
        {stepAsset && <button type="button" className={mode === "rotate" ? "is-selected" : ""} onClick={() => setMode("rotate")}><Rotate3D size={14} />마우스 회전</button>}
        {stepAsset && <button type="button" onClick={rotateStepQuarterTurn} title="Z축으로 90° 회전 (R)">R · 90°</button>}
        {stepAsset && <button type="button" className={mode === "color" ? "is-selected" : ""} onClick={() => { setStepRenderMode("shaded"); setMode("color"); }}><Palette size={14} />표면 색상</button>}
        <button type="button" className={mode === "select" ? "is-selected" : ""} onClick={() => setMode("select")}><MousePointer2 size={14} />영역 선택</button>
        {purpose === "part" && <button type="button" className={mode === "pins" ? "is-selected" : ""} onClick={() => setMode("pins")}><Focus size={14} />핀 배치</button>}
        {purpose === "part" && <button type="button" onClick={autoPlacePins}>핀 자동 배치</button>}
        <button type="button" onClick={() => parsed && setViewBox(padBounds(parsed.bounds, 0.035))}>전체 보기</button>
        {stepAsset && <div className="hd2-step-standard-views" role="group" aria-label="STEP 기준면"><b>기준면</b>{STEP_STANDARD_VIEWS.map((view) => <button type="button" key={view.name} className={sameStepRotation(stepRotation, view.rotation) ? "is-selected" : ""} onClick={() => applyStepRotation({ ...view.rotation })}>{view.name}</button>)}</div>}
        {stepAsset && <div className="hd2-symbol-step-rotation"><b>미세 조정</b>{(["x", "y", "z"] as const).map((axis) => <label key={axis}><span>{axis.toUpperCase()}</span><button type="button" aria-label={`STEP ${axis.toUpperCase()} -5도`} onClick={() => updateStepRotation(axis, stepRotation[axis] - 5)}>−</button><input aria-label={`STEP ${axis.toUpperCase()} 회전`} type="number" step="1" value={stepRotation[axis]} onChange={(event) => updateStepRotation(axis, Number(event.target.value))} /><button type="button" aria-label={`STEP ${axis.toUpperCase()} +5도`} onClick={() => updateStepRotation(axis, stepRotation[axis] + 5)}>+</button><em>°</em></label>)}</div>}
        {stepAsset && <div className="hd2-symbol-render-mode"><b>표현</b><button type="button" className={stepRenderMode === "shaded" ? "is-selected" : ""} onClick={() => setStepRenderMode("shaded")}>음영</button><button type="button" className={stepRenderMode === "technical" ? "is-selected" : ""} onClick={() => setStepRenderMode("technical")}>기술도면</button></div>}
        {parsed && parsed.paths.length > 0 && <label className="hd2-symbol-outline-strength"><span>선 강도</span><input aria-label="윤곽선 강도" type="range" min="0.5" max="4" step="0.1" value={outlineStrength} onChange={(event) => setOutlineStrength(Number(event.target.value))} /><b>{outlineStrength.toFixed(1)}×</b></label>}
        <span>{parsed ? isParsedRaster(parsed) ? `${parsed.sourceName} · 이미지` : `${parsed.sourceName} · 형상 ${parsed.paths.length}개` : "도면 또는 STEP 파일을 불러오거나 이미지를 붙여넣으세요."}</span>
      </div>
      <div className="hd2-symbol-body">
        <div className="hd2-symbol-canvas">
          {parsed ? <svg
            ref={svgRef}
            className={mode === "rotate" ? "is-step-rotating" : undefined}
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key.toLowerCase() !== "r" || !stepAsset) return;
              event.preventDefault();
              rotateStepQuarterTurn();
            }}
          >
            <rect className="hd2-symbol-background" x={viewBox.x} y={viewBox.y} width={viewBox.width} height={viewBox.height} />
            {isParsedRaster(parsed) && <image className="hd2-symbol-pdf-page" href={parsed.imageDataUrl} x={parsed.bounds.x} y={parsed.bounds.y} width={parsed.bounds.width} height={parsed.bounds.height} />}
            {stepAsset && stepRenderMode === "shaded" && isParsedStep(parsed) && <g className="hd2-step-surfaces">
              {parsed.surfaces.map((surface, index) => <polygon
                key={index}
                className={surface.meshIndex === activeStepSurface && mode === "color" ? "is-selected" : undefined}
                points={surface.points.map((point) => `${point.x},${point.y}`).join(" ")}
                fill={stepSurfaceFill(stepAsset, surface.meshIndex, stepSurfaceColors, surface.brightness)}
                onPointerDown={(event) => {
                  if (mode !== "color") return;
                  event.preventDefault();
                  event.stopPropagation();
                  setActiveStepSurface(surface.meshIndex);
                }}
              />)}
            </g>}
            <g className={`hd2-symbol-source${stepAsset ? " is-step-source" : ""}`} style={{ strokeWidth: partDrawingStrokeWidth(outlineStrength) }}>
              {parsed.paths.map((path, index) => <path key={index} d={drawingPathData(path)} />)}
            </g>
            {stepAsset && mode === "rotate" && guideCenter && <g className="hd2-step-rotation-guide" aria-label="STEP 회전 가이드">
              <circle cx={guideCenter.x} cy={guideCenter.y} r={guideRadius} />
              <line x1={guideCenter.x - guideRadius} y1={guideCenter.y} x2={guideCenter.x + guideRadius} y2={guideCenter.y} />
              <line x1={guideCenter.x} y1={guideCenter.y - guideRadius} x2={guideCenter.x} y2={guideCenter.y + guideRadius} />
              <circle className="hd2-step-rotation-guide-center" cx={guideCenter.x} cy={guideCenter.y} r={strokeWidth * 4} />
            </g>}
            {currentSelection && <rect className="hd2-symbol-selection" {...currentSelection} style={{ strokeWidth: strokeWidth * 1.5 }} />}
            {pinPoints.map((point, index) => point && <g key={index} className={`hd2-symbol-pin${activePin === index ? " is-active" : ""}`}>
              <line x1={point.x} y1={point.y} x2={point.x + pinDirections[index].directionX * strokeWidth * 18} y2={point.y + pinDirections[index].directionY * strokeWidth * 18} style={{ strokeWidth: strokeWidth * 2 }} />
              <circle cx={point.x} cy={point.y} r={strokeWidth * 6} onPointerDown={(event) => { event.stopPropagation(); setActivePin(index); setDragPin(index); svgRef.current?.setPointerCapture(event.pointerId); }} />
              <text x={point.x + strokeWidth * 8} y={point.y - strokeWidth * 8} style={{ fontSize: strokeWidth * 11 }}>{draft.pins[index].number}</text>
            </g>)}
          </svg> : <div className="hd2-symbol-empty"><FileUp size={40} /><strong>DXF, 이미지 또는 STEP 파일을 불러오세요.</strong><span>STEP은 마우스로 각도를 맞춘 뒤 필요한 영역을 선택할 수 있습니다.</span></div>}
          {stepAsset && mode === "rotate" && <div className="hd2-step-gesture-help"><Rotate3D size={14} /><span><b>드래그</b> 가로 Y / 세로 X · 5° 스냅</span><span><b>Shift</b> Z 회전</span><span><b>Alt</b> 미세 회전</span></div>}
        </div>
        <aside>
          <section><h3>1. 투상도 영역</h3><p>필요한 커넥터 투상도를 사각형으로 감싸세요. 도면 테두리와 표는 영역 밖으로 제외합니다.</p>{selection && <dl><dt>원본 폭</dt><dd>{Math.abs(selection.width).toFixed(3)}</dd><dt>원본 높이</dt><dd>{Math.abs(selection.height).toFixed(3)}</dd></dl>}</section>
          {purpose === "part" && <section><h3>2. 핀 접속점 · {pinPoints.filter(Boolean).length}/{draft.pins.length}</h3><p>핀 배치 모드에서 도면을 클릭하거나 핸들을 드래그하세요.</p><div className="hd2-symbol-pin-list">{draft.pins.map((pin, index) => <button type="button" key={index} className={activePin === index ? "is-selected" : ""} onClick={() => { setMode("pins"); setActivePin(index); }}><b>{pin.number}</b><span>{pin.name}</span><em>{pinPoints[index] ? "배치됨" : "미배치"}</em></button>)}</div>{draft.pins[activePin] && <label><span>선 인출 방향</span><select value={directionName(pinDirections[activePin])} onChange={(event) => setPinDirections((current) => current.map((item, index) => index === activePin ? directionFromName(event.target.value) : item))}><option value="right">오른쪽</option><option value="left">왼쪽</option><option value="up">위쪽</option><option value="down">아래쪽</option></select></label>}</section>}
          {stepAsset && <section><h3>3. STEP 표면 색상</h3><p>표면 색상 모드에서 커넥터 면을 클릭한 뒤 색상을 지정하세요.</p><label><span>선택 영역</span><select aria-label="STEP 표면 영역" value={activeStepSurface} onChange={(event) => setActiveStepSurface(Number(event.target.value))}>{stepAsset.meshes.map((mesh, index) => <option key={index} value={index}>{mesh.name || `영역 ${index + 1}`}</option>)}</select></label><label><span>표면 색상</span><input aria-label="STEP 표면 색상" type="color" value={stepSurfaceColors[String(activeStepSurface)] ?? stepSurfaceDefaultColor(stepAsset, activeStepSurface)} onChange={(event) => updateStepSurfaceColor(event.target.value)} /></label></section>}
          {parsed && parsed.unsupported.length > 0 && <section className="hd2-symbol-warning"><h3>제외·근사 형상</h3><p>묵시적으로 삭제하지 않고 결과에 기록합니다.</p><ul>{parsed.unsupported.map((item) => <li key={item.type}>{item.type} · {item.count}</li>)}</ul></section>}
        </aside>
      </div>
      {error && <div className="hd2-library-error">{error}</div>}
      <footer>{purpose === "part" && <button type="button" onClick={() => onApply({ ...draft, drawing: undefined, pins: draft.pins.map((pin) => ({ ...pin, anchor: undefined })) })}><Trash2 size={14} />등록 도면 제거</button>}<span>{stepLoading ? "저장된 STEP 원본을 불러오는 중입니다." : selection ? "도면 배치 후 크기 조절 핸들로 표시 배율을 지정합니다." : "추출 영역을 선택하세요."}</span><button type="button" onClick={onClose}>취소</button><button type="button" className="is-primary" disabled={stepLoading} onClick={() => void apply()}>{purpose === "drawing" ? draft.drawing ? "도면 수정 적용" : "도면에 추가" : "심벌 적용"}</button></footer>
    </section>
  </div>;
}

export function partSymbolWheelScale(deltaY: number, deltaMode = 0) {
  const normalizedDelta = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 100 : 1);
  return Math.exp(Math.max(-100, Math.min(100, normalizedDelta)) * 0.00045);
}

export function stepRotationFromDrag(
  initial: StepDrawingRotation,
  deltaX: number,
  deltaY: number,
  zOnly: boolean,
  degreesPerPixel = 0.4,
  fine = false,
): StepDrawingRotation {
  const snapDelta = (delta: number) => fine ? delta : Math.round(delta / 5) * 5;
  if (zOnly) return { ...initial, z: normalizeDegrees(initial.z + snapDelta(deltaX * degreesPerPixel)) };
  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return { ...initial, y: normalizeDegrees(initial.y + snapDelta(deltaX * degreesPerPixel)) };
  }
  return { ...initial, x: normalizeDegrees(initial.x + snapDelta(deltaY * degreesPerPixel)) };
}

function sameStepRotation(left: StepDrawingRotation, right: StepDrawingRotation) {
  return normalizeDegrees(left.x) === normalizeDegrees(right.x)
    && normalizeDegrees(left.y) === normalizeDegrees(right.y)
    && normalizeDegrees(left.z) === normalizeDegrees(right.z);
}

function normalizeDegrees(value: number) {
  return Math.round(((((value + 180) % 360) + 360) % 360 - 180) * 10) / 10;
}

function centerViewBoxOnBounds(current: ViewBox2D, bounds: Rectangle2D): ViewBox2D {
  return {
    x: bounds.x + bounds.width / 2 - current.width / 2,
    y: bounds.y + bounds.height / 2 - current.height / 2,
    width: current.width,
    height: current.height,
  };
}

function existingDrawingAsParsed(draft: LibraryPartDraft2D) {
  if (!draft.drawing) return {
    parsed: null,
    selection: null,
    viewBox: { x: 0, y: 0, width: 100, height: 100 },
    pinPoints: Array.from({ length: draft.pins.length }, () => null as Point2D | null),
    pinDirections: defaultDirections(draft.pins.length),
    stepAsset: null,
    stepRotation: { x: 0, y: 0, z: 0 },
    stepRenderMode: "shaded" as StepRenderMode,
    stepSurfaceColors: {},
  };
  const saved = draft.drawing.editorState;
  if (saved) {
    const stepAsset = saved.stepAsset ? cloneStepAsset(saved.stepAsset) : null;
    const stepRotation = saved.stepRotation ? { ...saved.stepRotation } : { x: 0, y: 0, z: 0 };
    return {
      parsed: stepAsset && (stepAsset.meshes.length > 0 || !stepAsset.sourceDataBase64)
        ? projectStepDrawing(stepAsset, stepRotation)
        : cloneSavedSource(saved.source),
      selection: { ...saved.selection },
      viewBox: { ...saved.viewBox },
      pinPoints: draft.pins.map((_, index) => saved.pinPoints[index] ? { ...saved.pinPoints[index]! } : null),
      pinDirections: draft.pins.map((pin) => pin.anchor ?? directionFromName("right")),
      stepAsset,
      stepRotation,
      stepRenderMode: saved.stepRenderMode ?? "shaded",
      stepSurfaceColors: { ...(saved.stepSurfaceColors ?? {}) },
    };
  }
  const bounds = { x: 0, y: 0, width: draft.drawing.widthMm, height: draft.drawing.heightMm };
  return {
    parsed: draft.drawing.imageDataUrl ? {
      sourceName: draft.drawing.sourceName,
      bounds,
      paths: [] as [],
      unsupported: [] as [],
      imageDataUrl: draft.drawing.imageDataUrl,
      sourceType: "image" as const,
      pageNumber: 1,
      pageCount: 1,
    } : { sourceName: draft.drawing.sourceName, bounds, paths: draft.drawing.paths, unsupported: draft.drawing.unsupportedEntities },
    selection: bounds,
    viewBox: padBounds(bounds, 0.12),
    pinPoints: draft.pins.map((pin) => pin.anchor ? { x: pin.anchor.xMm, y: pin.anchor.yMm } : null),
    pinDirections: draft.pins.map((pin) => pin.anchor ?? directionFromName("right")),
    stepAsset: null,
    stepRotation: { x: 0, y: 0, z: 0 },
    stepRenderMode: "shaded" as StepRenderMode,
    stepSurfaceColors: {},
  };
}

function cloneParsedSource(parsed: ParsedSource2D): PartDrawingEditorState2D["source"] {
  return {
    sourceName: parsed.sourceName,
    bounds: { ...parsed.bounds },
    paths: parsed.paths.map((path) => ({ ...path, points: path.points.map((point) => ({ ...point })) })),
    unsupported: parsed.unsupported.map((item) => ({ ...item })),
    ...(isParsedRaster(parsed) ? {
      imageDataUrl: parsed.imageDataUrl,
      sourceType: parsed.sourceType,
      pageNumber: parsed.pageNumber,
      pageCount: parsed.pageCount,
    } : {}),
  };
}

function cloneSavedSource(source: PartDrawingEditorState2D["source"]): ParsedSource2D {
  const common = {
    sourceName: source.sourceName,
    bounds: { ...source.bounds },
    paths: source.paths.map((path) => ({ ...path, points: path.points.map((point) => ({ ...point })) })),
    unsupported: source.unsupported.map((item) => ({ ...item })),
  };
  return source.imageDataUrl ? {
    ...common,
    paths: [],
    unsupported: [],
    imageDataUrl: source.imageDataUrl,
    sourceType: source.sourceType ?? "image",
    pageNumber: source.pageNumber ?? 1,
    pageCount: source.pageCount ?? 1,
  } : common;
}

function cloneStepAsset(asset: ModelAsset): ModelAsset {
  return {
    ...asset,
    meshes: asset.meshes.map((mesh) => ({
      ...mesh,
      color: mesh.color ? [...mesh.color] : undefined,
      positions: [...mesh.positions],
      normals: mesh.normals ? [...mesh.normals] : undefined,
      indices: [...mesh.indices],
    })),
  };
}

function compactStepAsset(asset: ModelAsset): ModelAsset {
  return { ...asset, meshes: [] };
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function isParsedRaster(parsed: ParsedSource2D): parsed is ParsedRaster2D {
  return "imageDataUrl" in parsed;
}

function isParsedStep(parsed: ParsedSource2D): parsed is ParsedStepDrawing2D {
  return "surfaces" in parsed;
}

function isImageFile(file: File) {
  return file.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(file.name);
}

function isStepFile(file: File) {
  return /\.(step|stp)$/i.test(file.name);
}

function padBounds(bounds: Rectangle2D, ratio: number): Rectangle2D {
  const padding = Math.max(bounds.width, bounds.height) * ratio;
  return { x: bounds.x - padding, y: bounds.y - padding, width: bounds.width + padding * 2, height: bounds.height + padding * 2 };
}

function defaultDirections(count: number) {
  return Array.from({ length: count }, () => directionFromName("right"));
}

function directionFromName(name: string): PinAnchor2D {
  if (name === "left") return { xMm: 0, yMm: 0, directionX: -1, directionY: 0 };
  if (name === "up") return { xMm: 0, yMm: 0, directionX: 0, directionY: -1 };
  if (name === "down") return { xMm: 0, yMm: 0, directionX: 0, directionY: 1 };
  return { xMm: 0, yMm: 0, directionX: 1, directionY: 0 };
}

function directionName(direction: PinAnchor2D | undefined) {
  if (!direction) return "right";
  if (direction.directionX < 0) return "left";
  if (direction.directionY < 0) return "up";
  if (direction.directionY > 0) return "down";
  return "right";
}
