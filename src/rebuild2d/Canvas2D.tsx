import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import { cableRunGeometry, connectorBounds, connectorHeight, connectorSize, CONNECTOR_HEADER_HEIGHT, CONNECTOR_INFO_HEIGHT, CONNECTOR_WIDTH, defaultRoutePoint, endpointPosition, orthogonalPath, pinPosition, PIN_ROW_HEIGHT, routedPath, routedPointAtRatio, routedRatioAtPoint, routedSlicePath, sampleRoutedPath } from "./geometry";
import { drawingPathData, partDrawingStrokeWidth } from "./dxfSymbol";
import type { CableHeatShrink2D, CableRunBreakout2D, ComponentPlacement2D, Connector2D, DrawingAnnotation2D, DrawingTitleBlock2D, Harness2D, PinEndpoint2D, Point2D, Project2D, ProjectDocumentIndexEntry2D } from "./model";
import type { Settings2D } from "./settings";
import { splitWireColor, wireColorValue } from "./wireColor";

export type CanvasSelection = {
  componentIds: string[];
  connectionIds: string[];
  cableRunIds: string[];
};

type Props = {
  harness: Harness2D;
  projectNumber: string;
  projectName: string;
  documentIndex?: ProjectDocumentIndexEntry2D[];
  settings: Settings2D;
  selection: CanvasSelection;
  selectedLabel: SelectedConnectorLabel | null;
  selectedAnnotationId: string | null;
  selectedHeatShrinkId: string | null;
  onSelectionChange: (selection: CanvasSelection) => void;
  onSelectComponentLabel: (selection: SelectedConnectorLabel) => void;
  onSelectAnnotation: (annotationId: string | null) => void;
  onSelectHeatShrink: (heatShrinkId: string | null) => void;
  onMoveSelection: (selection: CanvasSelection, delta: Point2D) => void;
  onMoveConnectionRoute: (connectionId: string, point: Point2D) => void;
  onMoveCableRunRoute: (cableRunId: string, point: Point2D) => void;
  onMoveCableRunBreakout: (cableRunId: string, end: keyof CableRunBreakout2D, point: Point2D) => void;
  onMoveCableRunLabel: (cableRunId: string, offset: Point2D) => void;
  onMoveComponentLabel: (componentId: string, label: ConnectorLabelKind, offset: Point2D) => void;
  onMoveComponentPinMap: (componentId: string, offset: Point2D) => void;
  onResizeComponent: (componentId: string, displayScale: number) => void;
  onRenameConnection: (connectionId: string, reference: string) => void;
  onUpdateProjectMetadata: (changes: Partial<Pick<Project2D, "projectNumber" | "name">>) => void;
  onUpdateHarnessMetadata: (changes: Partial<Pick<Harness2D, "partNumber" | "name" | "revision">>) => void;
  onUpdateIndexedSheet?: (sheetId: string, changes: Partial<Pick<Harness2D, "partNumber" | "name" | "revision">>) => void;
  onUpdateTitleBlock: (changes: Partial<DrawingTitleBlock2D>) => void;
  onUpdateAnnotation: (annotationId: string, changes: Partial<Omit<DrawingAnnotation2D, "id" | "kind">>) => void;
  onUpdateHeatShrink: (heatShrinkId: string, changes: Partial<Pick<CableHeatShrink2D, "text" | "startRatio" | "endRatio">>) => void;
  onConnect: (from: PinEndpoint2D, to: PinEndpoint2D) => void;
  onMousePositionChange: (point: Point2D | null) => void;
};

type Viewport = {
  zoom: number;
  pan: Point2D;
};

type ComponentDrag = {
  selection: CanvasSelection;
  pointerStart: Point2D;
  delta: Point2D;
  pointerId: number;
};

type PanDrag = {
  pointerStart: Point2D;
  panStart: Point2D;
};

type DraftConnection = {
  from: PinEndpoint2D;
  pointer: Point2D;
};

type RouteDrag = {
  kind: "connection" | "cableRun";
  id: string;
  pointerId: number;
};

type CableRunBreakoutDrag = {
  cableRunId: string;
  end: keyof CableRunBreakout2D;
  pointerId: number;
};

export type ConnectorLabelKind = "referenceLabel" | "nameLabel";

export type SelectedConnectorLabel = {
  componentId: string;
  label: ConnectorLabelKind;
};

type LabelDrag = {
  componentId: string;
  label: ConnectorLabelKind;
  pointerStart: Point2D;
  offsetStart: Point2D;
  pointerId: number;
};

type PinMapDrag = {
  componentId: string;
  pointerStart: Point2D;
  offsetStart: Point2D;
  pointerId: number;
};

type CableLabelDrag = {
  cableRunId: string;
  pointerStart: Point2D;
  offsetStart: Point2D;
  pointerId: number;
};

type MarqueeDrag = {
  start: Point2D;
  current: Point2D;
  pointerId: number;
  additive: boolean;
};

type AnnotationDrag = {
  annotationId: string;
  mode: "move" | "resize" | "rotate";
  pointerStart: Point2D;
  original: DrawingAnnotation2D;
  pointerId: number;
  center?: Point2D;
  startAngle?: number;
};

type ComponentScaleDrag = {
  componentId: string;
  pointerId: number;
  center: Point2D;
  startDistance: number;
  startScale: number;
};

type HeatShrinkDrag = {
  heatShrink: CableHeatShrink2D;
  mode: "move" | "start" | "end";
  pointerStartRatio: number;
  pointerId: number;
};

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const moveFreeEndpointPreview = (endpoint: PinEndpoint2D, delta: Point2D): PinEndpoint2D => endpoint.freeEnd ? {
  ...endpoint,
  freeEnd: {
    ...endpoint.freeEnd,
    position: {
      x: endpoint.freeEnd.position.x + delta.x,
      y: endpoint.freeEnd.position.y + delta.y,
    },
  },
} : endpoint;

