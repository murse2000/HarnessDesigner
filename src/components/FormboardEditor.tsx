import { ExternalLink, Focus, Magnet, MapPin, Minus, Plus, RotateCcw, Trash2, TriangleAlert, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { buildFormboardLayout, createFormboardState, fitFormboardSegmentRoute, formboardCableGeometry, formboardFanoutPoints, formboardNodeRouteAngle, formboardSegmentMetrics, formboardSegmentPoints, type FormboardLayout } from "../domain/formboard";
import { resolveFormboardSymbol, resolveFormboardSymbolRouteRotation } from "../domain/formboardSymbol";
import { hasMappedPinPositions } from "../domain/parts";
import type { FormboardFixtureKind, FormboardLayoutState, HarnessAssembly, ModelAsset, Point, ProjectDocument, SymbolAsset } from "../domain/types";
import { getWireColorOption } from "../domain/wireColors";
import { backendInvoke, isTauri } from "../platform";
import { useProjectStore } from "../store/projectStore";
import { hydrateLibraryModelAsset } from "../three/modelAssetHydration";
import { getCableRenderSpec } from "../three/cableRendering";
import { openDetachedView } from "../windowing";
import { FormboardPartSymbol } from "./FormboardPartSymbol";

type FormboardSelection =
  | { kind: "node"; id: string }
  | { kind: "segment"; id: string }
  | { kind: "routePoint"; segmentId: string; index: number }
  | { kind: "fixture"; id: string }
  | null;

type FormboardDrag =
  | { kind: "node"; id: string }
  | { kind: "routePoint"; segmentId: string; index: number }
  | { kind: "fixture"; id: string };

function roundedPoint(point: Point): Point {
  return { x: Math.round(point.x * 10) / 10, y: Math.round(point.y * 10) / 10 };
}

function rotatedSize(width: number, height: number, rotationDeg: number) {
  const radians = rotationDeg * Math.PI / 180;
  return {
    width: Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians)),
    height: Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians)),
  };
}

function pathMidpoint(points: Point[]) {
  if (!points.length) return { x: 0, y: 0 };
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
  const target = lengths.reduce((sum, length) => sum + length, 0) / 2;
  let travelled = 0;
  for (let index = 0; index < lengths.length; index += 1) {
    if (travelled + lengths[index] >= target) {
      const ratio = lengths[index] ? (target - travelled) / lengths[index] : 0;
      return { x: points[index].x + (points[index + 1].x - points[index].x) * ratio, y: points[index].y + (points[index + 1].y - points[index].y) * ratio };
    }
    travelled += lengths[index];
  }
  return points.at(-1)!;
}

function formboardColor(value: string) {
  return value.startsWith("#") ? value : getWireColorOption(value)?.hex ?? "#26323d";
}

function pointList(points: Point[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function closestInsertionIndex(points: Point[], point: Point) {
  let closest = 0;
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const ratio = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / (dx * dx + dy * dy || 1)));
    const projected = { x: from.x + dx * ratio, y: from.y + dy * ratio };
    const nextDistance = Math.hypot(point.x - projected.x, point.y - projected.y);
    if (nextDistance < distance) { closest = index; distance = nextDistance; }
  }
  return closest;
}

function ensureFormboard(harness: HarnessAssembly): FormboardLayoutState {
  const automatic = createFormboardState(harness);
  harness.formboard ??= automatic;
  for (const [nodeId, position] of Object.entries(automatic.nodePositions)) {
    harness.formboard.nodePositions[nodeId] ??= position;
  }
  return harness.formboard;
}

