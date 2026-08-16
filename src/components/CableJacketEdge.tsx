import { useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, Position, useReactFlow, type Edge, type EdgeProps } from "@xyflow/react";
import { cableJacketGeometry } from "../domain/cableDrawing";
import type { HarnessSegment } from "../domain/types";

type CableDrawingRoute = NonNullable<HarnessSegment["drawingRoute"]>;

interface CableJacketEdgeData extends Record<string, unknown> {
  entityType: "segment";
  breakoutDisplayLength: number;
  route: CableDrawingRoute;
  gridSnap: boolean;
  gridSize: number;
  onSelect: (segmentId: string) => void;
  onContextMenu: (segmentId: string, x: number, y: number) => void;
  onRoutePreview: (segmentId: string, route: CableDrawingRoute) => void;
  onRouteCommit: (segmentId: string, route: CableDrawingRoute) => void;
  onRouteCancel: (segmentId: string) => void;
}

type CableJacketFlowEdge = Edge<CableJacketEdgeData, "cable-jacket">;

export function CableJacketEdge({ id, sourceX, sourceY, targetX, targetY, data, selected, label, style }: EdgeProps<CableJacketFlowEdge>) {
  const { screenToFlowPosition } = useReactFlow();
  const edgeData = data as CableJacketEdgeData;
  const route = edgeData.route;
  const geometry = cableJacketGeometry(sourceX, sourceY, targetX, targetY, edgeData.breakoutDisplayLength, route.offsetX, route.offsetY, route.sourceBreakoutLength, route.targetBreakoutLength);
  const dragStart = useRef<{ pointerX: number; pointerY: number; route: CableDrawingRoute } | null>(null);
  const resizeSide = useRef<"source" | "target" | null>(null);
  const currentRoute = useRef(route);
  const direction = targetX >= sourceX ? 1 : -1;
  const maximumBreakoutLength = Math.max(0, Math.abs(targetX - sourceX) - 40);
  const automaticBreakoutLength = Math.min(edgeData.breakoutDisplayLength, maximumBreakoutLength / 2);
  const sourcePosition = direction > 0 ? Position.Right : Position.Left;
  const targetPosition = direction > 0 ? Position.Left : Position.Right;
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: geometry.sourceX,
    sourceY: geometry.sourceY,
    sourcePosition,
    targetX: geometry.targetX,
    targetY: geometry.targetY,
    targetPosition,
    borderRadius: 8,
  });
  const snap = (value: number) => edgeData.gridSnap ? Math.round(value / edgeData.gridSize) * edgeData.gridSize : value;
  const startDrag = (event: ReactPointerEvent<SVGPathElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const pointer = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    dragStart.current = { pointerX: pointer.x, pointerY: pointer.y, route };
    currentRoute.current = route;
    edgeData.onSelect(id);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: ReactPointerEvent<SVGPathElement>) => {
    if (!dragStart.current) return;
    const pointer = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    currentRoute.current = {
      ...dragStart.current.route,
      offsetX: snap(dragStart.current.route.offsetX + pointer.x - dragStart.current.pointerX),
      offsetY: snap(dragStart.current.route.offsetY + pointer.y - dragStart.current.pointerY),
    };
    edgeData.onRoutePreview(id, currentRoute.current);
  };
  const startResize = (side: "source" | "target", event: ReactPointerEvent<SVGCircleElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    resizeSide.current = side;
    currentRoute.current = route;
    edgeData.onSelect(id);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveResize = (event: ReactPointerEvent<SVGCircleElement>) => {
    if (!resizeSide.current) return;
    const pointer = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const sourceLength = currentRoute.current.sourceBreakoutLength ?? automaticBreakoutLength;
    const targetLength = currentRoute.current.targetBreakoutLength ?? automaticBreakoutLength;
    if (resizeSide.current === "source") {
      const length = snap(direction * (pointer.x - sourceX - currentRoute.current.offsetX));
      currentRoute.current = { ...currentRoute.current, sourceBreakoutLength: Math.min(Math.max(0, length), Math.max(0, maximumBreakoutLength - targetLength)) };
    } else {
      const length = snap(direction * (targetX + currentRoute.current.offsetX - pointer.x));
      currentRoute.current = { ...currentRoute.current, targetBreakoutLength: Math.min(Math.max(0, length), Math.max(0, maximumBreakoutLength - sourceLength)) };
    }
    edgeData.onRoutePreview(id, currentRoute.current);
  };
  const finishRoute = (event: ReactPointerEvent<SVGElement>) => {
    if (!dragStart.current && !resizeSide.current) return;
    dragStart.current = null;
    resizeSide.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    edgeData.onRouteCommit(id, currentRoute.current);
  };
  const cancelRoute = () => {
    if (!dragStart.current && !resizeSide.current) return;
    dragStart.current = null;
    resizeSide.current = null;
    edgeData.onRouteCancel(id);
  };
  const openContextMenu = (event: ReactMouseEvent<SVGElement | HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    edgeData.onSelect(id);
    edgeData.onContextMenu(id, event.clientX, event.clientY);
  };
  return <>
    <BaseEdge id={id} path={path} style={style} interactionWidth={24} />
    {label && <EdgeLabelRenderer><div
      className="harness-cable-jacket-label nodrag nopan"
      style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: "all" }}
      onClick={(event) => { event.stopPropagation(); edgeData.onSelect(id); }}
      onContextMenu={openContextMenu}
    >{label}</div></EdgeLabelRenderer>}
    <path
      d={path}
      className="harness-cable-jacket-drag-zone nodrag nopan"
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={finishRoute}
      onPointerCancel={cancelRoute}
      onContextMenu={openContextMenu}
    />
    <circle
      cx={geometry.sourceX}
      cy={geometry.sourceY}
      r={5}
      className={`harness-cable-jacket-length-grip nodrag nopan ${selected ? "is-selected" : ""}`}
      onPointerDown={(event) => startResize("source", event)}
      onPointerMove={moveResize}
      onPointerUp={finishRoute}
      onPointerCancel={cancelRoute}
      onContextMenu={openContextMenu}
    />
    <circle
      cx={geometry.targetX}
      cy={geometry.targetY}
      r={5}
      className={`harness-cable-jacket-length-grip nodrag nopan ${selected ? "is-selected" : ""}`}
      onPointerDown={(event) => startResize("target", event)}
      onPointerMove={moveResize}
      onPointerUp={finishRoute}
      onPointerCancel={cancelRoute}
      onContextMenu={openContextMenu}
    />
  </>;
}