export function Canvas2D({ harness, projectNumber, projectName, documentIndex = [], settings, selection, selectedLabel, selectedAnnotationId, selectedHeatShrinkId, onSelectionChange, onSelectComponentLabel, onSelectAnnotation, onSelectHeatShrink, onMoveSelection, onMoveConnectionRoute, onMoveCableRunRoute, onMoveCableRunBreakout, onMoveCableRunLabel, onMoveComponentLabel, onMoveComponentPinMap, onResizeComponent, onRenameConnection, onUpdateProjectMetadata, onUpdateHarnessMetadata, onUpdateIndexedSheet = () => undefined, onUpdateTitleBlock, onUpdateAnnotation, onUpdateHeatShrink, onConnect, onMousePositionChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewport, setViewport] = useState<Viewport>({ zoom: 1, pan: { x: 40, y: 40 } });
  const [componentDrag, setComponentDrag] = useState<ComponentDrag | null>(null);
  const [panDrag, setPanDrag] = useState<PanDrag | null>(null);
  const [previewPositions, setPreviewPositions] = useState<Record<string, Point2D>>({});
  const [previewConnectionRoutes, setPreviewConnectionRoutes] = useState<Record<string, Point2D>>({});
  const [previewCableRunRoutes, setPreviewCableRunRoutes] = useState<Record<string, Point2D>>({});
  const [draftConnection, setDraftConnection] = useState<DraftConnection | null>(null);
  const [routeDrag, setRouteDrag] = useState<RouteDrag | null>(null);
  const [previewRoutePoint, setPreviewRoutePoint] = useState<Point2D | null>(null);
  const [cableRunBreakoutDrag, setCableRunBreakoutDrag] = useState<CableRunBreakoutDrag | null>(null);
  const [previewCableRunBreakoutPoint, setPreviewCableRunBreakoutPoint] = useState<Point2D | null>(null);
  const [labelDrag, setLabelDrag] = useState<LabelDrag | null>(null);
  const [previewLabelOffsets, setPreviewLabelOffsets] = useState<Record<string, Partial<Record<ConnectorLabelKind, Point2D>>>>({});
  const [pinMapDrag, setPinMapDrag] = useState<PinMapDrag | null>(null);
  const [previewPinMapOffsets, setPreviewPinMapOffsets] = useState<Record<string, Point2D>>({});
  const [cableLabelDrag, setCableLabelDrag] = useState<CableLabelDrag | null>(null);
  const [previewCableLabelOffsets, setPreviewCableLabelOffsets] = useState<Record<string, Point2D>>({});
  const [selectedPinMapComponentId, setSelectedPinMapComponentId] = useState<string | null>(null);
  const [marqueeDrag, setMarqueeDrag] = useState<MarqueeDrag | null>(null);
  const [annotationDrag, setAnnotationDrag] = useState<AnnotationDrag | null>(null);
  const [previewAnnotation, setPreviewAnnotation] = useState<DrawingAnnotation2D | null>(null);
  const [componentScaleDrag, setComponentScaleDrag] = useState<ComponentScaleDrag | null>(null);
  const [previewComponentScales, setPreviewComponentScales] = useState<Record<string, number>>({});
  const [heatShrinkDrag, setHeatShrinkDrag] = useState<HeatShrinkDrag | null>(null);
  const [previewHeatShrink, setPreviewHeatShrink] = useState<CableHeatShrink2D | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const snap = (value: number) => settings.gridSnap ? Math.round(value / settings.gridSize) * settings.gridSize : value;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && !isEditingElement(event.target)) {
        event.preventDefault();
        setSpacePressed(true);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpacePressed(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    const canvas = svgRef.current;
    if (!canvas) return;
    const measure = () => {
      const bounds = canvas.getBoundingClientRect();
      setCanvasSize({ width: bounds.width, height: bounds.height });
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const visibleHarness = useMemo<Harness2D>(() => {
    if (!componentDrag && Object.keys(previewPositions).length === 0 && Object.keys(previewConnectionRoutes).length === 0 && Object.keys(previewCableRunRoutes).length === 0 && !previewCableRunBreakoutPoint && Object.keys(previewLabelOffsets).length === 0 && Object.keys(previewPinMapOffsets).length === 0 && Object.keys(previewCableLabelOffsets).length === 0 && Object.keys(previewComponentScales).length === 0 && !previewHeatShrink) return harness;
    const placements = { ...harness.drawing.componentPlacements };
    Object.entries(previewPositions).forEach(([componentId, position]) => {
      const current = placements[componentId];
      if (current) placements[componentId] = { ...current, position };
    });
    Object.entries(previewLabelOffsets).forEach(([componentId, labels]) => {
      const current = placements[componentId];
      if (!current) return;
      placements[componentId] = {
        ...current,
        referenceLabel: labels.referenceLabel ? { ...current.referenceLabel, offset: labels.referenceLabel } : current.referenceLabel,
        nameLabel: labels.nameLabel ? { ...current.nameLabel, offset: labels.nameLabel } : current.nameLabel,
      };
    });
    Object.entries(previewPinMapOffsets).forEach(([componentId, pinMapOffset]) => {
      const current = placements[componentId];
      if (current) placements[componentId] = { ...current, pinMapOffset };
    });
    Object.entries(previewComponentScales).forEach(([componentId, displayScale]) => {
      const current = placements[componentId];
      if (current) placements[componentId] = { ...current, displayScale };
    });
    const connectionRoutes = { ...harness.drawing.connectionRoutes };
    Object.entries(previewConnectionRoutes).forEach(([connectionId, point]) => {
      connectionRoutes[connectionId] = { point };
    });
    const cableRunRoutes = { ...harness.drawing.cableRunRoutes };
    Object.entries(previewCableRunRoutes).forEach(([cableRunId, point]) => {
      cableRunRoutes[cableRunId] = { point };
    });
    const cableRunBreakouts = { ...harness.drawing.cableRunBreakouts };
    componentDrag?.selection.cableRunIds.forEach((cableRunId) => {
      const breakout = cableRunBreakouts[cableRunId];
      if (breakout) cableRunBreakouts[cableRunId] = {
        from: breakout.from ? { x: breakout.from.x + componentDrag.delta.x, y: breakout.from.y + componentDrag.delta.y } : undefined,
        to: breakout.to ? { x: breakout.to.x + componentDrag.delta.x, y: breakout.to.y + componentDrag.delta.y } : undefined,
      };
    });
    if (cableRunBreakoutDrag && previewCableRunBreakoutPoint) {
      cableRunBreakouts[cableRunBreakoutDrag.cableRunId] = {
        ...cableRunBreakouts[cableRunBreakoutDrag.cableRunId],
        [cableRunBreakoutDrag.end]: previewCableRunBreakoutPoint,
      };
    }
    const cableRunLabelOffsets = { ...harness.drawing.cableRunLabelOffsets, ...previewCableLabelOffsets };
    const cableHeatShrinks = (harness.drawing.cableHeatShrinks ?? []).map((heatShrink) => previewHeatShrink?.id === heatShrink.id ? previewHeatShrink : heatShrink);
    const movingConnections = componentDrag ? new Set([
      ...componentDrag.selection.connectionIds,
      ...harness.connections.filter((connection) => componentDrag.selection.cableRunIds.includes(connection.cableRunId ?? "")).map((connection) => connection.id),
    ]) : null;
    const connections = movingConnections ? harness.connections.map((connection) => {
      if (!movingConnections.has(connection.id)) return connection;
      return {
        ...connection,
        from: moveFreeEndpointPreview(connection.from, componentDrag!.delta),
        to: moveFreeEndpointPreview(connection.to, componentDrag!.delta),
      };
    }) : harness.connections;
    return { ...harness, connections, drawing: { ...harness.drawing, componentPlacements: placements, connectionRoutes, cableRunRoutes, cableRunBreakouts, cableRunLabelOffsets, cableHeatShrinks } };
  }, [cableRunBreakoutDrag, componentDrag, harness, previewCableLabelOffsets, previewCableRunBreakoutPoint, previewCableRunRoutes, previewComponentScales, previewConnectionRoutes, previewHeatShrink, previewLabelOffsets, previewPinMapOffsets, previewPositions]);

  const toWorld = (clientX: number, clientY: number): Point2D => {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return {
      x: (clientX - bounds.left - viewport.pan.x) / viewport.zoom,
      y: (clientY - bounds.top - viewport.pan.y) / viewport.zoom,
    };
  };

  const toScreen = (clientX: number, clientY: number): Point2D => {
    const bounds = svgRef.current?.getBoundingClientRect();
    return { x: clientX - (bounds?.left ?? 0), y: clientY - (bounds?.top ?? 0) };
  };

  const handleCanvasPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.button === 1 || (event.button === 0 && spacePressed)) {
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setPanDrag({ pointerStart: toScreen(event.clientX, event.clientY), panStart: viewport.pan });
      return;
    }
    if (event.button === 0) {
      event.preventDefault();
      onSelectAnnotation(null);
      onSelectHeatShrink(null);
      event.currentTarget.setPointerCapture?.(event.pointerId);
      const start = toWorld(event.clientX, event.clientY);
      setMarqueeDrag({ start, current: start, pointerId: event.pointerId, additive: event.shiftKey });
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (panDrag) {
      const pointer = toScreen(event.clientX, event.clientY);
      setViewport((current) => ({
        ...current,
        pan: {
          x: panDrag.panStart.x + pointer.x - panDrag.pointerStart.x,
          y: panDrag.panStart.y + pointer.y - panDrag.pointerStart.y,
        },
      }));
    }
    const world = toWorld(event.clientX, event.clientY);
    onMousePositionChange(world);
    if (componentDrag) {
      const delta = { x: snap(world.x - componentDrag.pointerStart.x), y: snap(world.y - componentDrag.pointerStart.y) };
      setComponentDrag({ ...componentDrag, delta });
      setPreviewPositions(Object.fromEntries(componentDrag.selection.componentIds.flatMap((componentId) => {
        const placement = harness.drawing.componentPlacements[componentId];
        return placement ? [[componentId, { x: placement.position.x + delta.x, y: placement.position.y + delta.y }]] : [];
      })));
      setPreviewConnectionRoutes(Object.fromEntries(componentDrag.selection.connectionIds.flatMap((connectionId) => {
        const route = harness.drawing.connectionRoutes?.[connectionId];
        return route ? [[connectionId, { x: route.point.x + delta.x, y: route.point.y + delta.y }]] : [];
      })));
      setPreviewCableRunRoutes(Object.fromEntries(componentDrag.selection.cableRunIds.flatMap((cableRunId) => {
        const route = harness.drawing.cableRunRoutes?.[cableRunId];
        return route ? [[cableRunId, { x: route.point.x + delta.x, y: route.point.y + delta.y }]] : [];
      })));
    }
    if (draftConnection) setDraftConnection({ ...draftConnection, pointer: world });
    if (routeDrag) setPreviewRoutePoint({ x: snap(world.x), y: snap(world.y) });
    if (cableRunBreakoutDrag) setPreviewCableRunBreakoutPoint({ x: snap(world.x), y: snap(world.y) });
    if (labelDrag) {
      const offset = {
        x: snap(labelDrag.offsetStart.x + world.x - labelDrag.pointerStart.x),
        y: snap(labelDrag.offsetStart.y + world.y - labelDrag.pointerStart.y),
      };
      setPreviewLabelOffsets({ [labelDrag.componentId]: { [labelDrag.label]: offset } });
    }
    if (pinMapDrag) {
      const offset = {
        x: snap(pinMapDrag.offsetStart.x + world.x - pinMapDrag.pointerStart.x),
        y: snap(pinMapDrag.offsetStart.y + world.y - pinMapDrag.pointerStart.y),
      };
      setPreviewPinMapOffsets({ [pinMapDrag.componentId]: offset });
    }
    if (cableLabelDrag) {
      const offset = {
        x: snap(cableLabelDrag.offsetStart.x + world.x - cableLabelDrag.pointerStart.x),
        y: snap(cableLabelDrag.offsetStart.y + world.y - cableLabelDrag.pointerStart.y),
      };
      setPreviewCableLabelOffsets({ [cableLabelDrag.cableRunId]: offset });
    }
    if (annotationDrag) {
      const rawDelta = {
        x: world.x - annotationDrag.pointerStart.x,
        y: world.y - annotationDrag.pointerStart.y,
      };
      const delta = { x: snap(rawDelta.x), y: snap(rawDelta.y) };
      if (annotationDrag.mode === "rotate" && annotationDrag.center && annotationDrag.startAngle !== undefined) {
        const angle = Math.atan2(world.y - annotationDrag.center.y, world.x - annotationDrag.center.x) * 180 / Math.PI;
        setPreviewAnnotation({
          ...annotationDrag.original,
          rotation: normalizeAngle((annotationDrag.original.rotation ?? 0) + angle - annotationDrag.startAngle),
        });
      } else if (annotationDrag.mode === "move") setPreviewAnnotation({
        ...annotationDrag.original,
        position: {
          x: annotationDrag.original.position.x + delta.x,
          y: annotationDrag.original.position.y + delta.y,
        },
      });
      else {
        const radians = -(annotationDrag.original.rotation ?? 0) * Math.PI / 180;
        const localDelta = {
          x: rawDelta.x * Math.cos(radians) - rawDelta.y * Math.sin(radians),
          y: rawDelta.x * Math.sin(radians) + rawDelta.y * Math.cos(radians),
        };
        setPreviewAnnotation({
          ...annotationDrag.original,
          width: Math.max(10, annotationDrag.original.width + snap(localDelta.x)),
          height: Math.max(10, annotationDrag.original.height + snap(localDelta.y)),
        });
      }
    }
    if (componentScaleDrag) {
      const distance = Math.max(1, Math.hypot(world.x - componentScaleDrag.center.x, world.y - componentScaleDrag.center.y));
      const displayScale = Math.round(clamp(componentScaleDrag.startScale * distance / componentScaleDrag.startDistance, 0.2, 5) * 20) / 20;
      setPreviewComponentScales({ [componentScaleDrag.componentId]: displayScale });
    }
    if (heatShrinkDrag) {
      const cableRun = visibleHarness.cableRuns.find((item) => item.id === heatShrinkDrag.heatShrink.cableRunId);
      if (cableRun) {
        const geometry = cableRunGeometry(visibleHarness, cableRun.id);
        const routePoint = visibleHarness.drawing.cableRunRoutes?.[cableRun.id]?.point;
        const ratio = routedRatioAtPoint(sampleRoutedPath(geometry.fromJunction, geometry.toJunction, routePoint), world);
        const minimum = 0.03;
        if (heatShrinkDrag.mode === "move") {
          const span = heatShrinkDrag.heatShrink.endRatio - heatShrinkDrag.heatShrink.startRatio;
          const startRatio = clamp(heatShrinkDrag.heatShrink.startRatio + ratio - heatShrinkDrag.pointerStartRatio, 0, 1 - span);
          setPreviewHeatShrink({ ...heatShrinkDrag.heatShrink, startRatio, endRatio: startRatio + span });
        } else if (heatShrinkDrag.mode === "start") {
          setPreviewHeatShrink({ ...heatShrinkDrag.heatShrink, startRatio: clamp(ratio, 0, heatShrinkDrag.heatShrink.endRatio - minimum) });
        } else {
          setPreviewHeatShrink({ ...heatShrinkDrag.heatShrink, endRatio: clamp(ratio, heatShrinkDrag.heatShrink.startRatio + minimum, 1) });
        }
      }
    }
    if (marqueeDrag) setMarqueeDrag({ ...marqueeDrag, current: world });
  };

  const handlePointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (componentDrag) {
      if (event.type !== "pointercancel" && (componentDrag.delta.x !== 0 || componentDrag.delta.y !== 0)) {
        onMoveSelection(componentDrag.selection, componentDrag.delta);
      }
      setComponentDrag(null);
      setPreviewPositions({});
      setPreviewConnectionRoutes({});
      setPreviewCableRunRoutes({});
      if (svgRef.current?.hasPointerCapture?.(componentDrag.pointerId)) {
        svgRef.current.releasePointerCapture?.(componentDrag.pointerId);
      }
    }
    if (panDrag) {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
      setPanDrag(null);
    }
    if (marqueeDrag) {
      if (event.type !== "pointercancel") {
        const current = toWorld(event.clientX, event.clientY);
        const rectangle = normalizedRectangle(marqueeDrag.start, current);
        const selected = rectangle.width < 3 && rectangle.height < 3
          ? { componentIds: [], connectionIds: [], cableRunIds: [] }
          : selectionInRectangle(visibleHarness, rectangle);
        onSelectionChange(marqueeDrag.additive ? mergeSelection(selection, selected) : selected);
      }
      if (event.currentTarget.hasPointerCapture?.(marqueeDrag.pointerId)) {
        event.currentTarget.releasePointerCapture?.(marqueeDrag.pointerId);
      }
      setMarqueeDrag(null);
    }
    if (routeDrag && previewRoutePoint) {
      if (routeDrag.kind === "connection") onMoveConnectionRoute(routeDrag.id, previewRoutePoint);
      else onMoveCableRunRoute(routeDrag.id, previewRoutePoint);
    }
    if (routeDrag && svgRef.current?.hasPointerCapture?.(routeDrag.pointerId)) {
      svgRef.current.releasePointerCapture?.(routeDrag.pointerId);
    }
    setRouteDrag(null);
    setPreviewRoutePoint(null);
    if (cableRunBreakoutDrag && previewCableRunBreakoutPoint && event.type !== "pointercancel") {
      onMoveCableRunBreakout(cableRunBreakoutDrag.cableRunId, cableRunBreakoutDrag.end, previewCableRunBreakoutPoint);
    }
    if (cableRunBreakoutDrag && svgRef.current?.hasPointerCapture?.(cableRunBreakoutDrag.pointerId)) {
      svgRef.current.releasePointerCapture?.(cableRunBreakoutDrag.pointerId);
    }
    setCableRunBreakoutDrag(null);
    setPreviewCableRunBreakoutPoint(null);
    if (labelDrag) {
      const offset = previewLabelOffsets[labelDrag.componentId]?.[labelDrag.label];
      if (offset) onMoveComponentLabel(labelDrag.componentId, labelDrag.label, offset);
      if (svgRef.current?.hasPointerCapture?.(labelDrag.pointerId)) svgRef.current.releasePointerCapture?.(labelDrag.pointerId);
    }
    setLabelDrag(null);
    setPreviewLabelOffsets({});
    if (pinMapDrag) {
      const offset = previewPinMapOffsets[pinMapDrag.componentId];
      if (offset) onMoveComponentPinMap(pinMapDrag.componentId, offset);
      if (svgRef.current?.hasPointerCapture?.(pinMapDrag.pointerId)) svgRef.current.releasePointerCapture?.(pinMapDrag.pointerId);
    }
    setPinMapDrag(null);
    setPreviewPinMapOffsets({});
    if (cableLabelDrag) {
      const offset = previewCableLabelOffsets[cableLabelDrag.cableRunId];
      if (offset) onMoveCableRunLabel(cableLabelDrag.cableRunId, offset);
      if (svgRef.current?.hasPointerCapture?.(cableLabelDrag.pointerId)) svgRef.current.releasePointerCapture?.(cableLabelDrag.pointerId);
    }
    setCableLabelDrag(null);
    setPreviewCableLabelOffsets({});
    if (annotationDrag && previewAnnotation && event.type !== "pointercancel") {
      onUpdateAnnotation(annotationDrag.annotationId, annotationDrag.mode === "move"
        ? { position: previewAnnotation.position }
        : annotationDrag.mode === "rotate"
          ? { rotation: previewAnnotation.rotation }
          : { width: previewAnnotation.width, height: previewAnnotation.height });
    }
    if (annotationDrag && svgRef.current?.hasPointerCapture?.(annotationDrag.pointerId)) {
      svgRef.current.releasePointerCapture?.(annotationDrag.pointerId);
    }
    setAnnotationDrag(null);
    setPreviewAnnotation(null);
    if (componentScaleDrag) {
      const displayScale = previewComponentScales[componentScaleDrag.componentId];
      if (displayScale !== undefined && event.type !== "pointercancel") onResizeComponent(componentScaleDrag.componentId, displayScale);
      if (svgRef.current?.hasPointerCapture?.(componentScaleDrag.pointerId)) svgRef.current.releasePointerCapture?.(componentScaleDrag.pointerId);
    }
    setComponentScaleDrag(null);
    setPreviewComponentScales({});
    if (heatShrinkDrag && previewHeatShrink && event.type !== "pointercancel") {
      onUpdateHeatShrink(heatShrinkDrag.heatShrink.id, { startRatio: previewHeatShrink.startRatio, endRatio: previewHeatShrink.endRatio });
    }
    if (heatShrinkDrag && svgRef.current?.hasPointerCapture?.(heatShrinkDrag.pointerId)) {
      svgRef.current.releasePointerCapture?.(heatShrinkDrag.pointerId);
    }
    setHeatShrinkDrag(null);
    setPreviewHeatShrink(null);
    setDraftConnection(null);
  };

  const handleWheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const screen = toScreen(event.clientX, event.clientY);
    setViewport((current) => {
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1);
      const nextZoom = clamp(current.zoom * Math.exp(-clamp(delta, -100, 100) * 0.00055), 0.25, 4);
      const worldX = (screen.x - current.pan.x) / current.zoom;
      const worldY = (screen.y - current.pan.y) / current.zoom;
      return {
        zoom: nextZoom,
        pan: { x: screen.x - worldX * nextZoom, y: screen.y - worldY * nextZoom },
      };
    });
  };

  const beginSelectionDrag = (event: ReactPointerEvent<SVGElement>, key: keyof CanvasSelection, id: string) => {
    if (event.button !== 0 || spacePressed) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedPinMapComponentId(null);
    const selected = selection[key].includes(id);
    if (event.shiftKey && selected) {
      onSelectionChange({ ...selection, [key]: selection[key].filter((selectedId) => selectedId !== id) });
      return;
    }
    const dragSelection = selected
      ? selection
      : event.shiftKey
        ? { ...selection, [key]: [...selection[key], id] }
        : { componentIds: [], connectionIds: [], cableRunIds: [], [key]: [id] };
    onSelectionChange(dragSelection);
    svgRef.current?.setPointerCapture?.(event.pointerId);
    setComponentDrag({ selection: dragSelection, pointerStart: toWorld(event.clientX, event.clientY), delta: { x: 0, y: 0 }, pointerId: event.pointerId });
  };

  const beginComponentDrag = (event: ReactPointerEvent<SVGGElement>, componentId: string) => {
    if (!visibleHarness.drawing.componentPlacements[componentId]) return;
    beginSelectionDrag(event, "componentIds", componentId);
  };

  const beginComponentScaleDrag = (
    event: ReactPointerEvent<SVGGElement>,
    connector: Connector2D,
    placement: ComponentPlacement2D,
  ) => {
    if (event.button !== 0 || spacePressed) return;
    event.preventDefault();
    event.stopPropagation();
    const size = connectorSize(connector, placement);
    const center = { x: placement.position.x + size.width / 2, y: placement.position.y + size.height / 2 };
    const pointer = toWorld(event.clientX, event.clientY);
    onSelectionChange({ componentIds: [connector.id], connectionIds: [], cableRunIds: [] });
    svgRef.current?.setPointerCapture?.(event.pointerId);
    setComponentScaleDrag({
      componentId: connector.id,
      pointerId: event.pointerId,
      center,
      startDistance: Math.max(1, Math.hypot(pointer.x - center.x, pointer.y - center.y)),
      startScale: placement.displayScale ?? 1,
    });
  };

  const beginConnection = (event: ReactPointerEvent<SVGCircleElement>, endpoint: PinEndpoint2D) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const connector = visibleHarness.components.find((item) => item.id === endpoint.componentId);
    const placement = visibleHarness.drawing.componentPlacements[endpoint.componentId];
    if (!connector || !placement) return;
    setDraftConnection({ from: endpoint, pointer: pinPosition(connector, placement, endpoint.pinId) });
  };

  const finishConnection = (event: ReactPointerEvent<SVGCircleElement>, to: PinEndpoint2D) => {
    event.stopPropagation();
    if (!draftConnection) return;
    if (draftConnection.from.componentId !== to.componentId || draftConnection.from.pinId !== to.pinId) {
      onConnect(draftConnection.from, to);
    }
    setDraftConnection(null);
  };

  const beginRouteDrag = (
    event: ReactPointerEvent<SVGCircleElement>,
    kind: RouteDrag["kind"],
    id: string,
    point: Point2D,
  ) => {
    if (event.button !== 0 || spacePressed) return;
    event.preventDefault();
    event.stopPropagation();
    onSelectionChange(kind === "connection"
      ? { componentIds: [], connectionIds: [id], cableRunIds: [] }
      : { componentIds: [], connectionIds: [], cableRunIds: [id] });
    svgRef.current?.setPointerCapture?.(event.pointerId);
    setRouteDrag({ kind, id, pointerId: event.pointerId });
    setPreviewRoutePoint(point);
  };

  const beginCableRunBreakoutDrag = (
    event: ReactPointerEvent<SVGCircleElement>,
    cableRunId: string,
    end: keyof CableRunBreakout2D,
    point: Point2D,
  ) => {
    if (event.button !== 0 || spacePressed) return;
    event.preventDefault();
    event.stopPropagation();
    onSelectionChange({ componentIds: [], connectionIds: [], cableRunIds: [cableRunId] });
    svgRef.current?.setPointerCapture?.(event.pointerId);
    setCableRunBreakoutDrag({ cableRunId, end, pointerId: event.pointerId });
    setPreviewCableRunBreakoutPoint(point);
  };

  const beginLabelDrag = (
    event: ReactPointerEvent<SVGGElement>,
    componentId: string,
    label: ConnectorLabelKind,
    offset: Point2D,
  ) => {
    if (event.button !== 0 || spacePressed) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedPinMapComponentId(null);
    onSelectionChange({ componentIds: [componentId], connectionIds: [], cableRunIds: [] });
    onSelectComponentLabel({ componentId, label });
    svgRef.current?.setPointerCapture?.(event.pointerId);
    setLabelDrag({ componentId, label, pointerStart: toWorld(event.clientX, event.clientY), offsetStart: offset, pointerId: event.pointerId });
  };

  const beginPinMapDrag = (
    event: ReactPointerEvent<SVGGElement>,
    componentId: string,
    offset: Point2D,
  ) => {
    if (event.button !== 0 || spacePressed) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedPinMapComponentId(componentId);
    onSelectionChange({ componentIds: [], connectionIds: [], cableRunIds: [] });
    svgRef.current?.setPointerCapture?.(event.pointerId);
    setPinMapDrag({ componentId, pointerStart: toWorld(event.clientX, event.clientY), offsetStart: offset, pointerId: event.pointerId });
  };

  const beginCableLabelDrag = (
    event: ReactPointerEvent<SVGGElement>,
    cableRunId: string,
    offset: Point2D,
  ) => {
    if (event.button !== 0 || spacePressed) return;
    event.preventDefault();
    event.stopPropagation();
    onSelectionChange({ componentIds: [], connectionIds: [], cableRunIds: [cableRunId] });
    svgRef.current?.setPointerCapture?.(event.pointerId);
    setCableLabelDrag({ cableRunId, pointerStart: toWorld(event.clientX, event.clientY), offsetStart: offset, pointerId: event.pointerId });
  };

  const beginHeatShrinkDrag = (
    event: ReactPointerEvent<SVGElement>,
    heatShrink: CableHeatShrink2D,
    mode: HeatShrinkDrag["mode"],
  ) => {
    if (event.button !== 0 || spacePressed) return;
    event.preventDefault();
    event.stopPropagation();
    const geometry = cableRunGeometry(visibleHarness, heatShrink.cableRunId);
    const routePoint = visibleHarness.drawing.cableRunRoutes?.[heatShrink.cableRunId]?.point;
    const pointerStartRatio = routedRatioAtPoint(sampleRoutedPath(geometry.fromJunction, geometry.toJunction, routePoint), toWorld(event.clientX, event.clientY));
    onSelectionChange({ componentIds: [], connectionIds: [], cableRunIds: [] });
    onSelectHeatShrink(heatShrink.id);
    svgRef.current?.setPointerCapture?.(event.pointerId);
    setHeatShrinkDrag({ heatShrink, mode, pointerStartRatio, pointerId: event.pointerId });
    setPreviewHeatShrink(heatShrink);
  };

  const beginAnnotationDrag = (
    event: ReactPointerEvent<SVGGElement | SVGRectElement>,
    annotation: DrawingAnnotation2D,
    mode: AnnotationDrag["mode"],
  ) => {
    if (event.button !== 0 || spacePressed) return;
    event.preventDefault();
    event.stopPropagation();
    onSelectionChange({ componentIds: [], connectionIds: [], cableRunIds: [] });
    onSelectAnnotation(annotation.id);
    svgRef.current?.setPointerCapture?.(event.pointerId);
    const pointerStart = toWorld(event.clientX, event.clientY);
    const center = { x: annotation.position.x + annotation.width / 2, y: annotation.position.y + annotation.height / 2 };
    setAnnotationDrag({
      annotationId: annotation.id,
      mode,
      pointerStart,
      original: annotation,
      pointerId: event.pointerId,
      center: mode === "rotate" ? center : undefined,
      startAngle: mode === "rotate" ? Math.atan2(pointerStart.y - center.y, pointerStart.x - center.x) * 180 / Math.PI : undefined,
    });
    setPreviewAnnotation(annotation);
  };

  const fitDrawing = () => {
    if (harness.components.length === 0 || !svgRef.current) {
      setViewport({ zoom: 1, pan: { x: 40, y: 40 } });
      return;
    }
    const positions = harness.components.map((component) => connectorBounds(component, harness.drawing.componentPlacements[component.id]));
    const minX = Math.min(...positions.map((item) => item.x));
    const minY = Math.min(...positions.map((item) => item.y));
    const maxX = Math.max(...positions.map((item) => item.x + item.width));
    const maxY = Math.max(...positions.map((item) => item.y + item.height));
    const bounds = svgRef.current.getBoundingClientRect();
    const zoom = clamp(Math.min((bounds.width - 100) / (maxX - minX), (bounds.height - 100) / (maxY - minY)), 0.25, 1.5);
    setViewport({
      zoom,
      pan: {
        x: (bounds.width - (maxX - minX) * zoom) / 2 - minX * zoom,
        y: (bounds.height - (maxY - minY) * zoom) / 2 - minY * zoom,
      },
    });
  };

  const horizontalRulerTicks = buildRulerTicks(viewport.pan.x, viewport.zoom, settings.lengthUnit, canvasSize.width);
  const verticalRulerTicks = buildRulerTicks(viewport.pan.y, viewport.zoom, settings.lengthUnit, canvasSize.height);

  return <div className={`hd2-canvas-wrap${settings.rulersVisible ? " has-rulers" : ""}`}>
    {settings.rulersVisible && <>
      <div className="hd2-ruler-corner">{settings.lengthUnit}</div>
      <svg className="hd2-ruler hd2-ruler--horizontal" aria-label="가로 눈금자">
        {horizontalRulerTicks.map((tick) => <g key={tick.world} transform={`translate(${tick.screen} 0)`}>
          <line x1="0" y1="12" x2="0" y2="22" />
          <text x="3" y="9">{tick.label}</text>
        </g>)}
      </svg>
      <svg className="hd2-ruler hd2-ruler--vertical" aria-label="세로 눈금자">
        {verticalRulerTicks.map((tick) => <g key={tick.world} transform={`translate(0 ${tick.screen})`}>
          <line x1="20" y1="0" x2="30" y2="0" />
          <text x="2" y="-3">{tick.label}</text>
        </g>)}
      </svg>
    </>}
    <div className="hd2-canvas-tools">
      <button type="button" onClick={() => setViewport((current) => ({ ...current, zoom: clamp(current.zoom * 1.2, .25, 4) }))}>+</button>
      <button type="button" onClick={() => setViewport((current) => ({ ...current, zoom: clamp(current.zoom / 1.2, .25, 4) }))}>−</button>
      <button type="button" onClick={fitDrawing}>전체</button>
      <span>{Math.round(viewport.zoom * 100)}%</span>
    </div>
    <svg
      ref={svgRef}
      className={`hd2-canvas${spacePressed || panDrag ? " is-panning" : ""}${marqueeDrag ? " is-selecting" : ""}`}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={() => {
        if (!componentDrag && !panDrag && !routeDrag && !cableRunBreakoutDrag && !marqueeDrag && !annotationDrag) onMousePositionChange(null);
      }}
      onWheel={handleWheel}
      aria-label="하네스 2D 도면"
    >
      <defs>
        <pattern id="hd2-grid-small" width={settings.gridSize} height={settings.gridSize} patternUnits="userSpaceOnUse">
          <path d={`M ${settings.gridSize} 0 L 0 0 0 ${settings.gridSize}`} fill="none" stroke="var(--hd2-grid-small)" strokeWidth="0.6" />
        </pattern>
        <pattern id="hd2-grid" width={settings.gridSize * 5} height={settings.gridSize * 5} patternUnits="userSpaceOnUse">
          <rect width={settings.gridSize * 5} height={settings.gridSize * 5} fill="url(#hd2-grid-small)" />
          <path d={`M ${settings.gridSize * 5} 0 L 0 0 0 ${settings.gridSize * 5}`} fill="none" stroke="var(--hd2-grid-major)" strokeWidth="0.9" />
        </pattern>
      </defs>
      <g transform={`translate(${viewport.pan.x} ${viewport.pan.y}) scale(${viewport.zoom})`}>
        {settings.gridVisible && <rect className="hd2-grid" x={-5000} y={-5000} width={10000} height={10000} fill="url(#hd2-grid)" />}
        {harness.sheetType === "cover" && <CoverSheet
          sheet={settings.drawingSheet}
          projectNumber={projectNumber}
          projectName={projectName}
          harness={visibleHarness}
          onUpdateProjectMetadata={onUpdateProjectMetadata}
          onUpdateHarnessMetadata={onUpdateHarnessMetadata}
          onUpdateTitleBlock={onUpdateTitleBlock}
        />}
        {harness.sheetType === "toc" && <TableOfContentsSheet
          sheet={settings.drawingSheet}
          projectNumber={projectNumber}
          projectName={projectName}
          harness={visibleHarness}
          entries={documentIndex}
          onUpdateProjectMetadata={onUpdateProjectMetadata}
          onUpdateHarnessMetadata={onUpdateHarnessMetadata}
          onUpdateIndexedSheet={onUpdateIndexedSheet}
          onUpdateTitleBlock={onUpdateTitleBlock}
        />}
        {(harness.sheetType ?? "harness") === "harness" && settings.drawingTemplateVisible && <DrawingTemplate
          sheet={settings.drawingSheet}
          projectNumber={projectNumber}
          projectName={projectName}
          harness={visibleHarness}
          onUpdateProjectMetadata={onUpdateProjectMetadata}
          onUpdateHarnessMetadata={onUpdateHarnessMetadata}
          onUpdateTitleBlock={onUpdateTitleBlock}
        />}
        {marqueeDrag && <rect
          className="hd2-marquee"
          {...normalizedRectangle(marqueeDrag.start, marqueeDrag.current)}
          aria-label="박스 선택 영역"
        />}
        <g className="hd2-wires">
          {visibleHarness.cableRuns.map((cableRun) => {
            const geometry = cableRunGeometry(visibleHarness, cableRun.id);
            const selected = selection.cableRunIds.includes(cableRun.id);
            const savedRoutePoint = visibleHarness.drawing.cableRunRoutes?.[cableRun.id]?.point;
            const routePoint = routeDrag?.kind === "cableRun" && routeDrag.id === cableRun.id && previewRoutePoint
              ? previewRoutePoint
              : savedRoutePoint;
            const handlePoint = routePoint ?? defaultRoutePoint(geometry.fromJunction, geometry.toJunction);
            const jacketPath = routedPath(geometry.fromJunction, geometry.toJunction, routePoint);
            const routePoints = sampleRoutedPath(geometry.fromJunction, geometry.toJunction, routePoint);
            const jacketWidth = clamp(cableRun.outerDiameterMm * 2, 8, 18);
            const labelOffset = visibleHarness.drawing.cableRunLabelOffsets?.[cableRun.id] ?? { x: 0, y: -jacketWidth - 7 };
            return <g key={cableRun.id}>
              {geometry.connections.map((item) => {
                const connection = visibleHarness.connections.find((candidate) => candidate.id === item.connectionId)!;
                const color = splitWireColor(connection.color);
                const fromPath = orthogonalPath(item.from, geometry.fromJunction);
                const toPath = orthogonalPath(geometry.toJunction, item.to);
                return <g key={item.connectionId}>
                  <path className="hd2-cable-core" d={fromPath} style={{ stroke: wireColorValue(color.primary) }} />
                  <path className="hd2-cable-core" d={toPath} style={{ stroke: wireColorValue(color.primary) }} />
                  {color.secondary && <><path className="hd2-cable-core-stripe" d={fromPath} style={{ stroke: wireColorValue(color.secondary) }} /><path className="hd2-cable-core-stripe" d={toPath} style={{ stroke: wireColorValue(color.secondary) }} /></>}
                  <StrippedConductor endpoint={connection.from} adjacent={geometry.fromJunction} />
                  <StrippedConductor endpoint={connection.to} adjacent={geometry.toJunction} />
                </g>;
              })}
              <path className="hd2-cable-hit" d={jacketPath} aria-label={`${cableRun.reference} 외피`} onPointerDown={(event) => {
                beginSelectionDrag(event, "cableRunIds", cableRun.id);
              }} />
              <path className={`hd2-cable-jacket${selected ? " is-selected" : ""}`} d={jacketPath} style={{ strokeWidth: jacketWidth }} />
              <circle className="hd2-cable-collar" cx={geometry.fromJunction.x} cy={geometry.fromJunction.y} r={jacketWidth / 2 + 2} />
              <circle className="hd2-cable-collar" cx={geometry.toJunction.x} cy={geometry.toJunction.y} r={jacketWidth / 2 + 2} />
              {(visibleHarness.drawing.cableHeatShrinks ?? []).filter((heatShrink) => heatShrink.cableRunId === cableRun.id).map((heatShrink) => {
                const heatShrinkSelected = selectedHeatShrinkId === heatShrink.id;
                const start = routedPointAtRatio(routePoints, heatShrink.startRatio);
                const end = routedPointAtRatio(routePoints, heatShrink.endRatio);
                const center = routedPointAtRatio(routePoints, (heatShrink.startRatio + heatShrink.endRatio) / 2);
                const tubePath = routedSlicePath(routePoints, heatShrink.startRatio, heatShrink.endRatio);
                const labelPath = end.x < start.x
                  ? routedSlicePath([...routePoints].reverse(), 1 - heatShrink.endRatio, 1 - heatShrink.startRatio)
                  : tubePath;
                return <g key={heatShrink.id} className={`hd2-heat-shrink${heatShrinkSelected ? " is-selected" : ""}`}>
                  <path className="hd2-heat-shrink-hit" d={tubePath} aria-label={`${heatShrink.reference} 수축튜브`} onPointerDown={(event) => beginHeatShrinkDrag(event, heatShrink, "move")} />
                  <path className="hd2-heat-shrink-body" d={tubePath} style={{ stroke: heatShrink.color, strokeWidth: jacketWidth + 7 }} />
                  <path className="hd2-heat-shrink-highlight" d={tubePath} style={{ strokeWidth: Math.max(2, jacketWidth * 0.22) }} />
                  <HeatShrinkPathText
                    heatShrink={heatShrink}
                    path={labelPath}
                    center={center}
                    onSelect={() => onSelectHeatShrink(heatShrink.id)}
                    onCommit={(text) => onUpdateHeatShrink(heatShrink.id, { text })}
                  />
                  {heatShrinkSelected && <>
                    <circle className="hd2-heat-shrink-handle" cx={start.x} cy={start.y} r="7" aria-label={`${heatShrink.reference} 시작 핸들`} onPointerDown={(event) => beginHeatShrinkDrag(event, heatShrink, "start")} />
                    <circle className="hd2-heat-shrink-handle" cx={end.x} cy={end.y} r="7" aria-label={`${heatShrink.reference} 끝 핸들`} onPointerDown={(event) => beginHeatShrinkDrag(event, heatShrink, "end")} />
                  </>}
                </g>;
              })}
              <g
                className={`hd2-cable-label${selected ? " is-selected" : ""}`}
                transform={`translate(${handlePoint.x + labelOffset.x} ${handlePoint.y + labelOffset.y})`}
                aria-label={`${cableRun.reference} 케이블 라벨`}
                onPointerDown={(event) => beginCableLabelDrag(event, cableRun.id, labelOffset)}
              >
                <text>{cableRun.reference} · {cableRun.partNumber} · {cableRun.lengthMm} mm</text>
              </g>
              {selected && <circle
                className="hd2-route-handle"
                cx={handlePoint.x}
                cy={handlePoint.y}
                r="8"
                aria-label={`${cableRun.reference} 외피 경로 핸들`}
                onPointerDown={(event) => beginRouteDrag(event, "cableRun", cableRun.id, handlePoint)}
              />}
            </g>;
          })}
          {visibleHarness.connections.filter((connection) => !connection.cableRunId).map((connection) => {
            const from = endpointPosition(visibleHarness, connection.from);
            const to = endpointPosition(visibleHarness, connection.to);
            const selected = selection.connectionIds.includes(connection.id);
            const savedRoutePoint = visibleHarness.drawing.connectionRoutes?.[connection.id]?.point;
            const routePoint = routeDrag?.kind === "connection" && routeDrag.id === connection.id && previewRoutePoint
              ? previewRoutePoint
              : savedRoutePoint;
            const handlePoint = routePoint ?? defaultRoutePoint(from, to);
            const path = routedPath(from, to, routePoint);
            const color = splitWireColor(connection.color);
            return <g key={connection.id}>
              <path className="hd2-wire-hit" d={path} aria-label={`${connection.reference} 전선`} onPointerDown={(event) => {
                beginSelectionDrag(event, "connectionIds", connection.id);
              }} />
              <path className={`hd2-wire${selected ? " is-selected" : ""}`} d={path} style={{ stroke: wireColorValue(color.primary) }} />
              {color.secondary && <path className={`hd2-wire-stripe${selected ? " is-selected" : ""}`} d={path} style={{ stroke: wireColorValue(color.secondary) }} />}
              <StrippedConductor endpoint={connection.from} adjacent={routePoint ?? to} />
              <StrippedConductor endpoint={connection.to} adjacent={routePoint ?? from} />
              <text className="hd2-wire-label" x={handlePoint.x} y={handlePoint.y - 7}>{connection.reference}</text>
              {selected && <circle
                className="hd2-route-handle"
                cx={handlePoint.x}
                cy={handlePoint.y}
                r="8"
                aria-label={`${connection.reference} 전선 경로 핸들`}
                onPointerDown={(event) => beginRouteDrag(event, "connection", connection.id, handlePoint)}
              />}
            </g>;
          })}
          {draftConnection && <path className="hd2-wire hd2-wire--draft" d={orthogonalPath(endpointPosition(visibleHarness, draftConnection.from), draftConnection.pointer)} />}
        </g>
        {visibleHarness.components.map((connector) => {
          const placement = visibleHarness.drawing.componentPlacements[connector.id];
          const selected = selection.componentIds.includes(connector.id);
          const baseHeight = connectorHeight(connector);
          const baseSize = connectorSize(connector);
          const size = connectorSize(connector, placement);
          const displayScale = placement.displayScale ?? 1;
          const referenceOffset = connectorLabelOffset(connector, placement, "referenceLabel");
          const nameOffset = connectorLabelOffset(connector, placement, "nameLabel");
          const pinMapRows = connectorPinMapRows(visibleHarness, connector.id);
          const bounds = connectorBounds(connector, placement);
          const pinMapOffset = placement.pinMapOffset ?? {
            x: placement.pinSide === "right" ? bounds.x - placement.position.x + bounds.width + 12 : bounds.x - placement.position.x - 152,
            y: bounds.y - placement.position.y,
          };
          return <g
            key={connector.id}
            className={`hd2-connector${selected ? " is-selected" : ""}`}
            transform={`translate(${placement.position.x} ${placement.position.y})`}
            onPointerDown={(event) => beginComponentDrag(event, connector.id)}
            data-testid={`connector-${connector.reference}`}
          >
            <g transform={`${placement.rotation ? `rotate(${placement.rotation} ${size.width / 2} ${size.height / 2}) ` : ""}scale(${displayScale})`} data-testid={`connector-geometry-${connector.reference}`}>
            {connector.drawing ? <>
              <rect className={`hd2-part-symbol-hit${selected ? " is-selected" : ""}`} width={baseSize.width} height={baseSize.height} />
              <g className="hd2-part-symbol" transform={placement.pinSide === "left" ? `translate(${baseSize.width} 0) scale(-1 1)` : undefined}>
                <svg width={baseSize.width} height={baseSize.height} viewBox={`0 0 ${connector.drawing.widthMm} ${connector.drawing.heightMm}`} preserveAspectRatio="none" overflow="hidden">
                  {connector.drawing.imageDataUrl && <image href={connector.drawing.imageDataUrl} width={connector.drawing.widthMm} height={connector.drawing.heightMm} preserveAspectRatio="none" />}
                  {connector.drawing.paths.map((path, index) => <path key={index} d={drawingPathData(path)} vectorEffect="non-scaling-stroke" style={{ stroke: "#173f59", strokeWidth: partDrawingStrokeWidth(connector.drawing!.outlineStrength) }} />)}
                </svg>
              </g>
              {connector.pins.map((pin) => {
                if (!pin.anchor) return null;
                const pinPoint = pinPosition(connector, { position: { x: 0, y: 0 }, pinSide: placement.pinSide, rotation: 0 }, pin.id);
                const usage = visibleHarness.connections.filter((connection) => (
                  (connection.from.componentId === connector.id && connection.from.pinId === pin.id)
                  || (connection.to.componentId === connector.id && connection.to.pinId === pin.id)
                )).length;
                return <g key={pin.id}>
                  <circle className={`hd2-pin-port hd2-symbol-pin-port${usage > 0 ? " is-used" : ""}`} cx={pinPoint.x} cy={pinPoint.y} r="3.5" />
                  <circle className="hd2-pin-hit" cx={pinPoint.x} cy={pinPoint.y} r="10" aria-label={`${connector.reference} 핀 ${pin.number}`} onPointerDown={(event) => beginConnection(event, { componentId: connector.id, pinId: pin.id })} onPointerUp={(event) => finishConnection(event, { componentId: connector.id, pinId: pin.id })} />
                  <text className="hd2-symbol-pin-number" x={pinPoint.x + (placement.pinSide === "left" ? -7 : 7)} y={pinPoint.y - 5} textAnchor={placement.pinSide === "left" ? "end" : "start"}>{pin.number}</text>
                </g>;
              })}
            </> : <>
            <rect className="hd2-connector-body" width={CONNECTOR_WIDTH} height={baseHeight} rx="5" />
            <rect className="hd2-connector-header" width={CONNECTOR_WIDTH} height={CONNECTOR_HEADER_HEIGHT} rx="5" />
            <path d={`M 0 ${CONNECTOR_HEADER_HEIGHT} H ${CONNECTOR_WIDTH}`} />
            <text className="hd2-pin-count" x={CONNECTOR_WIDTH - 11} y="18" textAnchor="end">{connector.pins.length}P</text>
            <path d={`M 0 ${CONNECTOR_HEADER_HEIGHT + CONNECTOR_INFO_HEIGHT} H ${CONNECTOR_WIDTH}`} />
            {connector.pins.map((pin, index) => {
              const y = CONNECTOR_HEADER_HEIGHT + CONNECTOR_INFO_HEIGHT + index * PIN_ROW_HEIGHT;
              const pinX = placement.pinSide === "right" ? CONNECTOR_WIDTH : 0;
              const usage = visibleHarness.connections.filter((connection) => (
                (connection.from.componentId === connector.id && connection.from.pinId === pin.id)
                || (connection.to.componentId === connector.id && connection.to.pinId === pin.id)
              )).length;
              return <g key={pin.id}>
                <rect className={index % 2 === 0 ? "hd2-pin-row is-even" : "hd2-pin-row"} x="1" y={y} width={CONNECTOR_WIDTH - 2} height={PIN_ROW_HEIGHT} />
                <text className="hd2-pin-number" x={placement.pinSide === "right" ? 11 : CONNECTOR_WIDTH - 11} y={y + 15} textAnchor={placement.pinSide === "right" ? "start" : "end"}>{pin.number}</text>
                <text className="hd2-pin-name" x={placement.pinSide === "right" ? 40 : CONNECTOR_WIDTH - 40} y={y + 15} textAnchor={placement.pinSide === "right" ? "start" : "end"}>{pin.name}</text>
                <text className="hd2-pin-usage" x={placement.pinSide === "right" ? CONNECTOR_WIDTH - 16 : 16} y={y + 15} textAnchor={placement.pinSide === "right" ? "end" : "start"}>{usage}</text>
                <circle className={`hd2-pin-port${usage > 0 ? " is-used" : ""}`} cx={pinX} cy={y + PIN_ROW_HEIGHT / 2} r="5" />
                <circle
                  className="hd2-pin-hit"
                  cx={pinX}
                  cy={y + PIN_ROW_HEIGHT / 2}
                  r="13"
                  aria-label={`${connector.reference} 핀 ${pin.number}`}
                  onPointerDown={(event) => beginConnection(event, { componentId: connector.id, pinId: pin.id })}
                  onPointerUp={(event) => finishConnection(event, { componentId: connector.id, pinId: pin.id })}
                />
              </g>;
            })}
            </>}
            </g>
            {selected && selection.componentIds.length === 1 && <>
              <rect className="hd2-component-scale-selection" x={bounds.x - placement.position.x - 4} y={bounds.y - placement.position.y - 4} width={bounds.width + 8} height={bounds.height + 8} />
              <g
                className="hd2-component-scale-control"
                transform={`translate(${bounds.x - placement.position.x + bounds.width} ${bounds.y - placement.position.y + bounds.height})`}
                aria-label={`${connector.reference} 크기 조절`}
                onPointerDown={(event) => beginComponentScaleDrag(event, connector, placement)}
              >
                <rect className="hd2-component-scale-hit" x="-14" y="-14" width="28" height="28" />
                <rect className="hd2-component-scale-handle" x="-6" y="-6" width="12" height="12" rx="2" />
              </g>
            </>}
            <g
              className={`hd2-connector-label${selectedLabel?.componentId === connector.id && selectedLabel.label === "referenceLabel" ? " is-selected" : ""}`}
              aria-label={`${connector.reference} 참조 라벨`}
              transform={`translate(${referenceOffset.x} ${referenceOffset.y}) rotate(${placement.referenceLabel?.rotation ?? 0})`}
              onPointerDown={(event) => beginLabelDrag(event, connector.id, "referenceLabel", referenceOffset)}
            >
              <text className="hd2-symbol-reference" textAnchor="middle">{connector.reference} · {connector.partNumber}</text>
            </g>
            <g
              className={`hd2-connector-label${selectedLabel?.componentId === connector.id && selectedLabel.label === "nameLabel" ? " is-selected" : ""}`}
              aria-label={`${connector.reference} 이름 라벨`}
              transform={`translate(${nameOffset.x} ${nameOffset.y}) rotate(${placement.nameLabel?.rotation ?? 0})`}
              onPointerDown={(event) => beginLabelDrag(event, connector.id, "nameLabel", nameOffset)}
            >
              <text className="hd2-symbol-name" textAnchor="middle">{connector.name}</text>
            </g>
            {pinMapRows.length > 0 && <g
              className={`hd2-connector-pin-map${selectedPinMapComponentId === connector.id ? " is-selected" : ""}`}
              transform={`translate(${pinMapOffset.x} ${pinMapOffset.y})`}
              aria-label={`${connector.reference} 커넥터 핀맵`}
              onPointerDown={(event) => beginPinMapDrag(event, connector.id, pinMapOffset)}
            >
              <rect width="190" height={20 + pinMapRows.length * 16} rx="3" />
              <text className="hd2-connector-pin-map-title" x="7" y="13">PIN MAP · {connector.reference}</text>
              {pinMapRows.map((row, index) => <g key={`${row.connectionId}-${row.pinNumber}`} transform={`translate(0 ${20 + index * 16})`}>
                <line x1="0" y1="0" x2="190" y2="0" />
                <text x="7" y="12">{row.pinNumber}</text>
                <text x="29" y="12">{row.target}</text>
                <foreignObject x="82" y="0" width="86" height="16">
                  <PinMapWireName
                    value={row.reference}
                    ariaLabel={`${connector.reference} 핀 ${row.pinNumber} 선 이름`}
                    onCommit={(reference) => onRenameConnection(row.connectionId, reference)}
                  />
                </foreignObject>
                <circle cx="180" cy="8" r="4" style={{ fill: wireColorValue(splitWireColor(row.color).primary) }} />
                {splitWireColor(row.color).secondary && <path d="M180 4 A4 4 0 0 1 180 12 Z" style={{ fill: wireColorValue(splitWireColor(row.color).secondary) }} />}
              </g>)}
            </g>}
          </g>;
        })}
        <g className="hd2-cable-breakout-controls">
          {visibleHarness.cableRuns.filter((cableRun) => selection.cableRunIds.includes(cableRun.id)).map((cableRun) => {
            const geometry = cableRunGeometry(visibleHarness, cableRun.id);
            return <g key={cableRun.id}>
              <circle
                className="hd2-cable-breakout-handle"
                cx={geometry.fromJunction.x}
                cy={geometry.fromJunction.y}
                r="7"
                aria-label={`${cableRun.reference} 시작 탈피 길이 핸들`}
                onPointerDown={(event) => beginCableRunBreakoutDrag(event, cableRun.id, "from", geometry.fromJunction)}
              />
              <circle
                className="hd2-cable-breakout-handle"
                cx={geometry.toJunction.x}
                cy={geometry.toJunction.y}
                r="7"
                aria-label={`${cableRun.reference} 끝 탈피 길이 핸들`}
                onPointerDown={(event) => beginCableRunBreakoutDrag(event, cableRun.id, "to", geometry.toJunction)}
              />
            </g>;
          })}
        </g>
        {(visibleHarness.drawing.annotations ?? []).map((savedAnnotation) => {
          const annotation = previewAnnotation?.id === savedAnnotation.id ? previewAnnotation : savedAnnotation;
          const selected = selectedAnnotationId === annotation.id;
          return <DrawingAnnotation
            key={annotation.id}
            annotation={annotation}
            selected={selected}
            onMove={(event) => beginAnnotationDrag(event, annotation, "move")}
            onResize={(event) => beginAnnotationDrag(event, annotation, "resize")}
            onRotate={(event) => beginAnnotationDrag(event, annotation, "rotate")}
          />;
        })}
      </g>
    </svg>
    {(harness.sheetType ?? "harness") === "harness" && harness.components.length === 0 && (harness.drawing.annotations?.length ?? 0) === 0 && <div className="hd2-empty-canvas">
      <strong>빈 2D 도면</strong>
      <span>상단의 부품 추가 버튼으로 시작하세요.</span>
    </div>}
  </div>;
}

