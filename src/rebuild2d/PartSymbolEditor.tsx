import { ChevronLeft, ChevronRight, ClipboardPaste, FileUp, Focus, MousePointer2, Rotate3D, Ruler, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import { drawingPathData, extractPartDrawing, normalizeRectangle, parseDxfDrawing, type ParsedDxf2D, type Rectangle2D } from "./dxfSymbol";
import type { ModelAsset } from "../domain/types";
import { importStepAsset } from "../three/stepImport";
import type { LibraryPartDraft2D } from "./library";
import type { PinAnchor2D, Point2D } from "./model";
import { extractRasterPartDrawing, parseImageDrawing, parsePdfDrawing, type ParsedRaster2D } from "./pdfSymbol";
import { projectStepDrawing, type StepDrawingRotation } from "./stepSymbol";

type EditorMode = "select" | "calibrate" | "pins" | "rotate";
type ViewBox2D = Rectangle2D;
type ParsedSource2D = ParsedDxf2D | ParsedRaster2D;

export function PartSymbolEditor({ draft, onApply, onClose }: {
  draft: LibraryPartDraft2D;
  onApply: (draft: LibraryPartDraft2D) => void;
  onClose: () => void;
}) {
  const initial = useMemo(() => existingDrawingAsParsed(draft), []);
  const svgRef = useRef<SVGSVGElement>(null);
  const drawingInputRef = useRef<HTMLInputElement>(null);
  const pdfSourceRef = useRef<{ bytes: Uint8Array; name: string } | null>(null);
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
  const [calibration, setCalibration] = useState<Point2D[]>([]);
  const [actualLengthMm, setActualLengthMm] = useState(10);
  const [millimetersPerUnit, setMillimetersPerUnit] = useState(initial.millimetersPerUnit);
  const [pinPoints, setPinPoints] = useState<Array<Point2D | null>>(initial.pinPoints);
  const [pinDirections, setPinDirections] = useState<PinAnchor2D[]>(initial.pinDirections);
  const [activePin, setActivePin] = useState(0);
  const [dragPin, setDragPin] = useState<number | null>(null);
  const [stepAsset, setStepAsset] = useState<ModelAsset | null>(null);
  const [stepRotation, setStepRotation] = useState<StepDrawingRotation>({ x: 0, y: 0, z: 0 });
  const [outlineStrength, setOutlineStrength] = useState(draft.drawing ? draft.drawing.outlineStrength ?? 1 : 1.6);
  const [error, setError] = useState("");

  const currentSelection = selectionStart && selection
    ? normalizeRectangle({ x: selectionStart.x, y: selectionStart.y, width: selection.width - selectionStart.x, height: selection.height - selectionStart.y })
    : selection;
  const strokeWidth = Math.max(viewBox.width, viewBox.height) / 850;

  const resetImportedDrawing = (loaded: ParsedSource2D) => {
    const padded = padBounds(loaded.bounds, 0.035);
    setParsed(loaded);
    setViewBox(padded);
    setSelection(null);
    setSelectionStart(null);
    setCalibration([]);
    setMillimetersPerUnit(1);
    setPinPoints(Array.from({ length: draft.pins.length }, () => null));
    setPinDirections(defaultDirections(draft.pins.length));
    setActivePin(0);
    setMode("select");
  };

  const importDrawing = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    try {
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        setStepAsset(null);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const loaded = await parsePdfDrawing(bytes, file.name);
        pdfSourceRef.current = { bytes, name: file.name };
        resetImportedDrawing(loaded);
      } else if (isImageFile(file)) {
        setStepAsset(null);
        pdfSourceRef.current = null;
        resetImportedDrawing(await parseImageDrawing(file, file.name));
      } else if (isStepFile(file)) {
        pdfSourceRef.current = null;
        const asset = await importStepAsset(new Uint8Array(await file.arrayBuffer()), file.name);
        const rotation = { x: 0, y: 0, z: 0 };
        setStepAsset(asset);
        setStepRotation(rotation);
        resetImportedDrawing(projectStepDrawing(asset, rotation));
        setMode("rotate");
      } else {
        setStepAsset(null);
        pdfSourceRef.current = null;
        resetImportedDrawing(parseDxfDrawing(await file.text(), file.name));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const updateStepRotation = (axis: keyof StepDrawingRotation, value: number) => {
    if (!stepAsset || !Number.isFinite(value)) return;
    const rotation = { ...stepRotation, [axis]: value };
    setStepRotation(rotation);
    try {
      resetImportedDrawing(projectStepDrawing(stepAsset, rotation));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const showPdfPage = async (pageNumber: number) => {
    const source = pdfSourceRef.current;
    if (!source) return;
    setError("");
    try {
      resetImportedDrawing(await parsePdfDrawing(source.bytes, source.name, pageNumber));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const pasteClipboardImage = async () => {
    setError("");
    try {
      if (!navigator.clipboard?.read) throw new Error("클립보드 읽기를 지원하지 않습니다. ⌘/Ctrl+V를 사용하세요.");
      const items = await navigator.clipboard.read();
      const imageType = items.flatMap((item) => item.types).find((type) => type.startsWith("image/"));
      const item = items.find((candidate) => imageType && candidate.types.includes(imageType));
      if (!imageType || !item) throw new Error("클립보드에 이미지가 없습니다.");
      pdfSourceRef.current = null;
      resetImportedDrawing(await parseImageDrawing(await item.getType(imageType), "클립보드 이미지.png"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.items ?? [])
        .find((item) => item.type.startsWith("image/"))?.getAsFile();
      if (!file) return;
      event.preventDefault();
      pdfSourceRef.current = null;
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
    if (mode === "rotate" && stepAsset) {
      event.currentTarget.setPointerCapture(event.pointerId);
      stepDragRef.current = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        rotation: stepRotation,
        zOnly: event.shiftKey,
      };
      setSelection(null);
      setSelectionStart(null);
      setCalibration([]);
      setPinPoints(Array.from({ length: draft.pins.length }, () => null));
      setPinDirections(defaultDirections(draft.pins.length));
      setActivePin(0);
      return;
    }
    const point = toDrawingPoint(event.clientX, event.clientY);
    if (mode === "select") {
      event.currentTarget.setPointerCapture(event.pointerId);
      setSelectionStart(point);
      setSelection({ x: point.x, y: point.y, width: point.x, height: point.y });
    } else if (mode === "calibrate") {
      setCalibration((current) => current.length >= 2 ? [point] : [...current, point]);
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
      );
      try {
        const loaded = projectStepDrawing(stepAsset, rotation);
        setStepRotation(rotation);
        setParsed(loaded);
        setViewBox(padBounds(loaded.bounds, 0.035));
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

  const updateCalibration = () => {
    if (calibration.length !== 2 || !Number.isFinite(actualLengthMm) || actualLengthMm <= 0) {
      setError("기준선의 두 점과 실제 길이를 지정하세요.");
      return;
    }
    const sourceLength = Math.hypot(calibration[1].x - calibration[0].x, calibration[1].y - calibration[0].y);
    if (sourceLength <= 0) {
      setError("서로 다른 두 점을 지정하세요.");
      return;
    }
    setMillimetersPerUnit(actualLengthMm / sourceLength);
    setError("");
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
    if (pinPoints.some((point) => !point)) {
      setError("모든 핀 접속점을 배치하세요.");
      return;
    }
    try {
      const normalizedSelection = normalizeRectangle(selection);
      const drawing = isParsedRaster(parsed)
        ? await extractRasterPartDrawing(parsed, normalizedSelection, millimetersPerUnit)
        : extractPartDrawing(parsed, normalizedSelection, millimetersPerUnit);
      const pins = draft.pins.map((pin, index) => {
        const sourcePoint = pinPoints[index]!;
        const direction = pinDirections[index];
        return {
          ...pin,
          anchor: {
            xMm: (sourcePoint.x - normalizedSelection.x) * millimetersPerUnit,
            yMm: (sourcePoint.y - normalizedSelection.y) * millimetersPerUnit,
            directionX: direction.directionX,
            directionY: direction.directionY,
          },
        };
      });
      onApply({
        ...draft,
        pins,
        drawing: drawing.paths.length > 0 ? { ...drawing, outlineStrength } : drawing,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  return <div className="hd2-dialog-backdrop hd2-symbol-editor-backdrop">
    <section className="hd2-symbol-editor" role="dialog" aria-label="커넥터 2D 심벌 편집기">
      <header>
        <div><strong>커넥터 2D 심벌 편집기</strong><span>DXF·PDF·이미지 또는 STEP 투영에서 필요한 투상도와 핀 접속점을 지정합니다.</span></div>
        <button type="button" onClick={() => drawingInputRef.current?.click()}><FileUp size={14} />도면 / STEP 열기</button>
        <button type="button" onClick={() => void pasteClipboardImage()}><ClipboardPaste size={14} />클립보드 이미지</button>
        <input ref={drawingInputRef} className="hd2-symbol-file-input" type="file" accept=".dxf,.pdf,.png,.jpg,.jpeg,.webp,.step,.stp,application/pdf,image/png,image/jpeg,image/webp" onChange={(event) => void importDrawing(event.target.files?.[0])} />
        <button type="button" onClick={onClose}>닫기</button>
      </header>
      <div className="hd2-symbol-toolbar">
        {stepAsset && <button type="button" className={mode === "rotate" ? "is-selected" : ""} onClick={() => setMode("rotate")}><Rotate3D size={14} />마우스 회전</button>}
        <button type="button" className={mode === "select" ? "is-selected" : ""} onClick={() => setMode("select")}><MousePointer2 size={14} />영역 선택</button>
        <button type="button" className={mode === "calibrate" ? "is-selected" : ""} onClick={() => { setMode("calibrate"); setCalibration([]); }}><Ruler size={14} />기준 길이</button>
        <button type="button" className={mode === "pins" ? "is-selected" : ""} onClick={() => setMode("pins")}><Focus size={14} />핀 배치</button>
        <button type="button" onClick={autoPlacePins}>핀 자동 배치</button>
        <button type="button" onClick={() => parsed && setViewBox(padBounds(parsed.bounds, 0.035))}>전체 보기</button>
        {parsed && isParsedPdf(parsed) && <div className="hd2-symbol-pages"><button type="button" disabled={parsed.pageNumber <= 1} onClick={() => void showPdfPage(parsed.pageNumber - 1)} aria-label="이전 PDF 페이지"><ChevronLeft size={13} /></button><label><span>페이지</span><select aria-label="PDF 페이지" value={parsed.pageNumber} onChange={(event) => void showPdfPage(Number(event.target.value))}>{Array.from({ length: parsed.pageCount }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1} / {parsed.pageCount}</option>)}</select></label><button type="button" disabled={parsed.pageNumber >= parsed.pageCount} onClick={() => void showPdfPage(parsed.pageNumber + 1)} aria-label="다음 PDF 페이지"><ChevronRight size={13} /></button></div>}
        {stepAsset && <div className="hd2-symbol-step-rotation"><b>STEP 각도</b>{(["x", "y", "z"] as const).map((axis) => <label key={axis}><span>{axis.toUpperCase()}</span><input aria-label={`STEP ${axis.toUpperCase()} 회전`} type="number" step="5" value={stepRotation[axis]} onChange={(event) => updateStepRotation(axis, Number(event.target.value))} /><em>°</em></label>)}</div>}
        {parsed && parsed.paths.length > 0 && <label className="hd2-symbol-outline-strength"><span>선 강도</span><input aria-label="윤곽선 강도" type="range" min="0.5" max="4" step="0.1" value={outlineStrength} onChange={(event) => setOutlineStrength(Number(event.target.value))} /><b>{outlineStrength.toFixed(1)}×</b></label>}
        <span>{parsed ? isParsedPdf(parsed) ? `${parsed.sourceName} · PDF ${parsed.pageNumber}/${parsed.pageCount}페이지` : isParsedRaster(parsed) ? `${parsed.sourceName} · 이미지` : `${parsed.sourceName} · 형상 ${parsed.paths.length}개` : "도면 또는 STEP 파일을 불러오거나 이미지를 붙여넣으세요."}</span>
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
          >
            <rect className="hd2-symbol-background" x={viewBox.x} y={viewBox.y} width={viewBox.width} height={viewBox.height} />
            {isParsedRaster(parsed) && <image className="hd2-symbol-pdf-page" href={parsed.imageDataUrl} x={parsed.bounds.x} y={parsed.bounds.y} width={parsed.bounds.width} height={parsed.bounds.height} />}
            <g className={`hd2-symbol-source${stepAsset ? " is-step-source" : ""}`} style={{ strokeWidth: strokeWidth * outlineStrength }}>
              {parsed.paths.map((path, index) => <path key={index} d={drawingPathData(path)} />)}
            </g>
            {currentSelection && <rect className="hd2-symbol-selection" {...currentSelection} style={{ strokeWidth: strokeWidth * 1.5 }} />}
            {calibration.length > 0 && <g className="hd2-symbol-calibration" style={{ strokeWidth: strokeWidth * 1.8 }}>
              {calibration.length === 2 && <line x1={calibration[0].x} y1={calibration[0].y} x2={calibration[1].x} y2={calibration[1].y} />}
              {calibration.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={strokeWidth * 5} />)}
            </g>}
            {pinPoints.map((point, index) => point && <g key={index} className={`hd2-symbol-pin${activePin === index ? " is-active" : ""}`}>
              <line x1={point.x} y1={point.y} x2={point.x + pinDirections[index].directionX * strokeWidth * 18} y2={point.y + pinDirections[index].directionY * strokeWidth * 18} style={{ strokeWidth: strokeWidth * 2 }} />
              <circle cx={point.x} cy={point.y} r={strokeWidth * 6} onPointerDown={(event) => { event.stopPropagation(); setActivePin(index); setDragPin(index); svgRef.current?.setPointerCapture(event.pointerId); }} />
              <text x={point.x + strokeWidth * 8} y={point.y - strokeWidth * 8} style={{ fontSize: strokeWidth * 11 }}>{draft.pins[index].number}</text>
            </g>)}
          </svg> : <div className="hd2-symbol-empty"><FileUp size={40} /><strong>DXF, PDF, 이미지 또는 STEP 파일을 불러오세요.</strong><span>여러 장의 PDF는 페이지를 고르고, STEP은 마우스로 각도를 맞춘 뒤 필요한 영역을 선택할 수 있습니다.</span></div>}
          {stepAsset && mode === "rotate" && <div className="hd2-step-gesture-help"><Rotate3D size={14} /><span><b>드래그</b> X/Y 회전</span><span><b>Shift + 드래그</b> Z 회전</span></div>}
        </div>
        <aside>
          <section><h3>1. 투상도 영역</h3><p>필요한 커넥터 투상도를 사각형으로 감싸세요. 도면 테두리와 표는 영역 밖으로 제외합니다.</p>{selection && <dl><dt>원본 폭</dt><dd>{Math.abs(selection.width).toFixed(3)}</dd><dt>원본 높이</dt><dd>{Math.abs(selection.height).toFixed(3)}</dd></dl>}</section>
          <section><h3>2. 실제 치수 보정</h3><p>기준 길이 모드에서 실제 치수를 아는 두 점을 클릭하세요.</p><label><span>실제 길이</span><input type="number" min="0.001" step="0.001" value={actualLengthMm} onChange={(event) => setActualLengthMm(Number(event.target.value))} /><b>mm</b></label><button type="button" onClick={updateCalibration}>배율 적용</button><dl><dt>도면 단위</dt><dd>1 = {millimetersPerUnit.toFixed(6)} mm</dd></dl></section>
          <section><h3>3. 핀 접속점 · {pinPoints.filter(Boolean).length}/{draft.pins.length}</h3><p>핀 배치 모드에서 도면을 클릭하거나 핸들을 드래그하세요.</p><div className="hd2-symbol-pin-list">{draft.pins.map((pin, index) => <button type="button" key={index} className={activePin === index ? "is-selected" : ""} onClick={() => { setMode("pins"); setActivePin(index); }}><b>{pin.number}</b><span>{pin.name}</span><em>{pinPoints[index] ? "배치됨" : "미배치"}</em></button>)}</div><label><span>선 인출 방향</span><select value={directionName(pinDirections[activePin])} onChange={(event) => setPinDirections((current) => current.map((item, index) => index === activePin ? directionFromName(event.target.value) : item))}><option value="right">오른쪽</option><option value="left">왼쪽</option><option value="up">위쪽</option><option value="down">아래쪽</option></select></label></section>
          {parsed && parsed.unsupported.length > 0 && <section className="hd2-symbol-warning"><h3>제외·근사 형상</h3><p>묵시적으로 삭제하지 않고 결과에 기록합니다.</p><ul>{parsed.unsupported.map((item) => <li key={item.type}>{item.type} · {item.count}</li>)}</ul></section>}
        </aside>
      </div>
      {error && <div className="hd2-library-error">{error}</div>}
      <footer><button type="button" onClick={() => onApply({ ...draft, drawing: undefined, pins: draft.pins.map((pin) => ({ ...pin, anchor: undefined })) })}><Trash2 size={14} />등록 도면 제거</button><span>{selection ? `예상 크기 ${(Math.abs(selection.width) * millimetersPerUnit).toFixed(2)} × ${(Math.abs(selection.height) * millimetersPerUnit).toFixed(2)} mm` : "추출 영역을 선택하세요."}</span><button type="button" onClick={onClose}>취소</button><button type="button" className="is-primary" onClick={() => void apply()}>심벌 적용</button></footer>
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
): StepDrawingRotation {
  if (zOnly) return { ...initial, z: normalizeDegrees(initial.z + deltaX * degreesPerPixel) };
  return {
    x: normalizeDegrees(initial.x + deltaY * degreesPerPixel),
    y: normalizeDegrees(initial.y + deltaX * degreesPerPixel),
    z: initial.z,
  };
}

function normalizeDegrees(value: number) {
  return Math.round(((((value + 180) % 360) + 360) % 360 - 180) * 10) / 10;
}

function existingDrawingAsParsed(draft: LibraryPartDraft2D) {
  if (!draft.drawing) return {
    parsed: null,
    selection: null,
    viewBox: { x: 0, y: 0, width: 100, height: 100 },
    millimetersPerUnit: 1,
    pinPoints: Array.from({ length: draft.pins.length }, () => null as Point2D | null),
    pinDirections: defaultDirections(draft.pins.length),
  };
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
    millimetersPerUnit: 1,
    pinPoints: draft.pins.map((pin) => pin.anchor ? { x: pin.anchor.xMm, y: pin.anchor.yMm } : null),
    pinDirections: draft.pins.map((pin) => pin.anchor ?? directionFromName("right")),
  };
}

function isParsedRaster(parsed: ParsedSource2D): parsed is ParsedRaster2D {
  return "imageDataUrl" in parsed;
}

function isParsedPdf(parsed: ParsedSource2D): parsed is ParsedRaster2D & { sourceType: "pdf" } {
  return isParsedRaster(parsed) && parsed.sourceType === "pdf";
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
