import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Background, BackgroundVariant, ConnectionMode, Controls, Handle, MiniMap, Panel, Position, ReactFlow, SelectionMode, useNodesState, type Connection, type Edge, type Node, type NodeProps, type ReactFlowInstance } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AlignHorizontalJustifyCenter, AlignHorizontalJustifyStart, AlignHorizontalSpaceBetween, AlignVerticalJustifyCenter, AlignVerticalJustifyStart, AlignVerticalSpaceBetween, Box, Cable, Clipboard, Copy, Eye, EyeOff, FlipHorizontal, FlipVertical, GitFork, Layers, LocateFixed, LockKeyhole, Maximize2, Pencil, Plus, RotateCcw, Search, Trash2, Unlock, Workflow, X } from "lucide-react";
import type { DrawingAnnotation, DrawingTableKind, HarnessNode, HarnessSegment, PartSnapshot, Point } from "../domain/types";
import { arrangeCanvasPoints, nudgeCanvasPoints, type CanvasLayoutCommand } from "../domain/canvasLayout";
import { sameCanvasEntitySelection, sameCanvasSelection } from "../domain/canvasSelection";
import { canvasLayerIds, canvasLayerZIndex, createCanvasLayers, updateCanvasLayer, type CanvasLayerId } from "../domain/canvasLayers";
import { isCableRunSegment } from "../domain/cables";
import { pinConductorCapacity, pinConductorUsage, pinHasConductorCapacity } from "../domain/pinCapacity";
import { findUniqueSegmentRoute, hasRenderableEndpoints, hasSegmentRoute } from "../domain/pinmap";
import { nextConnectorReference } from "../domain/parts";
import { buildHarnessDrawingSummary } from "../domain/drawingSummary";
import { searchPinDestinations } from "../domain/destinations";
import { activeDrawingTemplate } from "../preferences";
import { useProjectStore } from "../store/projectStore";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import { CableJacketEdge } from "./CableJacketEdge";
import { CanvasQuickEdit, type CanvasQuickEditTarget } from "./CanvasQuickEdit";
import { DrawingSheetNode, type DrawingSheetFlowNode } from "./DrawingSheetNode";
import { DrawingAnnotationNode, type DrawingAnnotationFlowNode } from "./DrawingAnnotationNode";
import { EditableConductorEdge } from "./EditableConductorEdge";

type HarnessFlowNode = Node<{ model: HarnessNode; part?: PartSnapshot; pinStates: Array<{ id: string; usage: number; capacity: number }>; pinPosition: Position; externallySelected: boolean; destinationMode: boolean; onEdit: (id: string, x: number, y: number) => void; onDestination: (nodeId: string, pinId: string, x: number, y: number) => void }, "harness">;
type CanvasFlowNode = HarnessFlowNode | DrawingSheetFlowNode | DrawingAnnotationFlowNode;
const drawingSheetNodeId = "__drawing-sheet";

function pinHandleId(pinId: string) {
  return `pin:${pinId}`;
}

function parsePinHandleId(handleId: string | null | undefined) {
  return handleId?.startsWith("pin:") ? handleId.slice(4) : undefined;
}

function conductorColor(color: string) {
  const colors: Record<string, string> = { BK: "#26323d", WH: "#d7dde2", RD: "#d23b3b", BU: "#3488c8", GN: "#43a06b", YE: "#d7ad32", OR: "#df7a2d", BR: "#84543b", GY: "#7b8792", VT: "#7b5bb5", PK: "#d86d9d" };
  return colors[color.trim().toUpperCase()] ?? "#54728a";
}

function HarnessNodeView({ data, selected }: NodeProps<HarnessFlowNode>) {
  const node = data.model;
  const Icon = node.kind === "connector" ? Box : node.kind === "splice" ? GitFork : Workflow;
  return <div className={`harness-node harness-node--${node.kind} ${selected || data.externallySelected ? "is-selected" : ""}`} onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); data.onEdit(node.id, event.clientX, event.clientY); }}>
    <Handle id="bundle-left" type="source" position={Position.Left} isConnectable={false} className="harness-node__bundle-handle" />
    <Handle id="bundle-right" type="source" position={Position.Right} isConnectable={false} className="harness-node__bundle-handle" />
    <div className="harness-node__head"><Icon size={12} /><strong>{node.reference}</strong><span>{node.pins.length ? `${node.pins.length}P` : node.kind.toUpperCase()}</span></div>
    <div className="harness-node__body"><strong>{node.label}</strong>{data.part && <span>{data.part.partNumber} · {data.part.manufacturer}</span>}{node.pins.length > 0 && <div className="harness-node__pins">{node.pins.map((pin) => {
      const state = data.pinStates.find((item) => item.id === pin.id) ?? { usage: 0, capacity: 1 };
      const occupied = state.usage > 0;
      const full = state.usage >= state.capacity;
      return <div key={pin.id} className={`harness-node__pin ${occupied ? "is-occupied" : ""} ${full ? "is-full" : ""} ${data.destinationMode ? "is-destination-mode" : ""}`}><Handle id={pinHandleId(pin.id)} type="source" position={data.pinPosition} isConnectable={!full} /><b>{pin.number}</b><span>{pin.name || "PIN"}</span><small>{state.usage}/{state.capacity}</small>{data.destinationMode && <button type="button" className="harness-node__destination nodrag nopan" title={full ? "핀 용량이 가득 찼습니다" : "목적지 핀 검색"} disabled={full} onClick={(event) => { event.preventDefault(); event.stopPropagation(); data.onDestination(node.id, pin.id, event.clientX, event.clientY); }}><LocateFixed size={9} /></button>}</div>;
    })}</div>}</div>
  </div>;
}

const nodeTypes = { harness: HarnessNodeView, "drawing-sheet": DrawingSheetNode, "drawing-annotation": DrawingAnnotationNode };
const edgeTypes = { "editable-conductor": EditableConductorEdge, "cable-jacket": CableJacketEdge };
const cableBreakoutDisplayLength = 110;
type CableDrawingRoute = NonNullable<HarnessSegment["drawingRoute"]>;