function HeatShrinkPathText({ heatShrink, path, center, onSelect, onCommit }: {
  heatShrink: CableHeatShrink2D;
  path: string;
  center: Point2D;
  onSelect: () => void;
  onCommit: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(heatShrink.text || heatShrink.reference);
  const cancelCommitRef = useRef(false);
  const pathId = `heat-shrink-text-${heatShrink.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  useEffect(() => setDraft(heatShrink.text || heatShrink.reference), [heatShrink.reference, heatShrink.text]);
  const commit = () => {
    if (!cancelCommitRef.current) {
      const text = draft.trim();
      if (text && text !== heatShrink.text) onCommit(text);
    }
    cancelCommitRef.current = false;
    setEditing(false);
  };

  return <>
    <defs><path id={pathId} d={path} /></defs>
    {!editing && <text
      className="hd2-heat-shrink-label"
      dy="0.34em"
      style={{ fill: heatShrink.textColor || "#ffffff" }}
      aria-label={`${heatShrink.reference} 텍스트`}
      onPointerDown={(event) => { event.stopPropagation(); onSelect(); }}
      onDoubleClick={(event) => { event.stopPropagation(); onSelect(); setEditing(true); }}
    ><textPath href={`#${pathId}`} startOffset="50%" textAnchor="middle">{heatShrink.text || heatShrink.reference}</textPath></text>}
    {editing && <foreignObject x={center.x - 65} y={center.y - 12} width="130" height="24" className="hd2-heat-shrink-input-wrap">
      <input
        className="hd2-heat-shrink-input"
        aria-label={`${heatShrink.reference} 텍스트 편집`}
        value={draft}
        autoFocus
        onPointerDown={(event) => event.stopPropagation()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            cancelCommitRef.current = true;
            setDraft(heatShrink.text || heatShrink.reference);
            event.currentTarget.blur();
          }
        }}
      />
    </foreignObject>}
  </>;
}

