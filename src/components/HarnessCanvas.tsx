import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Background, BackgroundVariant, ConnectionMode, Controls, Handle, MiniMap, Position, ReactFlow, useNodesState, type Connection, type Edge, type Node, type NodeProps, type ReactFlowInstance } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Box, Cable, Clipboard, Copy, GitFork, Maximize2, Pencil, Plus, RotateCcw, Trash2, Workflow } from "lucide-react";
import type { HarnessNode, HarnessSegment, PartSnapshot } from "../domain/types";
import { isCableRunSegment } from "../domain/cables";
import { pinConductorCapacity, pinConductorUsage, pinHasConductorCapacity } from "../domain/pinCapacity";
import { findUniqueSegmentRoute, hasRenderableEndpoints, hasSegmentRoute } from "../domain/pinmap";
import { nextConnectorReference } from "../domain/parts";
import { activeDrawingTemplate } from "../preferences";
import { useProjectStore } from "../store/projectStore";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import { CableJacketEdge } from "./CableJacketEdge";
import { DrawingSheetNode, type DrawingSheetFlowNode } from "./DrawingSheetNode";
import { EditableConductorEdge } from "./EditableConductorEdge";

type HarnessFlowNode = Node<{ model: HarnessNode; part?: PartSnapshot; pinStates: Array<{ id: string; usage: number; capacity: number }>; pinPosition: Position }, "harness">;
type CanvasFlowNode = HarnessFlowNode | DrawingSheetFlowNode;
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
  return <div className={`harness-node harness-node--${node.kind} ${selected ? "is-selected" : ""}`}>
    <Handle id="bundle-left" type="source" position={Position.Left} isConnectable={false} className="harness-node__bundle-handle" />
    <Handle id="bundle-right" type="source" position={Position.Right} isConnectable={false} className="harness-node__bundle-handle" />
    <div className="harness-node__head"><Icon size={12} /><strong>{node.reference}</strong><span>{node.pins.length ? `${node.pins.length}P` : node.kind.toUpperCase()}</span></div>
    <div className="harness-node__body"><strong>{node.label}</strong>{data.part && <span>{data.part.partNumber} · {data.part.manufacturer}</span>}{node.pins.length > 0 && <div className="harness-node__pins">{node.pins.map((pin) => {
      const state = data.pinStates.find((item) => item.id === pin.id) ?? { usage: 0, capacity: 1 };
      const occupied = state.usage > 0;
      const full = state.usage >= state.capacity;
      return <div key={pin.id} className={`harness-node__pin ${occupied ? "is-occupied" : ""} ${full ? "is-full" : ""}`}><Handle id={pinHandleId(pin.id)} type="source" position={data.pinPosition} isConnectable={!full} /><b>{pin.number}</b><span>{pin.name || "PIN"}</span><small>{state.usage}/{state.capacity}</small></div>;
    })}</div>}</div>
  </div>;
}

const nodeTypes = { harness: HarnessNodeView, "drawing-sheet": DrawingSheetNode };
const edgeTypes = { "editable-conductor": EditableConductorEdge, "cable-jacket": CableJacketEdge };
const cableBreakoutDisplayLength = 110;
type CableDrawingRoute = NonNullable<HarnessSegment["drawingRoute"]>;