export function HarnessCanvas({ harnessId, minimapTargetId }: { harnessId?: string; minimapTargetId?: string | null } = {}) {
  const { snapshot, activeHarnessId, selectedEntityId, selectedEntityType, selectEntity, updateProject, preferences, openConnectorPicker, openPinMapEditor, openCableRunEditor } = useProjectStore();
  const harness = snapshot?.project.harnesses.find((item) => item.id === (harnessId ?? activeHarnessId));
  const canvasRef = useRef<HTMLDivElement>(null);
  const [selectedCanvasNodeIds, setSelectedCanvasNodeIds] = useState<string[]>([]);
  const [canvasLayers, setCanvasLayers] = useState(createCanvasLayers);
  const [layersOpen, setLayersOpen] = useState(false);
  const [destinationMode, setDestinationMode] = useState(false);
  const [destinationPicker, setDestinationPicker] = useState<{ nodeId: string; pinId: string; x: number; y: number; query: string } | null>(null);
  const [quickEdit, setQuickEdit] = useState<{ target: CanvasQuickEditTarget; x: number; y: number } | null>(null);
  const openNodeQuickEdit = useCallback((id: string, x: number, y: number) => {
    if (!harness || harness.releaseStatus === "released") return;
    const node = harness.nodes.find((item) => item.id === id);
    if (node) setQuickEdit({ x, y, target: { kind: "node", id: node.id, reference: node.reference, label: node.label } });
  }, [harness]);
  const openAnnotationQuickEdit = useCallback((id: string, x: number, y: number) => {
    if (!harness || harness.releaseStatus === "released") return;
    const annotation = harness.drawingAnnotations?.find((item) => item.id === id);
    if (annotation) setQuickEdit({ x, y, target: { kind: "annotation", id: annotation.id, annotationKind: annotation.kind, text: annotation.text, width: annotation.width, height: annotation.height, fillColor: annotation.fillColor, strokeColor: annotation.strokeColor } });
  }, [harness]);
  const openDestinationPicker = useCallback((nodeId: string, pinId: string, x: number, y: number) => {
    setDestinationPicker({ nodeId, pinId, x: Math.min(x + 8, window.innerWidth - 330), y: Math.min(y + 8, window.innerHeight - 360), query: "" });
  }, []);
  const commitDrawingTableOffset = useCallback((kind: DrawingTableKind, offset: Point) => {
    if (!harness || harness.releaseStatus === "released") return;
    void updateProject((project) => {
      const target = project.harnesses.find((item) => item.id === harness.id);
      if (!target) return;
      target.drawingTableOffsets = { ...(target.drawingTableOffsets ?? {}), [kind]: offset };
    });
  }, [harness, updateProject]);
  const commitAnnotationResize = useCallback((id: string, size: { x: number; y: number; width: number; height: number }) => {
    if (!harness || harness.releaseStatus === "released") return;
    void updateProject((project) => {
      const annotation = project.harnesses.find((item) => item.id === harness.id)?.drawingAnnotations?.find((item) => item.id === id);
      if (!annotation) return;
      annotation.position = { x: Math.round(size.x), y: Math.round(size.y) };
      annotation.width = Math.round(size.width);
      annotation.height = Math.round(size.height);
    });
  }, [harness, updateProject]);
  const projectNodes = useMemo<CanvasFlowNode[]>(() => {
    if (!harness) return [];
    const connectorXs = harness.nodes.filter((node) => node.pins.length).map((node) => node.position.x);
    const centerX = connectorXs.length ? (Math.min(...connectorXs) + Math.max(...connectorXs)) / 2 : 0;
    const parts = snapshot?.project.parts ?? [];
    const template = activeDrawingTemplate(preferences);
    const drawingSummary = snapshot ? buildHarnessDrawingSummary(snapshot.project, harness) : { notes: [], materials: [], lengths: [] };
    const drawingSheet: DrawingSheetFlowNode[] = template?.showOnCanvas && canvasLayers.sheet.visible ? [{
      id: drawingSheetNodeId,
      type: "drawing-sheet",
      position: { x: 0, y: 0 },
      data: {
        paper: template.paper,
        scalePercent: template.canvasScalePercent,
        projectNumber: snapshot?.project.projectNumber ?? "",
        projectName: snapshot?.project.name ?? "",
        harnessNumber: harness.number,
        harnessName: harness.name,
        revision: harness.revision,
        companyName: template.companyName,
        drawnBy: template.drawnBy,
        approvedBy: template.approvedBy,
        logoDataUrl: template.logoDataUrl,
        notes: drawingSummary.notes,
        materials: drawingSummary.materials,
        lengths: drawingSummary.lengths,
        tableOffsets: harness.drawingTableOffsets ?? {},
        locked: harness.releaseStatus === "released" || canvasLayers.sheet.locked,
        onTableOffsetCommit: commitDrawingTableOffset,
      },
      draggable: false,
      selectable: false,
      connectable: false,
      deletable: false,
      focusable: false,
      zIndex: canvasLayerZIndex.sheet,
      ariaLabel: `${template.paper} 도면 템플릿`,
    }] : [];
    const annotationNodes: DrawingAnnotationFlowNode[] = canvasLayers.annotations.visible ? (harness.drawingAnnotations ?? []).map((annotation) => ({
      id: annotation.id,
      type: "drawing-annotation",
      position: annotation.position,
      data: {
        model: annotation,
        externallySelected: annotation.id === selectedEntityId,
        onEdit: canvasLayers.annotations.locked ? () => undefined : openAnnotationQuickEdit,
        onResize: canvasLayers.annotations.locked || harness.releaseStatus === "released" ? undefined : commitAnnotationResize,
      },
      style: { width: annotation.width, height: annotation.height, zIndex: annotation.zIndex ?? 0 },
      zIndex: 8,
      draggable: !canvasLayers.annotations.locked && harness.releaseStatus !== "released",
    })) : [];
    const harnessNodes: HarnessFlowNode[] = canvasLayers.nodes.visible ? harness.nodes.map((node) => ({
      id: node.id,
      type: "harness" as const,
      position: node.position,
      data: {
        model: node,
        externallySelected: node.id === selectedEntityId,
        part: snapshot?.project.parts.find((part) => part.id === node.partId),
        pinStates: node.pins.map((pin) => ({
          id: pin.id,
          usage: pinConductorUsage(harness, node.id, pin.id),
          capacity: pinConductorCapacity(parts, node, pin.id),
        })),
        pinPosition: node.position.x <= centerX ? Position.Right : Position.Left,
        destinationMode,
        onEdit: canvasLayers.nodes.locked ? () => undefined : openNodeQuickEdit,
        onDestination: openDestinationPicker,
      },
      draggable: !canvasLayers.nodes.locked && harness.releaseStatus !== "released",
      connectable: !canvasLayers.nodes.locked && harness.releaseStatus !== "released",
    })) : [];
    return [...drawingSheet, ...harnessNodes, ...annotationNodes];
  }, [canvasLayers, commitAnnotationResize, commitDrawingTableOffset, destinationMode, harness, openAnnotationQuickEdit, openDestinationPicker, openNodeQuickEdit, preferences, selectedEntityId, snapshot?.project.name, snapshot?.project.parts, snapshot?.project.projectNumber]);
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasFlowNode>(projectNodes);
  const [flow, setFlow] = useState<ReactFlowInstance<CanvasFlowNode, Edge> | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; kind: "pane" | "node" | "segment" | "conductor" | "annotation"; id?: string } | null>(null);
  const [cableRoutePreviews, setCableRoutePreviews] = useState<Record<string, CableDrawingRoute>>({});
  const [minimapTarget, setMinimapTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (typeof minimapTargetId !== "string") {
      setMinimapTarget(null);
      return;
    }
    const syncTarget = () => setMinimapTarget(document.getElementById(minimapTargetId));
    syncTarget();
    const observer = new MutationObserver(syncTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [minimapTargetId]);
  const commitConductorBend = useCallback((wireId: string, bendX: number) => {
    if (!harness) return;
    void updateProject((project) => {
      const wire = project.harnesses.find((item) => item.id === harness.id)?.conductors.find((item) => item.id === wireId);
      if (wire) wire.drawingRoute = { bendX };
    });
  }, [harness, updateProject]);
  const previewCableRoute = useCallback((segmentId: string, route: CableDrawingRoute) => {
    setCableRoutePreviews((current) => ({ ...current, [segmentId]: route }));
  }, []);
  const clearCableRoutePreview = useCallback((segmentId: string) => {
    setCableRoutePreviews((current) => {
      const next = { ...current };
      delete next[segmentId];
      return next;
    });
  }, []);
  const commitCableRoute = useCallback((segmentId: string, route: CableDrawingRoute) => {
    if (!harness) return;
    void updateProject((project) => {
      const segment = project.harnesses.find((item) => item.id === harness.id)?.segments.find((item) => item.id === segmentId);
      if (!segment) return;
      const drawingRoute = {
        ...route,
        offsetX: Math.round(route.offsetX),
        offsetY: Math.round(route.offsetY),
        sourceBreakoutLength: route.sourceBreakoutLength === undefined ? undefined : Math.round(route.sourceBreakoutLength),
        targetBreakoutLength: route.targetBreakoutLength === undefined ? undefined : Math.round(route.targetBreakoutLength),
      };
      if (drawingRoute.offsetX === 0 && drawingRoute.offsetY === 0 && drawingRoute.sourceBreakoutLength === undefined && drawingRoute.targetBreakoutLength === undefined) delete segment.drawingRoute;
      else segment.drawingRoute = drawingRoute;
    }).finally(() => clearCableRoutePreview(segmentId));
  }, [clearCableRoutePreview, harness, updateProject]);

  useEffect(() => setNodes((current) => {
    const selected = new Map(current.map((node) => [node.id, Boolean(node.selected)]));
    return projectNodes.map((node) => ({ ...node, selected: selected.get(node.id) ?? false }));
  }), [projectNodes, setNodes]);
  useEffect(() => { setQuickEdit(null); setSelectedCanvasNodeIds([]); }, [harness?.id]);

  const selectedPositions = useCallback(() => {
    if (!harness) return {};
    const positions: Record<string, Point> = {};
    if (!canvasLayers.nodes.locked) for (const node of harness.nodes) if (selectedCanvasNodeIds.includes(node.id)) positions[node.id] = node.position;
    if (!canvasLayers.annotations.locked) for (const annotation of harness.drawingAnnotations ?? []) if (selectedCanvasNodeIds.includes(annotation.id)) positions[annotation.id] = annotation.position;
    return positions;
  }, [canvasLayers.annotations.locked, canvasLayers.nodes.locked, harness, selectedCanvasNodeIds]);
  const commitSelectedPositions = useCallback((positions: Record<string, Point>) => {
    if (!harness || harness.releaseStatus === "released") return;
    void updateProject((project) => {
      const current = project.harnesses.find((item) => item.id === harness.id);
      if (!current) return;
      for (const node of current.nodes) if (positions[node.id]) node.position = { x: Math.round(positions[node.id].x), y: Math.round(positions[node.id].y) };
      for (const annotation of current.drawingAnnotations ?? []) if (positions[annotation.id]) annotation.position = { x: Math.round(positions[annotation.id].x), y: Math.round(positions[annotation.id].y) };
    });
  }, [harness, updateProject]);
  const arrangeSelection = useCallback((command: CanvasLayoutCommand) => {
    commitSelectedPositions(arrangeCanvasPoints(selectedPositions(), command));
  }, [commitSelectedPositions, selectedPositions]);
  const handleSelectionChange = useCallback(({ nodes: selectedNodes }: { nodes: CanvasFlowNode[]; edges: Edge[] }) => {
    const ids = selectedNodes.filter((node) => node.id !== drawingSheetNodeId).map((node) => node.id);
    setSelectedCanvasNodeIds((current) => sameCanvasSelection(current, ids) ? current : ids);
    if (ids.length === 1) {
      const node = selectedNodes.find((item) => item.id === ids[0]);
      const type = node?.type === "drawing-annotation" ? "annotation" : "node";
      if (!sameCanvasEntitySelection(selectedEntityId, selectedEntityType, ids[0], type)) selectEntity(ids[0], type);
    }
  }, [selectEntity, selectedEntityId, selectedEntityType]);
  const handleCanvasKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
    if (event.key.toLocaleLowerCase() === "d" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      setDestinationMode((current) => !current);
      setDestinationPicker(null);
      return;
    }
    if (!selectedCanvasNodeIds.length || harness?.releaseStatus === "released" || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? preferences.gridSize : 1;
    const delta = { x: event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0, y: event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0 };
    commitSelectedPositions(nudgeCanvasPoints(selectedPositions(), delta));
  };
  useEffect(() => {
    const handleCommand = (event: Event) => {
      const command = (event as CustomEvent<string>).detail;
      if (command === "fitView") void flow?.fitView({ duration: 200, padding: 0.15 });
      if (command !== "deleteSelection" || !harness || !selectedEntityId || !selectedEntityType) return;
      if (!window.confirm("선택한 도면 객체를 삭제하시겠습니까?")) return;
      void updateProject((project) => {
        const current = project.harnesses.find((item) => item.id === harness.id);
        if (!current) return;
        if (selectedEntityType === "node") {
          const removedSegments = new Set(current.segments.filter((item) => item.fromNodeId === selectedEntityId || item.toNodeId === selectedEntityId).map((item) => item.id));
          current.nodes = current.nodes.filter((item) => item.id !== selectedEntityId);
          current.segments = current.segments.filter((item) => !removedSegments.has(item.id));
          current.conductors = current.conductors.filter((item) => item.from.nodeId !== selectedEntityId && item.to.nodeId !== selectedEntityId);
        } else if (selectedEntityType === "segment") {
          current.segments = current.segments.filter((item) => item.id !== selectedEntityId);
          current.conductors = current.conductors.filter((item) => item.cableRunId !== selectedEntityId);
        } else if (selectedEntityType === "conductor") current.conductors = current.conductors.filter((item) => item.id !== selectedEntityId);
        else current.drawingAnnotations = (current.drawingAnnotations ?? []).filter((item) => item.id !== selectedEntityId);
      }).then(() => selectEntity(null));
    };
    window.addEventListener("harness-command", handleCommand);
    return () => window.removeEventListener("harness-command", handleCommand);
  }, [flow, harness, selectEntity, selectedEntityId, selectedEntityType, updateProject]);
  const openConductorEditor = useCallback((wireId: string) => {
    if (!harness || harness.releaseStatus === "released") return;
    const wire = harness.conductors.find((item) => item.id === wireId);
    if (!wire) return;
    if (wire.cableRunId) openCableRunEditor(wire.cableRunId);
    else openPinMapEditor(wire.id);
  }, [harness, openCableRunEditor, openPinMapEditor]);
  const openSegmentEditor = useCallback((segmentId: string) => {
    if (!harness || harness.releaseStatus === "released") return;
    const segment = harness.segments.find((item) => item.id === segmentId);
    if (segment?.cablePartId) openCableRunEditor(segment.id);
  }, [harness, openCableRunEditor]);
  const saveQuickEdit = useCallback((draft: CanvasQuickEditTarget) => {
    if (!harness) return;
    void updateProject((project) => {
      const current = project.harnesses.find((item) => item.id === harness.id);
      if (!current) return;
      if (draft.kind === "node") {
        const node = current.nodes.find((item) => item.id === draft.id);
        if (node) { node.reference = draft.reference.trim(); node.label = draft.label.trim(); }
      } else if (draft.kind === "segment") {
        const segment = current.segments.find((item) => item.id === draft.id);
        if (segment) { segment.label = draft.label.trim(); segment.lengthMm = draft.lengthMm; }
      } else {
        const annotation = current.drawingAnnotations?.find((item) => item.id === draft.id);
        if (annotation) {
          annotation.text = draft.text;
          annotation.width = draft.width;
          annotation.height = draft.height;
          annotation.fillColor = draft.fillColor;
          annotation.strokeColor = draft.strokeColor;
        }
      }
    }).then(() => {
      setQuickEdit(null);
      selectEntity(draft.id, draft.kind === "node" ? "node" : draft.kind === "segment" ? "segment" : "annotation");
    });
  }, [harness, selectEntity, updateProject]);
  const edges = useMemo<Edge[]>(() => {
    if (!harness) return [];
    const nodeById = new Map(harness.nodes.map((node) => [node.id, node]));
    const partById = new Map(snapshot?.project.parts.map((part) => [part.id, part]));
    const segmentEdges: Edge[] = canvasLayers.cables.visible ? harness.segments.filter(isCableRunSegment).map((segment) => {
      const fromX = nodeById.get(segment.fromNodeId)?.position.x ?? 0;
      const toX = nodeById.get(segment.toNodeId)?.position.x ?? 0;
      const storedRoute = cableRoutePreviews[segment.id] ?? segment.drawingRoute;
      const drawingRoute: CableDrawingRoute = {
        offsetX: storedRoute?.offsetX ?? 0,
        offsetY: storedRoute?.offsetY ?? 0,
        sourceBreakoutLength: storedRoute?.sourceBreakoutLength,
        targetBreakoutLength: storedRoute?.targetBreakoutLength,
      };
      return {
        id: segment.id,
        source: segment.fromNodeId,
        sourceHandle: fromX <= toX ? "bundle-right" : "bundle-left",
        target: segment.toNodeId,
        targetHandle: fromX <= toX ? "bundle-left" : "bundle-right",
        type: "cable-jacket",
        selected: segment.id === selectedEntityId,
        label: `${segment.label}${segment.cablePartId ? ` · ${partById.get(segment.cablePartId)?.partNumber ?? "CABLE"}` : ""} · ${segment.lengthMm} mm`,
        className: "harness-edge",
        data: {
          entityType: "segment",
          locked: canvasLayers.cables.locked || harness.releaseStatus === "released",
          breakoutDisplayLength: cableBreakoutDisplayLength,
          route: drawingRoute,
          gridSnap: preferences.gridSnap,
          gridSize: preferences.gridSize,
          onSelect: (segmentId: string) => selectEntity(segmentId, "segment"),
          onEdit: openSegmentEditor,
          onContextMenu: (segmentId: string, x: number, y: number) => setMenu({ x, y, kind: "segment", id: segmentId }),
          onRoutePreview: previewCableRoute,
          onRouteCommit: commitCableRoute,
          onRouteCancel: clearCableRoutePreview,
        },
        labelStyle: { fontSize: 10, fontWeight: 650, fill: "var(--text-2)" },
        labelBgStyle: { fill: "var(--canvas)", fillOpacity: 0.94 },
        style: { strokeWidth: 5, stroke: "var(--wire-bundle)" },
        zIndex: canvasLayerZIndex.cables,
      };
    }) : [];
    const conductorEdges: Edge[] = canvasLayers.conductors.visible ? harness.conductors.flatMap((wire) => {
      if (!hasRenderableEndpoints(wire)) return [];
      const fromX = nodeById.get(wire.from.nodeId)?.position.x ?? 0;
      const toX = nodeById.get(wire.to.nodeId)?.position.x ?? 0;
      const fromBundleHandle = fromX <= toX ? "bundle-right" : "bundle-left";
      const toBundleHandle = fromX <= toX ? "bundle-left" : "bundle-right";
      const cableRun = wire.cableRunId ? harness.segments.find((segment) => segment.id === wire.cableRunId && segment.cablePartId) : undefined;
      const cableRoute = cableRun ? cableRoutePreviews[cableRun.id] ?? cableRun.drawingRoute ?? { offsetX: 0, offsetY: 0 } : undefined;
      return [{
        id: wire.id,
        source: wire.from.nodeId,
        sourceHandle: wire.from.pinId ? pinHandleId(wire.from.pinId) : fromBundleHandle,
        target: wire.to.nodeId,
        targetHandle: wire.to.pinId ? pinHandleId(wire.to.pinId) : toBundleHandle,
        type: "editable-conductor",
        label: wire.reference,
        selected: wire.id === selectedEntityId,
        className: "harness-conductor-edge",
        data: {
          entityType: "conductor",
          locked: canvasLayers.conductors.locked || harness.releaseStatus === "released",
          manualBendX: wire.drawingRoute?.bendX,
          gridSnap: preferences.gridSnap,
          gridSize: preferences.gridSize,
          onBendCommit: commitConductorBend,
          onSelect: (wireId: string) => selectEntity(wireId, "conductor"),
          onEdit: openConductorEditor,
          onContextMenu: (wireId: string, x: number, y: number) => setMenu({ x, y, kind: "conductor", id: wireId }),
          cableBreakout: cableRun ? {
            sourceBundleHandleId: fromBundleHandle,
            targetBundleHandleId: toBundleHandle,
            sourcePinConnected: Boolean(wire.from.pinId),
            targetPinConnected: Boolean(wire.to.pinId),
            displayLength: cableBreakoutDisplayLength,
            offsetX: cableRoute?.offsetX ?? 0,
            offsetY: cableRoute?.offsetY ?? 0,
            sourceBreakoutLength: cableRoute?.sourceBreakoutLength,
            targetBreakoutLength: cableRoute?.targetBreakoutLength,
          } : undefined,
        },
        labelStyle: { fontSize: 8, fontWeight: 700, fill: "var(--text-3)" },
        labelBgStyle: { fill: "var(--canvas)", fillOpacity: 0.9 },
        style: { strokeWidth: 2, stroke: conductorColor(wire.color), strokeDasharray: wire.shieldGroup ? "5 3" : undefined },
        zIndex: wire.id === selectedEntityId ? 4 : canvasLayerZIndex.conductors,
      }];
    }) : [];
    return [...segmentEdges, ...conductorEdges];
  }, [cableRoutePreviews, canvasLayers, clearCableRoutePreview, commitCableRoute, commitConductorBend, harness, openConductorEditor, openSegmentEditor, preferences.gridSize, preferences.gridSnap, previewCableRoute, selectEntity, selectedEntityId, snapshot?.project.parts]);

  if (!harness) return <div className="canvas-empty"><Cable size={36} /><span>하네스를 선택하세요.</span></div>;
  const released = harness.releaseStatus === "released";

  const deleteEntity = (kind: "node" | "segment" | "conductor" | "annotation", id: string) => {
    if (!window.confirm(`선택한 ${kind === "node" ? "노드" : kind === "segment" ? "구간" : kind === "conductor" ? "핀 연결" : "도면 주석"}을 삭제하시겠습니까?`)) return;
    void updateProject((project) => {
      const current = project.harnesses.find((item) => item.id === harness?.id);
      if (!current) return;
      if (kind === "node") {
        const removedSegments = new Set(current.segments.filter((item) => item.fromNodeId === id || item.toNodeId === id).map((item) => item.id));
        current.nodes = current.nodes.filter((item) => item.id !== id);
        current.segments = current.segments.filter((item) => !removedSegments.has(item.id));
        current.conductors = current.conductors.filter((item) => item.from.nodeId !== id && item.to.nodeId !== id);
      } else if (kind === "segment") {
        current.segments = current.segments.filter((item) => item.id !== id);
        current.conductors = current.conductors.filter((item) => item.cableRunId !== id);
      }
      else if (kind === "conductor") current.conductors = current.conductors.filter((item) => item.id !== id);
      else current.drawingAnnotations = (current.drawingAnnotations ?? []).filter((item) => item.id !== id);
    });
    selectEntity(null);
  };
  const duplicateNode = (id: string) => {
    let createdId: string | undefined;
    void updateProject((project) => {
      const current = project.harnesses.find((item) => item.id === harness?.id);
      const source = current?.nodes.find((item) => item.id === id);
      if (!current || !source) return;
      const copy = structuredClone(source);
      createdId = crypto.randomUUID();
      copy.id = createdId;
      copy.reference = copy.kind === "connector" ? nextConnectorReference(current.nodes) : `${copy.reference}_COPY`;
      copy.label = `${copy.label} COPY`;
      copy.position = { x: copy.position.x + 40, y: copy.position.y + 40 };
      copy.pins = copy.pins.map((pin) => ({ ...pin, id: crypto.randomUUID() }));
      current.nodes.push(copy);
    }).then(() => createdId && selectEntity(createdId, "node"));
  };
  const duplicateAnnotation = (id: string) => {
    let createdId: string | undefined;
    void updateProject((project) => {
      const current = project.harnesses.find((item) => item.id === harness?.id);
      const source = current?.drawingAnnotations?.find((item) => item.id === id);
      if (!current || !source) return;
      const copy: DrawingAnnotation = structuredClone(source);
      createdId = crypto.randomUUID();
      copy.id = createdId;
      copy.position = { x: copy.position.x + 24, y: copy.position.y + 24 };
      current.drawingAnnotations = [...(current.drawingAnnotations ?? []), copy];
    }).then(() => createdId && selectEntity(createdId, "annotation"));
  };
  const resetConductorRoute = (id: string) => {
    void updateProject((project) => {
      const wire = project.harnesses.find((item) => item.id === harness?.id)?.conductors.find((item) => item.id === id);
      if (wire) delete wire.drawingRoute;
    });
  };
  const resetCableRoute = (id: string) => {
    void updateProject((project) => {
      const segment = project.harnesses.find((item) => item.id === harness?.id)?.segments.find((item) => item.id === id);
      if (segment) delete segment.drawingRoute;
    });
    clearCableRoutePreview(id);
  };
  const menuItems = (): ContextMenuItem[] => {
    if (!menu) return [];
    if (menu.kind === "pane") return [
      { label: "라이브러리에서 커넥터 추가", icon: <Plus size={12} />, disabled: released, action: () => openConnectorPicker() },
      { label: "멀티코어 케이블 추가", icon: <Cable size={12} />, disabled: released || harness.nodes.filter((node) => node.kind === "connector").length < 2, action: openCableRunEditor },
      { label: "핀맵 연결 추가", icon: <Cable size={12} />, disabled: released || harness.nodes.length < 2, action: () => openPinMapEditor() },
      { label: "전체 화면 맞춤", icon: <Maximize2 size={12} />, separatorBefore: true, action: () => void flow?.fitView({ duration: 200, padding: 0.15 }) },
    ];
    if (menu.kind === "node") {
      const node = harness.nodes.find((item) => item.id === menu.id);
      return [
        { label: "속성 열기", icon: <Pencil size={12} />, action: () => menu.id && selectEntity(menu.id, "node") },
        { label: "라이브러리 부품 변경", icon: <Box size={12} />, disabled: released || node?.kind !== "connector", action: () => menu.id && openConnectorPicker("replace", menu.id) },
        { label: "노드 복제", icon: <Copy size={12} />, disabled: released, action: () => menu.id && duplicateNode(menu.id) },
        { label: "참조명 복사", icon: <Clipboard size={12} />, action: () => node && void navigator.clipboard.writeText(node.reference) },
        { label: "노드 삭제", icon: <Trash2 size={12} />, disabled: released, danger: true, separatorBefore: true, action: () => menu.id && deleteEntity("node", menu.id) },
      ];
    }
    if (menu.kind === "annotation") {
      const annotation = harness.drawingAnnotations?.find((item) => item.id === menu.id);
      const updateAnnotation = (mutator: (item: DrawingAnnotation) => void) => void updateProject((project) => {
        const item = project.harnesses.find((current) => current.id === harness.id)?.drawingAnnotations?.find((current) => current.id === menu.id);
        if (item) mutator(item);
      });
      return [
        { label: "속성 열기", icon: <Pencil size={12} />, action: () => menu.id && selectEntity(menu.id, "annotation") },
        { label: "주석 복제", icon: <Copy size={12} />, disabled: released, action: () => menu.id && duplicateAnnotation(menu.id) },
        { label: "내용 복사", icon: <Clipboard size={12} />, disabled: !annotation?.text, action: () => annotation && void navigator.clipboard.writeText(annotation.text) },
        { label: "맨 앞으로", icon: <Layers size={12} />, disabled: released, separatorBefore: true, action: () => updateAnnotation((item) => { item.zIndex = Math.max(0, ...(harness.drawingAnnotations ?? []).map((current) => current.zIndex ?? 0)) + 1; }) },
        { label: "맨 뒤로", icon: <Layers size={12} />, disabled: released, action: () => updateAnnotation((item) => { item.zIndex = Math.min(0, ...(harness.drawingAnnotations ?? []).map((current) => current.zIndex ?? 0)) - 1; }) },
        { label: "좌우 뒤집기", icon: <FlipHorizontal size={12} />, disabled: released || annotation?.kind !== "image", action: () => updateAnnotation((item) => { item.flippedX = !item.flippedX; }) },
        { label: "상하 뒤집기", icon: <FlipVertical size={12} />, disabled: released || annotation?.kind !== "image", action: () => updateAnnotation((item) => { item.flippedY = !item.flippedY; }) },
        { label: "주석 삭제", icon: <Trash2 size={12} />, disabled: released, danger: true, separatorBefore: true, action: () => menu.id && deleteEntity("annotation", menu.id) },
      ];
    }
    if (menu.kind === "conductor") {
      const wire = harness.conductors.find((item) => item.id === menu.id);
      const cableRun = wire?.cableRunId ? harness.segments.find((item) => item.id === wire.cableRunId) : undefined;
      return [
        { label: cableRun ? "케이블 수정" : "핀맵 연결 수정", icon: <Pencil size={12} />, disabled: released, action: () => cableRun ? openCableRunEditor(cableRun.id) : menu.id && openPinMapEditor(menu.id) },
        { label: "새 핀으로 연결 복제", icon: <Copy size={12} />, disabled: released, action: () => menu.id && openPinMapEditor(menu.id, true) },
        { label: "자동 경로로 복원", icon: <RotateCcw size={12} />, disabled: released || !wire?.drawingRoute, action: () => menu.id && resetConductorRoute(menu.id) },
        { label: "전선 참조명 복사", icon: <Clipboard size={12} />, action: () => wire && void navigator.clipboard.writeText(wire.reference) },
        { label: "핀 연결 삭제", icon: <Trash2 size={12} />, disabled: released, danger: true, separatorBefore: true, action: () => menu.id && deleteEntity("conductor", menu.id) },
      ];
    }
    const segment = harness.segments.find((item) => item.id === menu.id);
    return [
      { label: segment?.cablePartId ? "케이블 수정" : "경로 속성 열기", icon: <Pencil size={12} />, disabled: released, action: () => menu.id && (segment?.cablePartId ? openCableRunEditor(menu.id) : selectEntity(menu.id, "segment")) },
      { label: "외피 위치 자동 배치", icon: <RotateCcw size={12} />, disabled: released || !segment?.drawingRoute, action: () => menu.id && resetCableRoute(menu.id) },
      { label: "참조명 복사", icon: <Clipboard size={12} />, action: () => segment && void navigator.clipboard.writeText(segment.label) },
      { label: segment?.cablePartId ? "케이블 런 삭제" : "경로 삭제", icon: <Trash2 size={12} />, disabled: released, danger: true, separatorBefore: true, action: () => menu.id && deleteEntity("segment", menu.id) },
    ];
  };
  const resolvePinConnection = (connection: Pick<Connection, "source" | "target" | "sourceHandle" | "targetHandle"> | Pick<Edge, "source" | "target" | "sourceHandle" | "targetHandle">) => {
    const fromPinId = parsePinHandleId(connection.sourceHandle);
    const toPinId = parsePinHandleId(connection.targetHandle);
    if (!connection.source || !connection.target || !fromPinId || !toPinId || connection.source === connection.target) return null;
    const parts = snapshot?.project.parts ?? [];
    if (!pinHasConductorCapacity(harness, parts, connection.source, fromPinId) || !pinHasConductorCapacity(harness, parts, connection.target, toPinId)) return null;
    const routeSegmentIds = findUniqueSegmentRoute(harness, connection.source, connection.target);
    return {
      fromNodeId: connection.source,
      fromPinId,
      toNodeId: connection.target,
      toPinId,
      routeSegmentIds,
      createDirectSegment: !hasSegmentRoute(harness, connection.source, connection.target),
    };
  };
  const destinationResults = destinationPicker
    ? searchPinDestinations(harness, snapshot?.project.parts ?? [], destinationPicker.nodeId, destinationPicker.query)
    : [];
  const chooseDestination = (nodeId: string, pinId: string) => {
    if (!destinationPicker) return;
    const preset = resolvePinConnection({
      source: destinationPicker.nodeId,
      sourceHandle: pinHandleId(destinationPicker.pinId),
      target: nodeId,
      targetHandle: pinHandleId(pinId),
    });
    setDestinationPicker(null);
    if (preset) openPinMapEditor(undefined, false, preset);
  };

  return <div className="canvas-shell" ref={canvasRef} tabIndex={0} onKeyDown={handleCanvasKeyDown} onPointerDown={() => canvasRef.current?.focus()}>
    <div className="canvas-breadcrumb"><span>{snapshot?.project.projectNumber}</span><b>/</b><strong>{harness.number}</strong><span>{harness.name}</span><em>REV {harness.revision}</em>{released && <em>RELEASED</em>}</div>
    <ReactFlow<CanvasFlowNode, Edge>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      connectionMode={ConnectionMode.Loose}
      nodesDraggable={!released}
      nodesConnectable={!released}
      onConnect={(connection) => {
        const preset = released || canvasLayers.nodes.locked ? null : resolvePinConnection(connection);
        if (preset) openPinMapEditor(undefined, false, preset);
      }}
      isValidConnection={(connection) => !released && !canvasLayers.nodes.locked && resolvePinConnection(connection) !== null}
      onInit={setFlow}
      onNodesChange={onNodesChange}
      onSelectionChange={handleSelectionChange}
      onSelectionDragStop={(_, selectedNodes) => commitSelectedPositions(Object.fromEntries(selectedNodes.filter((node) => node.id !== drawingSheetNodeId).map((node) => [node.id, node.position])))}
      fitView
      snapToGrid={preferences.gridSnap}
      snapGrid={[preferences.gridSize, preferences.gridSize]}
      minZoom={0.2}
      maxZoom={2.5}
      zoomOnDoubleClick={false}
      zoomOnScroll={preferences.mouseWheelZoom !== "disabled"}
      onlyRenderVisibleElements
      selectionOnDrag
      selectionMode={SelectionMode.Partial}
      selectionKeyCode="Shift"
      multiSelectionKeyCode={["Meta", "Control"]}
      panOnDrag={[1, 2]}
      deleteKeyCode={null}
      onNodeClick={(_, node) => { if (node.id !== drawingSheetNodeId && selectedCanvasNodeIds.length <= 1) selectEntity(node.id, node.type === "drawing-annotation" ? "annotation" : "node"); }}
      onEdgeClick={(_, edge) => { setSelectedCanvasNodeIds([]); selectEntity(String(edge.data?.entityId ?? edge.id), edge.data?.entityType === "conductor" ? "conductor" : "segment"); }}
      onEdgeDoubleClick={(event, edge) => {
        event.preventDefault();
        const id = String(edge.data?.entityId ?? edge.id);
        if (edge.data?.entityType === "conductor") openConductorEditor(id);
        else openSegmentEditor(id);
      }}
      onPaneClick={() => { setSelectedCanvasNodeIds([]); selectEntity(null); }}
      onPaneContextMenu={(event) => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, kind: "pane" }); }}
      onNodeContextMenu={(event, node) => { if (node.id === drawingSheetNodeId) return; const kind = node.type === "drawing-annotation" ? "annotation" : "node"; event.preventDefault(); selectEntity(node.id, kind); setMenu({ x: event.clientX, y: event.clientY, kind, id: node.id }); }}
      onEdgeContextMenu={(event, edge) => { const kind = edge.data?.entityType === "conductor" ? "conductor" : "segment"; const id = String(edge.data?.entityId ?? edge.id); event.preventDefault(); selectEntity(id, kind); setMenu({ x: event.clientX, y: event.clientY, kind, id }); }}
      onNodeDragStop={(_, flowNode) => selectedCanvasNodeIds.length > 1 || (flowNode.type === "drawing-annotation" ? canvasLayers.annotations.locked : canvasLayers.nodes.locked) ? undefined : void updateProject((project) => {
        const current = project.harnesses.find((item) => item.id === harness.id);
        const target = flowNode.type === "drawing-annotation"
          ? current?.drawingAnnotations?.find((item) => item.id === flowNode.id)
          : current?.nodes.find((item) => item.id === flowNode.id);
        if (target) target.position = { x: Math.round(flowNode.position.x), y: Math.round(flowNode.position.y) };
      })}
      proOptions={{ hideAttribution: false }}
    >
      {preferences.gridVisible && <Background variant={preferences.gridStyle === "lines" ? BackgroundVariant.Lines : BackgroundVariant.Dots} color="var(--grid-dot)" gap={preferences.gridSize} size={1} />}
      {selectedCanvasNodeIds.length > 1 && <Panel position="top-center" className="cad-selection-toolbar">
        <strong>{selectedCanvasNodeIds.length}개 선택</strong>
        <button title="왼쪽 정렬" onClick={() => arrangeSelection("alignLeft")}><AlignHorizontalJustifyStart size={12} /></button>
        <button title="가로 가운데 정렬" onClick={() => arrangeSelection("alignCenter")}><AlignHorizontalJustifyCenter size={12} /></button>
        <button title="위쪽 정렬" onClick={() => arrangeSelection("alignTop")}><AlignVerticalJustifyStart size={12} /></button>
        <button title="세로 가운데 정렬" onClick={() => arrangeSelection("alignMiddle")}><AlignVerticalJustifyCenter size={12} /></button>
        <button title="가로 동일 간격" disabled={selectedCanvasNodeIds.length < 3} onClick={() => arrangeSelection("distributeHorizontal")}><AlignHorizontalSpaceBetween size={12} /></button>
        <button title="세로 동일 간격" disabled={selectedCanvasNodeIds.length < 3} onClick={() => arrangeSelection("distributeVertical")}><AlignVerticalSpaceBetween size={12} /></button>
        <span>방향키 1px · Shift+방향키 그리드</span>
      </Panel>}
      <Panel position="top-right" className="cad-layer-manager nodrag nopan">
        <button className={destinationMode ? "active" : ""} title="목적지 핀 검색 (D)" onClick={() => { setDestinationMode((current) => !current); setDestinationPicker(null); }}><LocateFixed size={13} />목적지 <kbd>D</kbd></button>
        <button className={layersOpen ? "active" : ""} title="도면 레이어" onClick={() => setLayersOpen((current) => !current)}><Layers size={13} />레이어</button>
        {layersOpen && <div className="cad-layer-manager__menu">
          <header><strong>DRAWING LAYERS</strong><span>창별 상태</span></header>
          {canvasLayerIds.map((id) => <div key={id}>
            <span>{id === "sheet" ? "도면/표" : id === "nodes" ? "하우징/분기" : id === "cables" ? "케이블 외피" : id === "conductors" ? "내선" : "주석/이미지"}</span>
            <button title={`${id} 표시`} className={canvasLayers[id].visible ? "active" : ""} onClick={() => setCanvasLayers((current) => updateCanvasLayer(current, id as CanvasLayerId, "visible"))}>{canvasLayers[id].visible ? <Eye size={12} /> : <EyeOff size={12} />}</button>
            <button title={`${id} 잠금`} className={canvasLayers[id].locked ? "active is-locked" : ""} onClick={() => setCanvasLayers((current) => updateCanvasLayer(current, id as CanvasLayerId, "locked"))}>{canvasLayers[id].locked ? <LockKeyhole size={12} /> : <Unlock size={12} />}</button>
          </div>)}
        </div>}
      </Panel>
      {minimapTargetId !== null && (minimapTarget
        ? createPortal(<MiniMap pannable zoomable nodeColor={(node) => node.id === drawingSheetNodeId ? "transparent" : "var(--accent)"} maskColor="color-mix(in srgb, var(--panel) 75%, transparent)" />, minimapTarget)
        : <MiniMap pannable zoomable nodeColor={(node) => node.id === drawingSheetNodeId ? "transparent" : "var(--accent)"} maskColor="color-mix(in srgb, var(--panel) 75%, transparent)" />)}
      <Controls showInteractive={false} />
    </ReactFlow>
    {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems()} onClose={() => setMenu(null)} />}
    {quickEdit && <CanvasQuickEdit key={`${quickEdit.target.kind}-${quickEdit.target.id}`} {...quickEdit} onCancel={() => setQuickEdit(null)} onSave={saveQuickEdit} />}
    {destinationPicker && createPortal(<section className="destination-picker nodrag nopan" role="dialog" aria-label="목적지 핀 검색" style={{ left: destinationPicker.x, top: destinationPicker.y }}>
      <header><div><LocateFixed size={13} /><strong>{harness.nodes.find((node) => node.id === destinationPicker.nodeId)?.reference} · {harness.nodes.find((node) => node.id === destinationPicker.nodeId)?.pins.find((pin) => pin.id === destinationPicker.pinId)?.number}</strong></div><button type="button" title="닫기" onClick={() => setDestinationPicker(null)}><X size={12} /></button></header>
      <label><Search size={12} /><input autoFocus value={destinationPicker.query} placeholder="커넥터, 부품번호, 핀 또는 신호 검색" onChange={(event) => setDestinationPicker((current) => current ? { ...current, query: event.target.value } : null)} onKeyDown={(event) => { if (event.key === "Escape") setDestinationPicker(null); if (event.key === "Enter" && destinationResults[0]) chooseDestination(destinationResults[0].nodeId, destinationResults[0].pinId); }} /></label>
      <div>{destinationResults.length ? destinationResults.map((item) => <button type="button" key={`${item.nodeId}:${item.pinId}`} onClick={() => chooseDestination(item.nodeId, item.pinId)}><strong>{item.nodeReference}</strong><b>{item.pinNumber}</b><span>{item.pinName || "PIN"}</span><small>{item.partNumber ?? item.nodeLabel}</small></button>) : <p>연결 가능한 목적지 핀이 없습니다.</p>}</div>
      <footer>Enter 첫 결과 연결 · Esc 닫기</footer>
    </section>, document.body)}
  </div>;
}