function DrawingAnnotation({ annotation, selected, onMove, onResize, onRotate }: {
  annotation: DrawingAnnotation2D;
  selected: boolean;
  onMove: (event: ReactPointerEvent<SVGGElement>) => void;
  onResize: (event: ReactPointerEvent<SVGRectElement>) => void;
  onRotate: (event: ReactPointerEvent<SVGCircleElement>) => void;
}) {
  const { x, y } = annotation.position;
  const label = annotation.text || annotation.kind;
  const rotation = annotation.rotation ?? 0;
  const center = { x: annotation.width / 2, y: annotation.height / 2 };
  const rotationRadius = Math.hypot(annotation.width, annotation.height) / 2 + 14;
  const maskId = `hd2-step-mask-${annotation.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const textAlign = annotation.textAlign ?? (annotation.kind === "label" ? "center" : "left");
  const textAnchor = textAlign === "center" ? "middle" : textAlign === "right" ? "end" : "start";
  const textX = textAlign === "center" ? annotation.width / 2 : textAlign === "right" ? annotation.width - 6 : 6;
  const textStyle = {
    fill: annotation.textColor,
    fontSize: annotation.fontSize,
    fontFamily: annotation.fontFamily ?? "Arial, sans-serif",
    fontStyle: annotation.italic ? "italic" : "normal",
    textDecoration: annotation.underline ? "underline" : "none",
  };
  return <g
    className={`hd2-annotation hd2-annotation--${annotation.kind}${selected ? " is-selected" : ""}`}
    transform={rotation === 0 ? `translate(${x} ${y})` : `translate(${x} ${y}) rotate(${rotation} ${center.x} ${center.y})`}
    aria-label={`${label} 주석`}
    onPointerDown={onMove}
  >
    <rect className="hd2-annotation-hit" width={annotation.width} height={annotation.height} />
    {annotation.kind === "label" && <>
      <rect width={annotation.width} height={annotation.height} rx={Math.min(8, annotation.height / 2)} style={{ fill: annotation.fillColor, stroke: annotation.strokeColor }} />
      <text x={textX} y={annotation.height / 2} dominantBaseline="middle" textAnchor={textAnchor} style={textStyle}>{annotation.text}</text>
    </>}
    {annotation.kind === "text" && <>
      {annotation.textBackgroundColor && <rect width={annotation.width} height={annotation.height} style={{ fill: annotation.textBackgroundColor, stroke: "none" }} />}
      <text x={textX} y={annotation.fontSize} textAnchor={textAnchor} style={textStyle}>{annotation.text}</text>
    </>}
    {annotation.kind === "rectangle" && <rect width={annotation.width} height={annotation.height} style={{ fill: annotation.fillColor, stroke: annotation.strokeColor }} />}
    {annotation.kind === "ellipse" && <ellipse cx={annotation.width / 2} cy={annotation.height / 2} rx={annotation.width / 2} ry={annotation.height / 2} style={{ fill: annotation.fillColor, stroke: annotation.strokeColor }} />}
    {annotation.kind === "image" && annotation.imageDataUrl && <image href={annotation.imageDataUrl} width={annotation.width} height={annotation.height} preserveAspectRatio="xMidYMid meet" />}
    {annotation.kind === "step" && annotation.drawing && <svg width={annotation.width} height={annotation.height} viewBox={`0 0 ${annotation.drawing.widthMm} ${annotation.drawing.heightMm}`} preserveAspectRatio="none">
      {annotation.drawing.imageDataUrl && <>
        <defs><mask id={maskId}><image href={annotation.drawing.imageDataUrl} width={annotation.drawing.widthMm} height={annotation.drawing.heightMm} preserveAspectRatio="none" /></mask></defs>
        <image href={annotation.drawing.imageDataUrl} width={annotation.drawing.widthMm} height={annotation.drawing.heightMm} preserveAspectRatio="none" />
        {annotation.tintColor && <rect width={annotation.drawing.widthMm} height={annotation.drawing.heightMm} fill={annotation.tintColor} opacity="0.48" mask={`url(#${maskId})`} />}
      </>}
      <g className="hd2-step-annotation-paths" style={{ stroke: annotation.tintColor || annotation.strokeColor, strokeWidth: partDrawingStrokeWidth(annotation.drawing.outlineStrength) }}>
        {annotation.drawing.paths.map((path, index) => <path key={index} d={drawingPathData(path)} />)}
      </g>
    </svg>}
    {selected && <>
      <rect className="hd2-annotation-selection" x="-3" y="-3" width={annotation.width + 6} height={annotation.height + 6} />
      <rect
        className="hd2-annotation-resize"
        x={annotation.width - 5}
        y={annotation.height - 5}
        width="10"
        height="10"
        aria-label={`${label} 크기 조정`}
        onPointerDown={(event) => onResize(event)}
      />
      {annotation.kind === "step" && <g className="hd2-annotation-rotation-guide">
        <circle cx={center.x} cy={center.y} r={rotationRadius} />
        <line x1={center.x} y1={center.y} x2={center.x} y2={center.y - rotationRadius} />
        <circle
          className="hd2-annotation-rotate"
          cx={center.x}
          cy={center.y - rotationRadius}
          r="7"
          aria-label={`${label} 회전`}
          onPointerDown={(event) => onRotate(event)}
        />
      </g>}
    </>}
  </g>;
}