export function FormboardEditor({ harnessId }: { harnessId?: string } = {}) {
  const { snapshot, activeHarnessId, updateProject } = useProjectStore();
  const harness = snapshot?.project.harnesses.find((item) => item.id === (harnessId ?? activeHarnessId));
  const svgRef = useRef<SVGSVGElement>(null);
  const initializing = useRef<string | null>(null);
  const dragRef = useRef<FormboardDrag | null>(null);
  const [dragPoint, setDragPoint] = useState<Point | null>(null);
  const [selection, setSelection] = useState<FormboardSelection>(null);
  const [fixtureMode, setFixtureMode] = useState<FormboardFixtureKind | null>(null);
  const [librarySymbols, setLibrarySymbols] = useState<SymbolAsset[]>([]);
  const [libraryModels, setLibraryModels] = useState<ModelAsset[]>([]);
  const [zoom, setZoom] = useState(4);
  const changeZoom = (nextZoom: number) => setZoom(Math.max(0.25, Math.min(16, nextZoom)));

  const symbolIds = snapshot?.project.parts.flatMap((part) => part.symbolAssetId ? [part.symbolAssetId] : []).filter((id) => !snapshot.project.assets.some((asset) => asset.id === id)) ?? [];
  const modelIds = snapshot?.project.parts.flatMap((part) => part.modelAssetId ? [part.modelAssetId] : []).filter((id) => !snapshot.project.modelAssets.some((asset) => asset.id === id)) ?? [];

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    void Promise.all([...new Set(symbolIds)].map((assetId) => backendInvoke<SymbolAsset | null>("get_library_symbol_asset", { assetId }).catch(() => null)))
      .then((assets) => { if (!cancelled) setLibrarySymbols(assets.filter((asset): asset is SymbolAsset => Boolean(asset))); });
    void Promise.all([...new Set(modelIds)].map((assetId) => backendInvoke<ModelAsset | null>("get_library_model_asset", { assetId }).then((asset) => asset ? hydrateLibraryModelAsset(asset) : null).catch(() => null)))
      .then((assets) => { if (!cancelled) setLibraryModels(assets.filter((asset): asset is ModelAsset => Boolean(asset))); });
    return () => { cancelled = true; };
  }, [modelIds.join("|"), symbolIds.join("|")]);

  useEffect(() => {
    if (!harness || harness.formboard || harness.releaseStatus === "released" || initializing.current === harness.id) return;
    initializing.current = harness.id;
    void updateProject((project) => {
      const target = project.harnesses.find((item) => item.id === harness.id);
      if (target && !target.formboard) target.formboard = createFormboardState(target);
    }).finally(() => { initializing.current = null; });
  }, [harness, updateProject]);

  const baseLayout = useMemo(() => harness ? buildFormboardLayout(harness) : null, [harness]);
  const layout = useMemo<FormboardLayout | null>(() => {
    const drag = dragRef.current;
    if (!baseLayout || !drag || !dragPoint) return baseLayout;
    if (drag.kind === "node") return { ...baseLayout, nodes: { ...baseLayout.nodes, [drag.id]: dragPoint } };
    if (drag.kind === "fixture") return { ...baseLayout, fixtures: baseLayout.fixtures.map((fixture) => fixture.id === drag.id ? { ...fixture, position: dragPoint } : fixture) };
    const routes = { ...baseLayout.routes, [drag.segmentId]: [...(baseLayout.routes[drag.segmentId] ?? [])] };
    routes[drag.segmentId][drag.index] = dragPoint;
    return { ...baseLayout, routes };
  }, [baseLayout, dragPoint]);
  const metrics = useMemo(() => harness && layout ? formboardSegmentMetrics(harness, layout) : [], [harness, layout]);
  const formboardSymbols = useMemo(() => {
    if (!snapshot || !harness) return new Map<string, ReturnType<typeof resolveFormboardSymbol>>();
    const parts = new Map(snapshot.project.parts.map((part) => [part.id, part]));
    const project = {
      assets: [...snapshot.project.assets, ...librarySymbols],
      modelAssets: [...snapshot.project.modelAssets, ...libraryModels],
    };
    return new Map(harness.nodes.map((node) => [node.id, resolveFormboardSymbol(project, parts.get(node.partId ?? ""))]));
  }, [harness, libraryModels, librarySymbols, snapshot]);

  if (!snapshot || !harness || !layout || !baseLayout) return <div className="formboard-empty">하네스를 선택하세요.</div>;
  const released = harness.releaseStatus === "released";
  const padding = 70;
  const partById = new Map(snapshot.project.parts.map((part) => [part.id, part]));
  const visualBounds = { ...baseLayout.bounds };
  for (const node of harness.nodes) {
    const point = baseLayout.nodes[node.id];
    const part = partById.get(node.partId ?? "");
    const symbol = formboardSymbols.get(node.id);
    const viewBox = symbol?.viewBox.split(/\s+/).map(Number);
    if (!point || !viewBox || viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2] <= 0 || viewBox[3] <= 0) continue;
    const routeRotation = node.kind === "connector" ? formboardNodeRouteAngle(harness, baseLayout, node.id) ?? 0 : 0;
    const size = rotatedSize(viewBox[2], viewBox[3], resolveFormboardSymbolRouteRotation(symbol, part, routeRotation));
    visualBounds.minX = Math.min(visualBounds.minX, point.x - size.width / 2);
    visualBounds.maxX = Math.max(visualBounds.maxX, point.x + size.width / 2);
    visualBounds.minY = Math.min(visualBounds.minY, point.y - size.height / 2);
    visualBounds.maxY = Math.max(visualBounds.maxY, point.y + size.height / 2);
  }
  const board = {
    x: visualBounds.minX - padding,
    y: visualBounds.minY - padding,
    width: Math.max(400, visualBounds.maxX - visualBounds.minX + padding * 2),
    height: Math.max(280, visualBounds.maxY - visualBounds.minY + padding * 2),
  };
  const invalidCount = metrics.filter((metric) => !metric.valid || !metric.bendClearanceValid).length;

  const updateFormboard = (mutator: (project: ProjectDocument, target: HarnessAssembly, formboard: FormboardLayoutState) => void) => updateProject((project) => {
    const target = project.harnesses.find((item) => item.id === harness.id);
    if (!target) return;
    mutator(project, target, ensureFormboard(target));
  });
  const pointFromEvent = (event: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM()?.inverse();
    return matrix ? roundedPoint(point.matrixTransform(matrix)) : null;
  };
  const beginDrag = (event: ReactPointerEvent<SVGElement>, drag: FormboardDrag, point: Point) => {
    if (released) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = drag;
    setDragPoint(point);
    setSelection(drag.kind === "node" ? { kind: "node", id: drag.id } : drag.kind === "fixture" ? { kind: "fixture", id: drag.id } : { kind: "routePoint", segmentId: drag.segmentId, index: drag.index });
  };
  const moveDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    const point = pointFromEvent(event);
    if (point) setDragPoint(point);
  };
  const finishDrag = (event?: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    const point = event ? pointFromEvent(event) ?? dragPoint : dragPoint;
    dragRef.current = null;
    setDragPoint(null);
    if (!drag || !point) return;
    void updateFormboard((_project, target, formboard) => {
      if (drag.kind === "node") {
        formboard.nodePositions[drag.id] = point;
        for (const segment of target.segments.filter((item) => item.fromNodeId === drag.id || item.toNodeId === drag.id)) {
          const from = formboard.nodePositions[segment.fromNodeId];
          const to = formboard.nodePositions[segment.toNodeId];
          if (!from || !to) continue;
          const route = fitFormboardSegmentRoute(from, to, segment.lengthMm);
          if (route) formboard.segmentRoutes[segment.id] = route;
        }
      } else if (drag.kind === "fixture") {
        const fixture = formboard.fixtures.find((item) => item.id === drag.id);
        if (fixture) fixture.position = point;
      } else {
        const route = [...(formboard.segmentRoutes[drag.segmentId] ?? [])];
        route[drag.index] = point;
        formboard.segmentRoutes[drag.segmentId] = route;
      }
    });
  };
  const fitSegment = (segmentId: string) => void updateFormboard((_project, target, formboard) => {
    const segment = target.segments.find((item) => item.id === segmentId);
    if (!segment) return;
    const route = fitFormboardSegmentRoute(formboard.nodePositions[segment.fromNodeId], formboard.nodePositions[segment.toNodeId], segment.lengthMm);
    if (route) formboard.segmentRoutes[segment.id] = route;
  });
  const fitAllSegments = () => void updateFormboard((_project, target, formboard) => {
    for (const segment of target.segments) {
      const route = fitFormboardSegmentRoute(formboard.nodePositions[segment.fromNodeId], formboard.nodePositions[segment.toNodeId], segment.lengthMm);
      if (route) formboard.segmentRoutes[segment.id] = route;
    }
  });
  const resetLayout = () => {
    if (!window.confirm("폼보드의 수동 배치와 치공구를 초기화하고 회로도에서 다시 생성하시겠습니까?")) return;
    void updateFormboard((_project, target) => { target.formboard = createFormboardState(target); });
  };
  const addRoutePoint = (event: ReactMouseEvent<SVGPolylineElement>, segmentId: string) => {
    if (released) return;
    event.preventDefault();
    event.stopPropagation();
    const point = pointFromEvent(event);
    const segment = harness.segments.find((item) => item.id === segmentId);
    if (!point || !segment) return;
    const points = formboardSegmentPoints(layout, segment);
    const index = closestInsertionIndex(points, point);
    void updateFormboard((_project, _target, formboard) => {
      const route = [...(formboard.segmentRoutes[segmentId] ?? [])];
      route.splice(index, 0, point);
      formboard.segmentRoutes[segmentId] = route;
    });
  };
  const addFixture = (event: ReactPointerEvent<SVGRectElement>) => {
    if (!fixtureMode || released) { setSelection(null); return; }
    const point = pointFromEvent(event);
    if (!point) return;
    void updateFormboard((_project, _target, formboard) => {
      const sequence = formboard.fixtures.filter((fixture) => fixture.kind === fixtureMode).length + 1;
      formboard.fixtures.push({ id: crypto.randomUUID(), kind: fixtureMode, position: point, label: `${fixtureMode === "peg" ? "PEG" : "CLAMP"}-${sequence}` });
    });
  };
  const deleteSelection = () => {
    if (!selection || released || selection.kind === "node" || selection.kind === "segment") return;
    void updateFormboard((_project, _target, formboard) => {
      if (selection.kind === "fixture") formboard.fixtures = formboard.fixtures.filter((fixture) => fixture.id !== selection.id);
      else {
        const route = [...(formboard.segmentRoutes[selection.segmentId] ?? [])];
        route.splice(selection.index, 1);
        formboard.segmentRoutes[selection.segmentId] = route;
      }
    });
    setSelection(null);
  };

  return <div className="formboard-editor" tabIndex={0} onKeyDown={(event) => { if (event.key === "Delete" || event.key === "Backspace") deleteSelection(); }}>
    <header className="formboard-toolbar">
      <strong>폼보드 · 1:1 · mm</strong><span>{harness.number} · {harness.name}</span>
      <button onClick={resetLayout} disabled={released}><RotateCcw size={12} />회로도에서 재생성</button>
      <button onClick={fitAllSegments} disabled={released}><WandSparkles size={12} />전체 길이 맞춤</button>
      <button className={fixtureMode === "peg" ? "is-active" : ""} onClick={() => setFixtureMode((current) => current === "peg" ? null : "peg")} disabled={released}><MapPin size={12} />페그</button>
      <button className={fixtureMode === "clamp" ? "is-active" : ""} onClick={() => setFixtureMode((current) => current === "clamp" ? null : "clamp")} disabled={released}><Magnet size={12} />클램프</button>
      <button onClick={deleteSelection} disabled={released || !selection || selection.kind === "node" || selection.kind === "segment"}><Trash2 size={12} />삭제</button>
      <label>
        <span>화면 배율</span>
        <button type="button" title="축소" onClick={() => changeZoom(zoom / 1.25)}><Minus size={11} /></button>
        <input type="range" min="0.25" max="16" step="0.25" value={zoom} onChange={(event) => changeZoom(Number(event.target.value))} />
        <button type="button" title="확대" onClick={() => changeZoom(zoom * 1.25)}><Plus size={11} /></button>
        <b>{Math.round(zoom * 100)}%</b>
      </label>
      <button title="새 창에서 열기" onClick={() => void openDetachedView(snapshot.sessionId, "formboard", { harnessId: harness.id })}><ExternalLink size={12} /></button>
    </header>
    <div className="formboard-body">
      <div className={`formboard-canvas ${fixtureMode ? "is-fixture-mode" : ""}`}>
        <svg ref={svgRef} width={board.width * zoom} height={board.height * zoom} viewBox={`${board.x} ${board.y} ${board.width} ${board.height}`} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={() => finishDrag()}>
          <defs><pattern id="formboard-grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M 25 0 L 0 0 0 25" /></pattern></defs>
          <rect className="formboard-paper" x={board.x} y={board.y} width={board.width} height={board.height} onPointerDown={addFixture} />
          <rect className="formboard-grid" x={board.x} y={board.y} width={board.width} height={board.height} />
          {harness.segments.map((segment) => {
            const points = formboardSegmentPoints(layout, segment);
            const metric = metrics.find((item) => item.segmentId === segment.id);
            const midpoint = pathMidpoint(points);
            const pointText = pointList(points);
            const coverings = [segment.sleevePartId, segment.shieldPartId, segment.tapePartId].flatMap((partId) => partId ? [partById.get(partId)?.partNumber].filter(Boolean) : []).join(" · ");
            const cablePart = partById.get(segment.cablePartId ?? "");
            const cableSpec = getCableRenderSpec(cablePart);
            const cableGeometry = cableSpec ? formboardCableGeometry(
              points,
              segment.drawingRoute?.sourceBreakoutLength ?? cableSpec.breakoutLengthMm,
              segment.drawingRoute?.targetBreakoutLength ?? cableSpec.breakoutLengthMm,
            ) : null;
            const cableCores = cableGeometry ? harness.conductors.filter((conductor) => conductor.cableRunId === segment.id) : [];
            return <g key={segment.id} className={`formboard-segment ${selection?.kind === "segment" && selection.id === segment.id ? "is-selected" : ""} ${metric?.valid ? "" : "is-error"}`}>
              {cableGeometry && cableSpec ? <>
                {cableCores.flatMap((conductor, index) => {
                  const offset = (index - (cableCores.length - 1) / 2) * (cableSpec.coreDiameterMm + 0.8);
                  const source = pointList(formboardFanoutPoints(cableGeometry.sourceFanoutPoints, offset, "source"));
                  const target = pointList(formboardFanoutPoints(cableGeometry.targetFanoutPoints, offset, "target"));
                  const color = formboardColor(conductor.color);
                  return [
                    <polyline key={`${conductor.id}-source-outline`} className="formboard-core-outline" points={source} style={{ strokeWidth: cableSpec.coreDiameterMm + 0.8 }} />,
                    <polyline key={`${conductor.id}-source`} className="formboard-core" points={source} style={{ stroke: color, strokeWidth: cableSpec.coreDiameterMm }} />,
                    <polyline key={`${conductor.id}-target-outline`} className="formboard-core-outline" points={target} style={{ strokeWidth: cableSpec.coreDiameterMm + 0.8 }} />,
                    <polyline key={`${conductor.id}-target`} className="formboard-core" points={target} style={{ stroke: color, strokeWidth: cableSpec.coreDiameterMm }} />,
                  ];
                })}
                <polyline className="formboard-cable-jacket" points={pointList(cableGeometry.jacketPoints)} style={{ stroke: formboardColor(cableSpec.jacketColor), strokeWidth: cableSpec.outerDiameterMm }} onPointerDown={(event) => { event.stopPropagation(); setSelection({ kind: "segment", id: segment.id }); }} onDoubleClick={(event) => addRoutePoint(event, segment.id)} />
                {metric && !metric.valid && <polyline className="formboard-cable-error" points={pointText} />}
              </> : <polyline points={pointText} onPointerDown={(event) => { event.stopPropagation(); setSelection({ kind: "segment", id: segment.id }); }} onDoubleClick={(event) => addRoutePoint(event, segment.id)} />}
              <text x={midpoint.x} y={midpoint.y - 8} textAnchor="middle">{segment.label} · {segment.lengthMm} mm</text>
              {coverings && <text className="covering" x={midpoint.x} y={midpoint.y + 10} textAnchor="middle">{coverings}</text>}
              {segment.startHeatShrinkPartId && <text className="manufacturing-marker" x={points[0]?.x ?? 0} y={(points[0]?.y ?? 0) - 13}>START HS · {partById.get(segment.startHeatShrinkPartId)?.partNumber}</text>}
              {segment.endHeatShrinkPartId && <text className="manufacturing-marker" x={points.at(-1)?.x ?? 0} y={(points.at(-1)?.y ?? 0) - 13} textAnchor="end">END HS · {partById.get(segment.endHeatShrinkPartId)?.partNumber}</text>}
              {(layout.routes[segment.id] ?? []).map((point, index) => <circle key={`${segment.id}-${index}`} className={`formboard-route-point ${selection?.kind === "routePoint" && selection.segmentId === segment.id && selection.index === index ? "is-selected" : ""}`} cx={point.x} cy={point.y} r="5" onPointerDown={(event) => beginDrag(event, { kind: "routePoint", segmentId: segment.id, index }, point)} />)}
            </g>;
          })}
          {harness.nodes.map((node) => {
            const point = layout.nodes[node.id];
            const part = partById.get(node.partId ?? "");
            const symbol = formboardSymbols.get(node.id);
            const [viewX, viewY, viewWidth, viewHeight] = symbol?.viewBox.split(/\s+/).map(Number) ?? [0, 0, 0, 0];
            const routeRotation = node.kind === "connector" ? formboardNodeRouteAngle(harness, layout, node.id) ?? 0 : 0;
            const symbolRotation = resolveFormboardSymbolRouteRotation(symbol, part, routeRotation);
            const displaySize = rotatedSize(viewWidth, viewHeight, symbolRotation);
            return <g key={node.id} className={`formboard-node ${selection?.kind === "node" && selection.id === node.id ? "is-selected" : ""}`} transform={`translate(${point.x} ${point.y})`} onPointerDown={(event) => beginDrag(event, { kind: "node", id: node.id }, point)}>
              {node.kind === "connector" && symbol ? <>
                <g transform={symbolRotation ? `rotate(${symbolRotation})` : undefined}>
                  <FormboardPartSymbol symbol={symbol} />
                  {hasMappedPinPositions(part) && node.pins.map((pin) => <circle key={pin.id} className="formboard-pin" cx={pin.position.x - viewX - viewWidth / 2} cy={pin.position.y - viewY - viewHeight / 2} r="0.7" />)}
                </g>
              </> : node.kind === "connector" ? <rect x="-18" y="-11" width="36" height="22" rx="2" /> : <circle r="10" />}
              <text y={symbol ? -displaySize.height / 2 - 7 : -17} textAnchor="middle">{node.reference}</text><text className="node-label" y={symbol ? displaySize.height / 2 + 11 : 22} textAnchor="middle">{node.label}</text>
            </g>;
          })}
          {harness.accessories.flatMap((accessory) => {
            const accessorySegment = accessory.segmentId ? harness.segments.find((segment) => segment.id === accessory.segmentId) : undefined;
            const point = accessory.nodeId ? layout.nodes[accessory.nodeId] : accessorySegment ? pathMidpoint(formboardSegmentPoints(layout, accessorySegment)) : null;
            const part = partById.get(accessory.partId);
            return point && part ? [<g key={accessory.id} className="formboard-accessory" transform={`translate(${point.x} ${point.y + 28})`}><rect x="-22" y="-7" width="44" height="14" rx="2" /><text textAnchor="middle" y="3">{part.partNumber} × {accessory.quantity}</text></g>] : [];
          })}
          {layout.fixtures.map((fixture) => <g key={fixture.id} className={`formboard-fixture formboard-fixture--${fixture.kind} ${selection?.kind === "fixture" && selection.id === fixture.id ? "is-selected" : ""}`} transform={`translate(${fixture.position.x} ${fixture.position.y})`} onPointerDown={(event) => beginDrag(event, { kind: "fixture", id: fixture.id }, fixture.position)}>
            {fixture.kind === "peg" ? <><circle r="5" /><path d="M -8 0 H 8 M 0 -8 V 8" /></> : <rect x="-9" y="-6" width="18" height="12" rx="2" />}
            <text y="-10" textAnchor="middle">{fixture.label}</text>
          </g>)}
        </svg>
      </div>
      <aside className="formboard-inspector">
        <header><Focus size={13} /><strong>제조 검증</strong><span className={invalidCount ? "is-error" : "is-ok"}>{invalidCount ? `${invalidCount}개 확인 필요` : "길이 일치"}</span></header>
        <p>커넥터와 분기점을 드래그하면 인접 경로가 제조 길이에 맞게 자동 보정됩니다. 경로를 더블클릭하면 제어점이 추가됩니다.</p>
        <div className="formboard-metrics">
          {metrics.map((metric) => {
            const segment = harness.segments.find((item) => item.id === metric.segmentId)!;
            return <button key={metric.segmentId} className={metric.valid && metric.bendClearanceValid ? "is-valid" : "is-invalid"} onClick={() => setSelection({ kind: "segment", id: metric.segmentId })}>
              <span>{metric.valid && metric.bendClearanceValid ? <Focus size={11} /> : <TriangleAlert size={11} />}<strong>{segment.label}</strong></span>
              <code>{metric.drawingLengthMm.toFixed(1)} / {metric.targetLengthMm.toFixed(1)} mm</code>
              {!metric.valid && <em>오차 {metric.errorMm > 0 ? "+" : ""}{metric.errorMm.toFixed(1)} mm</em>}
              {!metric.bendClearanceValid && <em>굽힘점 주변 직선 여유 부족</em>}
              {(!metric.valid || !metric.bendClearanceValid) && <small onClick={(event) => { event.stopPropagation(); fitSegment(metric.segmentId); }}>길이 맞춤</small>}
            </button>;
          })}
        </div>
        <section><strong>치공구</strong><span>페그 {layout.fixtures.filter((fixture) => fixture.kind === "peg").length}</span><span>클램프 {layout.fixtures.filter((fixture) => fixture.kind === "clamp").length}</span></section>
      </aside>
    </div>
  </div>;
}