export function HarnessCanvas({ harnessId, minimapTargetId }: { harnessId?: string; minimapTargetId?: string | null } = {}) {
  const { snapshot, activeHarnessId, selectedEntityId, selectEntity, updateProject, preferences, openConnectorPicker, openPinMapEditor, openCableRunEditor } = useProjectStore();
  const harness = snapshot?.project.harnesses.find((item) => item.id === (harnessId ?? activeHarnessId));
  const projectNodes = useMemo<CanvasFlowNode[]>(() => {
    if (!harness) return [];
    const connectorXs = harness.nodes.filter((node) => node.pins.length).map((node) => node.position.x);
    const centerX = connectorXs.length ? (Math.min(...connectorXs) + Math.max(...connectorXs)) / 2 : 0;
    const parts = snapshot?.project.parts ?? [];
    const template = activeDrawingTemplate(preferences);
    const drawingSheet: DrawingSheetFlowNode[] = template?.showOnCanvas ? [{
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
      },
      draggable: false,
      selectable: false,
      connectable: false,
      deletable: false,
      focusable: false,
      zIndex: -1000,
      ariaLabel: `${template.paper} 도면 템플릿`,
    }] : [];
    return [...drawingSheet, ...harness.nodes.map((node) => ({
      id: node.id,
      type: "harness" as const,
      position: node.position,
      selected: node.id === selectedEntityId,
      data: {
        model: node,
        part: snapshot?.project.parts.find((part) => part.id === node.partId),
        pinStates: node.pins.map((pin) => ({
          id: pin.id,
          usage: pinConductorUsage(harness, node.id, pin.id),
          capacity: pinConductorCapacity(parts, node, pin.id),
        })),
        pinPosition: node.position.x <= centerX ? Position.Right : Position.Left,
      },
    }))];
  }, [harness, preferences, selectedEntityId, snapshot?.project.name, snapshot?.project.parts, snapshot?.project.projectNumber]);
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasFlowNode>(projectNodes);
  const [flow, setFlow] = useState<ReactFlowInstance<CanvasFlowNode, Edge> | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; kind: "pane" | "node" | "segment" | "conductor"; id?: string } | null>(null);
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

  useEffect(() => setNodes(projectNodes), [projectNodes, setNodes]);
  const edges = useMemo<Edge[]>(() => {
    if (!harness) return [];
    const nodeById = new Map(harness.nodes.map((node) => [node.id, node]));
    const partById = new Map(snapshot?.project.parts.map((part) => [part.id, part]));
    const segmentEdges: Edge[] = harness.segments.filter(isCableRunSegment).map((segment) => {
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
          breakoutDisplayLength: cableBreakoutDisplayLength,
          route: drawingRoute,
          gridSnap: preferences.gridSnap,
          gridSize: preferences.gridSize,
          onSelect: (segmentId: string) => selectEntity(segmentId, "segment"),
          onContextMenu: (segmentId: string, x: number, y: number) => setMenu({ x, y, kind: "segment", id: segmentId }),
          onRoutePreview: previewCableRoute,
          onRouteCommit: commitCableRoute,
          onRouteCancel: clearCableRoutePreview,
        },
        labelStyle: { fontSize: 10, fontWeight: 650, fill: "var(--text-2)" },
        labelBgStyle: { fill: "var(--canvas)", fillOpacity: 0.94 },
        style: { strokeWidth: 5, stroke: "var(--wire-bundle)" },
        zIndex: 0,
      };
    });
    const conductorEdges: Edge[] = harness.conductors.flatMap((wire) => {
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
          manualBendX: wire.drawingRoute?.bendX,
          gridSnap: preferences.gridSnap,
          gridSize: preferences.gridSize,
          onBendCommit: commitConductorBend,
          onSelect: (wireId: string) => selectEntity(wireId, "conductor"),
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
        zIndex: wire.id === selectedEntityId ? 4 : 2,
      }];
    });
    return [...segmentEdges, ...conductorEdges];
  }, [cableRoutePreviews, clearCableRoutePreview, commitCableRoute, commitConductorBend, harness, preferences.gridSize, preferences.gridSnap, previewCableRoute, selectEntity, selectedEntityId, snapshot?.project.parts]);

  if (!harness) return <div className="canvas-empty"><Cable size={36} /><span>하네스를 선택하세요.</span></div>;

  const deleteEntity = (kind: "node" | "segment" | "conductor", id: string) => {
    if (!window.confirm(`선택한 ${kind === "node" ? "노드" : kind === "segment" ? "구간" : "핀 연결"}을 삭제하시겠습니까?`)) return;
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
      else current.conductors = current.conductors.filter((item) => item.id !== id);
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
      { label: "라이브러리에서 커넥터 추가", icon: <Plus size={12} />, action: () => openConnectorPicker() },
      { label: "멀티코어 케이블 추가", icon: <Cable size={12} />, disabled: harness.nodes.filter((node) => node.kind === "connector").length < 2, action: openCableRunEditor },
      { label: "핀맵 연결 추가", icon: <Cable size={12} />, disabled: harness.nodes.length < 2, action: () => openPinMapEditor() },
      { label: "전체 화면 맞춤", icon: <Maximize2 size={12} />, separatorBefore: true, action: () => void flow?.fitView({ duration: 200, padding: 0.15 }) },
    ];
    if (menu.kind === "node") {
      const node = harness.nodes.find((item) => item.id === menu.id);
      return [
        { label: "속성 열기", icon: <Pencil size={12} />, action: () => menu.id && selectEntity(menu.id, "node") },
        { label: "라이브러리 부품 변경", icon: <Box size={12} />, disabled: node?.kind !== "connector", action: () => menu.id && openConnectorPicker("replace", menu.id) },
        { label: "노드 복제", icon: <Copy size={12} />, action: () => menu.id && duplicateNode(menu.id) },
        { label: "참조명 복사", icon: <Clipboard size={12} />, action: () => node && void navigator.clipboard.writeText(node.reference) },
        { label: "노드 삭제", icon: <Trash2 size={12} />, danger: true, separatorBefore: true, action: () => menu.id && deleteEntity("node", menu.id) },
      ];
    }
    if (menu.kind === "conductor") {
      const wire = harness.conductors.find((item) => item.id === menu.id);
      const cableRun = wire?.cableRunId ? harness.segments.find((item) => item.id === wire.cableRunId) : undefined;
      return [
        { label: cableRun ? "케이블 수정" : "핀맵 연결 수정", icon: <Pencil size={12} />, action: () => cableRun ? openCableRunEditor(cableRun.id) : menu.id && openPinMapEditor(menu.id) },
        { label: "새 핀으로 연결 복제", icon: <Copy size={12} />, action: () => menu.id && openPinMapEditor(menu.id, true) },
        { label: "자동 경로로 복원", icon: <RotateCcw size={12} />, disabled: !wire?.drawingRoute, action: () => menu.id && resetConductorRoute(menu.id) },
        { label: "전선 참조명 복사", icon: <Clipboard size={12} />, action: () => wire && void navigator.clipboard.writeText(wire.reference) },
        { label: "핀 연결 삭제", icon: <Trash2 size={12} />, danger: true, separatorBefore: true, action: () => menu.id && deleteEntity("conductor", menu.id) },
      ];
    }
    const segment = harness.segments.find((item) => item.id === menu.id);
    return [
      { label: segment?.cablePartId ? "케이블 수정" : "경로 속성 열기", icon: <Pencil size={12} />, action: () => menu.id && (segment?.cablePartId ? openCableRunEditor(menu.id) : selectEntity(menu.id, "segment")) },
      { label: "외피 위치 자동 배치", icon: <RotateCcw size={12} />, disabled: !segment?.drawingRoute, action: () => menu.id && resetCableRoute(menu.id) },
      { label: "참조명 복사", icon: <Clipboard size={12} />, action: () => segment && void navigator.clipboard.writeText(segment.label) },
      { label: segment?.cablePartId ? "케이블 런 삭제" : "경로 삭제", icon: <Trash2 size={12} />, danger: true, separatorBefore: true, action: () => menu.id && deleteEntity("segment", menu.id) },
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

  return <div className="canvas-shell">
    <div className="canvas-breadcrumb"><span>{snapshot?.project.projectNumber}</span><b>/</b><strong>{harness.number}</strong><span>{harness.name}</span><em>REV {harness.revision}</em></div>
    <ReactFlow<CanvasFlowNode, Edge>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      connectionMode={ConnectionMode.Loose}
      onConnect={(connection) => {
        const preset = resolvePinConnection(connection);
        if (preset) openPinMapEditor(undefined, false, preset);
      }}
      isValidConnection={(connection) => resolvePinConnection(connection) !== null}
      onInit={setFlow}
      onNodesChange={onNodesChange}
      fitView
      snapToGrid={preferences.gridSnap}
      snapGrid={[preferences.gridSize, preferences.gridSize]}
      minZoom={0.2}
      maxZoom={2.5}
      zoomOnScroll={preferences.mouseWheelZoom !== "disabled"}
      onlyRenderVisibleElements
      onNodeClick={(_, node) => { if (node.id !== drawingSheetNodeId) selectEntity(node.id, "node"); }}
      onEdgeClick={(_, edge) => selectEntity(String(edge.data?.entityId ?? edge.id), edge.data?.entityType === "conductor" ? "conductor" : "segment")}
      onPaneClick={() => selectEntity(null)}
      onPaneContextMenu={(event) => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, kind: "pane" }); }}
      onNodeContextMenu={(event, node) => { if (node.id === drawingSheetNodeId) return; event.preventDefault(); selectEntity(node.id, "node"); setMenu({ x: event.clientX, y: event.clientY, kind: "node", id: node.id }); }}
      onEdgeContextMenu={(event, edge) => { const kind = edge.data?.entityType === "conductor" ? "conductor" : "segment"; const id = String(edge.data?.entityId ?? edge.id); event.preventDefault(); selectEntity(id, kind); setMenu({ x: event.clientX, y: event.clientY, kind, id }); }}
      onNodeDragStop={(_, flowNode) => void updateProject((project) => {
        const target = project.harnesses.find((item) => item.id === harness.id)?.nodes.find((item) => item.id === flowNode.id);
        if (target) target.position = { x: Math.round(flowNode.position.x), y: Math.round(flowNode.position.y) };
      })}
      proOptions={{ hideAttribution: false }}
    >
      {preferences.gridVisible && <Background variant={preferences.gridStyle === "lines" ? BackgroundVariant.Lines : BackgroundVariant.Dots} color="var(--grid-dot)" gap={preferences.gridSize} size={1} />}
      {minimapTargetId !== null && (minimapTarget
        ? createPortal(<MiniMap pannable zoomable nodeColor={(node) => node.id === drawingSheetNodeId ? "transparent" : "var(--accent)"} maskColor="color-mix(in srgb, var(--panel) 75%, transparent)" />, minimapTarget)
        : <MiniMap pannable zoomable nodeColor={(node) => node.id === drawingSheetNodeId ? "transparent" : "var(--accent)"} maskColor="color-mix(in srgb, var(--panel) 75%, transparent)" />)}
      <Controls showInteractive={false} />
    </ReactFlow>
    {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems()} onClose={() => setMenu(null)} />}
  </div>;
}