function normalizeAngle(value: number) {
  return Math.round(((((value % 360) + 360) % 360)) * 10) / 10;
}

function connectorLabelOffset(connector: Connector2D, placement: ComponentPlacement2D, label: ConnectorLabelKind): Point2D {
  const saved = placement[label]?.offset;
  if (saved) return saved;
  const size = connectorSize(connector, placement);
  return label === "referenceLabel"
    ? { x: size.width / 2, y: -9 }
    : { x: size.width / 2, y: size.height + 14 };
}

function connectorPinMapRows(harness: Harness2D, componentId: string) {
  const connector = harness.components.find((item) => item.id === componentId);
  if (!connector) return [];
  return connector.pins.flatMap((pin) => harness.connections.flatMap((connection) => {
    const fromThisPin = connection.from.componentId === componentId && connection.from.pinId === pin.id;
    const toThisPin = connection.to.componentId === componentId && connection.to.pinId === pin.id;
    if (!fromThisPin && !toThisPin) return [];
    const otherEndpoint = fromThisPin ? connection.to : connection.from;
    if (otherEndpoint.freeEnd) return [{
      connectionId: connection.id,
      pinNumber: pin.number,
      target: `탈피 ${otherEndpoint.freeEnd.stripLengthMm} mm`,
      reference: connection.reference,
      color: connection.color,
    }];
    const otherConnector = harness.components.find((item) => item.id === otherEndpoint.componentId);
    const otherPin = otherConnector?.pins.find((item) => item.id === otherEndpoint.pinId);
    return [{
      connectionId: connection.id,
      pinNumber: pin.number,
      target: `${otherConnector?.reference ?? "?"}:${otherPin?.number ?? "?"}`,
      reference: connection.reference,
      color: connection.color,
    }];
  }));
}

function StrippedConductor({ endpoint, adjacent }: { endpoint: PinEndpoint2D; adjacent: Point2D }) {
  if (!endpoint.freeEnd || endpoint.freeEnd.stripLengthMm <= 0) return null;
  const start = endpoint.freeEnd.position;
  const distance = Math.hypot(adjacent.x - start.x, adjacent.y - start.y);
  if (distance === 0) return null;
  const length = Math.min(endpoint.freeEnd.stripLengthMm, distance);
  const end = {
    x: start.x + ((adjacent.x - start.x) / distance) * length,
    y: start.y + ((adjacent.y - start.y) / distance) * length,
  };
  return <g className="hd2-stripped-end">
    <path d={`M ${start.x} ${start.y} L ${end.x} ${end.y}`} />
    <circle cx={start.x} cy={start.y} r="2" />
  </g>;
}

function PinMapWireName({ value, ariaLabel, onCommit }: { value: string; ariaLabel: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return <input
    className="hd2-connector-pin-map-input"
    aria-label={ariaLabel}
    value={draft}
    onPointerDown={(event) => event.stopPropagation()}
    onClick={(event) => event.stopPropagation()}
    onChange={(event) => setDraft(event.target.value)}
    onBlur={commit}
    onKeyDown={(event) => {
      if (event.key === "Enter") event.currentTarget.blur();
      if (event.key === "Escape") {
        setDraft(value);
        event.currentTarget.blur();
      }
    }}
  />;
}

function drawingSheetDimensions(sheet: Settings2D["drawingSheet"]) {
  return sheet === "A3" ? { width: 420, height: 297 } : sheet === "A2" ? { width: 594, height: 420 } : { width: 841, height: 594 };
}

function CoverSheet({ sheet, projectNumber, projectName, harness, onUpdateProjectMetadata, onUpdateHarnessMetadata, onUpdateTitleBlock }: {
  sheet: Settings2D["drawingSheet"];
  projectNumber: string;
  projectName: string;
  harness: Harness2D;
  onUpdateProjectMetadata: Props["onUpdateProjectMetadata"];
  onUpdateHarnessMetadata: Props["onUpdateHarnessMetadata"];
  onUpdateTitleBlock: Props["onUpdateTitleBlock"];
}) {
  const dimensions = drawingSheetDimensions(sheet);
  const centerX = dimensions.width / 2;
  const blockWidth = dimensions.width * 0.66;
  const blockX = (dimensions.width - blockWidth) / 2;
  const blockY = dimensions.height * 0.7;
  const titleBlock = harness.drawing.titleBlock;
  return <g className="hd2-front-sheet hd2-cover-sheet" aria-label="프로젝트 표지">
    <rect className="hd2-front-sheet-page" width={dimensions.width} height={dimensions.height} />
    <rect className="hd2-front-sheet-frame" x="10" y="10" width={dimensions.width - 20} height={dimensions.height - 20} />
    <text className="hd2-cover-kicker" x={centerX} y={dimensions.height * 0.25} textAnchor="middle">HARNESS DESIGN DOCUMENT</text>
    <DirectEditText className="hd2-cover-title" x={centerX} y={dimensions.height * 0.37} width={blockWidth} fontSize={Math.max(20, dimensions.width * 0.045)} value={titleBlock?.drawingTitle ?? "HARNESS DOCUMENT PACKAGE"} ariaLabel="표지 문서 제목" onCommit={(drawingTitle) => onUpdateTitleBlock({ drawingTitle })} centered />
    <DirectEditText className="hd2-cover-project-name" x={centerX} y={dimensions.height * 0.48} width={blockWidth} fontSize={Math.max(15, dimensions.width * 0.032)} value={projectName} ariaLabel="표지 프로젝트 이름" onCommit={(name) => onUpdateProjectMetadata({ name })} centered />
    <DirectEditText className="hd2-cover-project-number" x={centerX} y={dimensions.height * 0.56} width={blockWidth} fontSize={Math.max(10, dimensions.width * 0.02)} value={projectNumber} ariaLabel="표지 프로젝트 번호" onCommit={(value) => onUpdateProjectMetadata({ projectNumber: value })} centered />
    <g className="hd2-cover-meta" transform={`translate(${blockX} ${blockY})`}>
      <rect width={blockWidth} height="72" />
      <line x1="0" y1="24" x2={blockWidth} y2="24" /><line x1="0" y1="48" x2={blockWidth} y2="48" />
      <line x1={blockWidth / 2} y1="0" x2={blockWidth / 2} y2="72" />
      <CoverField label="DOCUMENT NO." x={0} y={0} width={blockWidth / 2} value={harness.partNumber} ariaLabel="표지 문서 번호" onCommit={(partNumber) => onUpdateHarnessMetadata({ partNumber })} />
      <CoverField label="REVISION" x={blockWidth / 2} y={0} width={blockWidth / 2} value={harness.revision} ariaLabel="표지 리비전" onCommit={(revision) => onUpdateHarnessMetadata({ revision })} />
      <CoverField label="DATE" x={0} y={24} width={blockWidth / 2} value={titleBlock?.createdDate ?? ""} ariaLabel="표지 생성일" onCommit={(createdDate) => onUpdateTitleBlock({ createdDate })} />
      <CoverField label="DRAWN" x={blockWidth / 2} y={24} width={blockWidth / 2} value={titleBlock?.createdBy ?? ""} ariaLabel="표지 작성자" onCommit={(createdBy) => onUpdateTitleBlock({ createdBy })} />
      <CoverField label="CHECKED" x={0} y={48} width={blockWidth / 2} value={titleBlock?.reviewedBy ?? ""} ariaLabel="표지 검토자" onCommit={(reviewedBy) => onUpdateTitleBlock({ reviewedBy })} />
      <CoverField label="APPROVED" x={blockWidth / 2} y={48} width={blockWidth / 2} value={titleBlock?.approvedBy ?? ""} ariaLabel="표지 승인자" onCommit={(approvedBy) => onUpdateTitleBlock({ approvedBy })} />
    </g>
    <text className="hd2-front-sheet-hint" x={centerX} y={dimensions.height - 18} textAnchor="middle">수정할 항목을 더블클릭하세요</text>
  </g>;
}

function CoverField({ label, x, y, width, value, ariaLabel, onCommit }: { label: string; x: number; y: number; width: number; value: string; ariaLabel: string; onCommit: (value: string) => void }) {
  return <g transform={`translate(${x} ${y})`}>
    <text className="hd2-cover-field-label" x="5" y="9">{label}</text>
    <DirectEditText x={width * 0.34} y={17} width={width * 0.62} fontSize={9} value={value} ariaLabel={ariaLabel} onCommit={onCommit} />
  </g>;
}

function TableOfContentsSheet({ sheet, projectNumber, projectName, harness, entries, onUpdateProjectMetadata, onUpdateHarnessMetadata, onUpdateIndexedSheet, onUpdateTitleBlock }: {
  sheet: Settings2D["drawingSheet"];
  projectNumber: string;
  projectName: string;
  harness: Harness2D;
  entries: ProjectDocumentIndexEntry2D[];
  onUpdateProjectMetadata: Props["onUpdateProjectMetadata"];
  onUpdateHarnessMetadata: Props["onUpdateHarnessMetadata"];
  onUpdateIndexedSheet: NonNullable<Props["onUpdateIndexedSheet"]>;
  onUpdateTitleBlock: Props["onUpdateTitleBlock"];
}) {
  const dimensions = drawingSheetDimensions(sheet);
  const left = 20;
  const width = dimensions.width - 40;
  const headerY = 70;
  const rowHeight = Math.max(10, Math.min(16, (dimensions.height - headerY - 35) / Math.max(entries.length, 1)));
  const columns = [0, 0.09, 0.31, 0.51, 0.9, 1].map((ratio) => left + width * ratio);
  return <g className="hd2-front-sheet hd2-toc-sheet" aria-label="프로젝트 목차">
    <rect className="hd2-front-sheet-page" width={dimensions.width} height={dimensions.height} />
    <rect className="hd2-front-sheet-frame" x="10" y="10" width={dimensions.width - 20} height={dimensions.height - 20} />
    <DirectEditText className="hd2-toc-title" x={left} y={35} width={width * 0.55} fontSize={22} value={harness.drawing.titleBlock?.drawingTitle ?? "DRAWING INDEX"} ariaLabel="목차 제목" onCommit={(drawingTitle) => onUpdateTitleBlock({ drawingTitle })} />
    <DirectEditText className="hd2-toc-project" x={left} y={53} width={width * 0.55} fontSize={11} value={projectName} ariaLabel="목차 프로젝트 이름" onCommit={(name) => onUpdateProjectMetadata({ name })} />
    <DirectEditText className="hd2-toc-project-number" x={left + width * 0.62} y={35} width={width * 0.38} fontSize={11} value={projectNumber} ariaLabel="목차 프로젝트 번호" onCommit={(value) => onUpdateProjectMetadata({ projectNumber: value })} />
    <DirectEditText className="hd2-toc-revision" x={left + width * 0.62} y={53} width={width * 0.38} fontSize={9} value={harness.revision} ariaLabel="목차 리비전" onCommit={(revision) => onUpdateHarnessMetadata({ revision })} />
    <g className="hd2-toc-table">
      <rect x={left} y={headerY} width={width} height={rowHeight * (entries.length + 1)} />
      {columns.slice(1, -1).map((x) => <line key={x} x1={x} y1={headerY} x2={x} y2={headerY + rowHeight * (entries.length + 1)} />)}
      {Array.from({ length: entries.length }, (_, index) => <line key={index} x1={left} y1={headerY + rowHeight * (index + 1)} x2={left + width} y2={headerY + rowHeight * (index + 1)} />)}
      <text x={(columns[0] + columns[1]) / 2} y={headerY + rowHeight * 0.68} textAnchor="middle">PAGE</text>
      <text x={columns[1] + 5} y={headerY + rowHeight * 0.68}>GROUP</text>
      <text x={columns[2] + 5} y={headerY + rowHeight * 0.68}>DOCUMENT NO.</text>
      <text x={columns[3] + 5} y={headerY + rowHeight * 0.68}>TITLE</text>
      <text x={(columns[4] + columns[5]) / 2} y={headerY + rowHeight * 0.68} textAnchor="middle">REV.</text>
      {entries.map((entry, index) => {
        const y = headerY + rowHeight * (index + 1);
        return <g key={entry.sheetId}>
          <text x={(columns[0] + columns[1]) / 2} y={y + rowHeight * 0.68} textAnchor="middle">{entry.pageNumber}</text>
          <text x={columns[1] + 5} y={y + rowHeight * 0.68}>{entry.folderPath || "—"}</text>
          <DirectEditText x={columns[2] + 3} y={y + rowHeight * 0.68} width={columns[3] - columns[2] - 6} fontSize={Math.min(9, rowHeight * 0.65)} value={entry.partNumber} ariaLabel={`${entry.pageNumber}페이지 문서 번호`} onCommit={(partNumber) => onUpdateIndexedSheet(entry.sheetId, { partNumber })} />
          <DirectEditText x={columns[3] + 3} y={y + rowHeight * 0.68} width={columns[4] - columns[3] - 6} fontSize={Math.min(9, rowHeight * 0.65)} value={entry.name} ariaLabel={`${entry.pageNumber}페이지 제목`} onCommit={(name) => onUpdateIndexedSheet(entry.sheetId, { name })} />
          <DirectEditText x={columns[4]} y={y + rowHeight * 0.68} width={columns[5] - columns[4]} fontSize={Math.min(9, rowHeight * 0.65)} value={entry.revision} ariaLabel={`${entry.pageNumber}페이지 리비전`} onCommit={(revision) => onUpdateIndexedSheet(entry.sheetId, { revision })} centered />
        </g>;
      })}
    </g>
    <text className="hd2-front-sheet-hint" x={dimensions.width / 2} y={dimensions.height - 18} textAnchor="middle">목차는 현재 계층 순서에서 자동 생성됩니다 · 수정할 셀을 더블클릭하세요</text>
  </g>;
}

function DirectEditText({ x, y, width, fontSize, value, ariaLabel, onCommit, centered = false, className = "" }: { x: number; y: number; width: number; fontSize: number; value: string; ariaLabel: string; onCommit: (value: string) => void; centered?: boolean; className?: string }) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const cancelCommitRef = useRef(false);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (!cancelCommitRef.current && draft.trim() && draft.trim() !== value) onCommit(draft.trim());
    cancelCommitRef.current = false;
    setEditing(false);
  };
  if (!editing) return <text className={`hd2-direct-edit ${className}`} x={centered ? x : x + 2} y={y} fontSize={fontSize} textAnchor={centered ? "middle" : "start"} aria-label={ariaLabel} onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => { event.stopPropagation(); setEditing(true); }}>{draft || "—"}</text>;
  return <foreignObject x={centered ? x - width / 2 : x} y={y - fontSize} width={width} height={fontSize + 6} className="hd2-direct-input-wrap">
    <input aria-label={ariaLabel} value={draft} autoFocus style={{ fontSize }} onPointerDown={(event) => event.stopPropagation()} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => {
      if (event.key === "Enter") event.currentTarget.blur();
      if (event.key === "Escape") { cancelCommitRef.current = true; setDraft(value); event.currentTarget.blur(); }
    }} />
  </foreignObject>;
}

function DrawingTemplate({ sheet, projectNumber, projectName, harness, onUpdateProjectMetadata, onUpdateHarnessMetadata, onUpdateTitleBlock }: {
  sheet: Settings2D["drawingSheet"];
  projectNumber: string;
  projectName: string;
  harness: Harness2D;
  onUpdateProjectMetadata: Props["onUpdateProjectMetadata"];
  onUpdateHarnessMetadata: Props["onUpdateHarnessMetadata"];
  onUpdateTitleBlock: Props["onUpdateTitleBlock"];
}) {
  const dimensions = drawingSheetDimensions(sheet);
  const inset = 10;
  const titleWidth = Math.min(340, dimensions.width * 0.58);
  const titleHeight = 78;
  const titleX = dimensions.width - inset - titleWidth;
  const titleY = dimensions.height - inset - titleHeight;
  const columns = Array.from({ length: 8 }, (_, index) => ({
    label: String.fromCharCode(65 + index),
    x: inset + (dimensions.width - inset * 2) * (index + 0.5) / 8,
  }));
  const rows = Array.from({ length: 6 }, (_, index) => ({
    label: String(index + 1),
    y: inset + (dimensions.height - inset * 2) * (index + 0.5) / 6,
  }));
  return <g className="hd2-drawing-template" aria-label="도면 템플릿">
    <rect x="0" y="0" width={dimensions.width} height={dimensions.height} />
    <rect x={inset} y={inset} width={dimensions.width - inset * 2} height={dimensions.height - inset * 2} />
    {columns.map((column) => <text key={column.label} x={column.x} y="7" textAnchor="middle">{column.label}</text>)}
    {rows.map((row) => <text key={row.label} x="5" y={row.y} textAnchor="middle">{row.label}</text>)}
    <g className="hd2-title-block" transform={`translate(${titleX} ${titleY})`}>
      <rect width={titleWidth} height={titleHeight} />
      <line x1="0" y1="20" x2={titleWidth} y2="20" />
      <line x1="0" y1="40" x2={titleWidth} y2="40" />
      <line x1="0" y1="58" x2={titleWidth} y2="58" />
      <line x1={titleWidth * 0.72} y1="20" x2={titleWidth * 0.72} y2="58" />
      {[1, 2, 3].map((index) => <line key={index} x1={titleWidth * index / 4} y1="58" x2={titleWidth * index / 4} y2={titleHeight} />)}
      <text className="hd2-title-caption" x="5" y="7">PROJECT</text>
      <InlineTitleInput x={4} y={15} width={titleWidth * 0.25 - 6} value={projectNumber} ariaLabel="도면 프로젝트 번호" onCommit={(value) => onUpdateProjectMetadata({ projectNumber: value })} />
      <InlineTitleInput x={titleWidth * 0.25} y={15} width={titleWidth * 0.47 - 4} value={projectName} ariaLabel="도면 프로젝트 이름" onCommit={(value) => onUpdateProjectMetadata({ name: value })} />
      <text className="hd2-title-caption" x="5" y="27">HARNESS</text>
      <InlineTitleInput x={4} y={35} width={titleWidth * 0.25 - 6} value={harness.partNumber} ariaLabel="도면 하네스 파트번호" onCommit={(value) => onUpdateHarnessMetadata({ partNumber: value })} />
      <InlineTitleInput x={titleWidth * 0.25} y={35} width={titleWidth * 0.47 - 4} value={harness.name} ariaLabel="도면 하네스 이름" onCommit={(value) => onUpdateHarnessMetadata({ name: value })} />
      <text className="hd2-title-caption" x={titleWidth * 0.72 + 5} y="27">REVISION</text>
      <InlineTitleInput x={titleWidth * 0.72 + 4} y={35} width={titleWidth * 0.28 - 8} value={harness.revision} ariaLabel="도면 리비전" onCommit={(value) => onUpdateHarnessMetadata({ revision: value })} />
      <text className="hd2-title-caption" x="5" y="47">DRAWING TITLE</text>
      <InlineTitleInput x={4} y={55} width={titleWidth * 0.72 - 8} value={harness.drawing.titleBlock?.drawingTitle ?? "HARNESS ASSEMBLY DRAWING"} ariaLabel="도면 제목" onCommit={(value) => onUpdateTitleBlock({ drawingTitle: value })} />
      <text className="hd2-title-caption" x={titleWidth * 0.72 + 5} y="47">SHEET / UNIT</text>
      <text x={titleWidth * 0.72 + 5} y="55">{sheet} · mm</text>
      <TitleBlockField x={0} width={titleWidth / 4} label="DATE" value={harness.drawing.titleBlock?.createdDate ?? ""} ariaLabel="도면 생성일" onCommit={(value) => onUpdateTitleBlock({ createdDate: value })} />
      <TitleBlockField x={titleWidth / 4} width={titleWidth / 4} label="DRAWN" value={harness.drawing.titleBlock?.createdBy ?? ""} ariaLabel="도면 작성자" onCommit={(value) => onUpdateTitleBlock({ createdBy: value })} />
      <TitleBlockField x={titleWidth / 2} width={titleWidth / 4} label="CHECKED" value={harness.drawing.titleBlock?.reviewedBy ?? ""} ariaLabel="도면 검토자" onCommit={(value) => onUpdateTitleBlock({ reviewedBy: value })} />
      <TitleBlockField x={titleWidth * 3 / 4} width={titleWidth / 4} label="APPROVED" value={harness.drawing.titleBlock?.approvedBy ?? ""} ariaLabel="도면 승인자" onCommit={(value) => onUpdateTitleBlock({ approvedBy: value })} />
    </g>
  </g>;
}

function TitleBlockField({ x, width, label, value, ariaLabel, onCommit }: { x: number; width: number; label: string; value: string; ariaLabel: string; onCommit: (value: string) => void }) {
  return <g transform={`translate(${x} 58)`}>
    <text className="hd2-title-caption" x="4" y="7">{label}</text>
    <InlineTitleInput x={3} y={15} width={width - 6} value={value} ariaLabel={ariaLabel} onCommit={onCommit} centered />
  </g>;
}

function InlineTitleInput({ x, y, width, value, ariaLabel, onCommit, centered = false }: { x: number; y: number; width: number; value: string; ariaLabel: string; onCommit: (value: string) => void; centered?: boolean }) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const cancelCommitRef = useRef(false);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (!cancelCommitRef.current && draft !== value) onCommit(draft.trim());
    cancelCommitRef.current = false;
    setEditing(false);
  };
  if (!editing) return <text
    className="hd2-title-value"
    x={centered ? x + width / 2 : x + 2}
    y={y}
    textAnchor={centered ? "middle" : "start"}
    aria-label={ariaLabel}
    onPointerDown={(event) => event.stopPropagation()}
    onClick={(event) => { event.stopPropagation(); setEditing(true); }}
  >{draft || "—"}</text>;
  return <foreignObject x={x} y={y - 11} width={width} height="13" className="hd2-title-input-wrap">
    <input
      className={`hd2-title-input${centered ? " is-centered" : ""}`}
      aria-label={ariaLabel}
      value={draft}
      placeholder="—"
      autoFocus
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          cancelCommitRef.current = true;
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
    />
  </foreignObject>;
}

type RulerTick = {
  world: number;
  screen: number;
  label: string;
};

function buildRulerTicks(pan: number, zoom: number, unit: Settings2D["lengthUnit"], length: number): RulerTick[] {
  const millimeterSteps = unit === "in"
    ? [6.35, 12.7, 25.4, 50.8, 127, 254, 508, 1270, 2540]
    : [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];
  const step = millimeterSteps.find((candidate) => candidate * zoom >= 55) ?? millimeterSteps.at(-1)!;
  const first = Math.floor((-pan / zoom) / step) * step;
  const last = (length - pan) / zoom;
  const ticks: RulerTick[] = [];
  for (let world = first; world <= last; world += step) {
    const displayed = displayRulerValue(world, unit);
    ticks.push({ world, screen: pan + world * zoom, label: displayed });
  }
  return ticks;
}

function displayRulerValue(millimeters: number, unit: Settings2D["lengthUnit"]) {
  const value = unit === "in" ? millimeters / 25.4 : millimeters;
  const rounded = Math.abs(value) < 0.0001 ? 0 : value;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function isEditingElement(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

type SelectionRectangle = Point2D & { width: number; height: number };

function normalizedRectangle(start: Point2D, end: Point2D): SelectionRectangle {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function selectionInRectangle(harness: Harness2D, rectangle: SelectionRectangle): CanvasSelection {
  const containsPoint = (point: Point2D) => (
    point.x >= rectangle.x
    && point.x <= rectangle.x + rectangle.width
    && point.y >= rectangle.y
    && point.y <= rectangle.y + rectangle.height
  );
  const componentIds = harness.components.filter((component) => {
    const placement = harness.drawing.componentPlacements[component.id];
    const bounds = connectorBounds(component, placement);
    return bounds.x >= rectangle.x
      && bounds.y >= rectangle.y
      && bounds.x + bounds.width <= rectangle.x + rectangle.width
      && bounds.y + bounds.height <= rectangle.y + rectangle.height;
  }).map((component) => component.id);
  const connectionIds = harness.connections.filter((connection) => (
    containsPoint(endpointPosition(harness, connection.from))
    && containsPoint(endpointPosition(harness, connection.to))
  )).map((connection) => connection.id);
  const cableRunIds = harness.cableRuns.filter((cableRun) => {
    const geometry = cableRunGeometry(harness, cableRun.id);
    return containsPoint(geometry.fromJunction) && containsPoint(geometry.toJunction);
  }).map((cableRun) => cableRun.id);
  return { componentIds, connectionIds, cableRunIds };
}

function mergeSelection(current: CanvasSelection, added: CanvasSelection): CanvasSelection {
  return {
    componentIds: [...new Set([...current.componentIds, ...added.componentIds])],
    connectionIds: [...new Set([...current.connectionIds, ...added.connectionIds])],
    cableRunIds: [...new Set([...current.cableRunIds, ...added.cableRunIds])],
  };
}
