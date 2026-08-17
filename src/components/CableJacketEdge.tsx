import { useEffect, useRef, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, Position, useReactFlow, type Edge, type EdgeProps } from "@xyflow/react";
import { cableJacketGeometry } from "../domain/cableDrawing";
import type { HarnessSegment } from "../domain/types";

type CableDrawingRoute = NonNullable<HarnessSegment["drawingRoute"]>;

interface CableJacketEdgeData extends Record<string, unknown> {
  entityType: "segment";
  locked: boolean;
  breakoutDisplayLength: number;
  route: CableDrawingRoute;
  gridSnap: boolean;
  gridSize: number;
  onSelect: (segmentId: string) => void;
  onEdit: (segmentId: string) => void;
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
  const routeChanged = useRef(false);
  const stopPointerTracking = useRef<() => void>(() => undefined);
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
  const centerX = (geometry.sourceX + geometry.targetX) / 2;
  const hitSegmentStyle = (x1: number, y1: number, x2: number, y2: number): CSSProperties => x1 === x2 ? {
    left: x1 - 12,
    top: Math.min(y1, y2),
    width: 24,
    height: Math.max(24, Math.abs(y2 - y1)),
  } : {
    left: Math.min(x1, x2),
    top: y1 - 12,
    width: Math.max(24, Math.abs(x2 - x1)),
    height: 24,
  };
  const snap = (value: number) => edgeData.gridSnap ? Math.round(value / edgeData.gridSize) * edgeData.gridSize : value;
  const finishRoute = () => {
    if (!dragStart.current && !resizeSide.current) return;
    dragStart.current = null;
    resizeSide.current = null;
    edgeData.onSelect(id);
    if (routeChanged.current) edgeData.onRouteCommit(id, currentRoute.current);
    routeChanged.current = false;
  };
  const moveDrag = (clientX: number, clientY: number) => {
    if (!dragStart.current) return;
    const pointer = screenToFlowPosition({ x: clientX, y: clientY });
    currentRoute.current = {
      ...dragStart.current.route,
      offsetX: snap(dragStart.current.route.offsetX + pointer.x - dragStart.current.pointerX),
      offsetY: snap(dragStart.current.route.offsetY + pointer.y - dragStart.current.pointerY),
    };
    routeChanged.current = true;
    edgeData.onRoutePreview(id, currentRoute.current);
  };
  const moveResize = (clientX: number, clientY: number) => {
    if (!resizeSide.current) return;
    const pointer = screenToFlowPosition({ x: clientX, y: clientY });
    const sourceLength = currentRoute.current.sourceBreakoutLength ?? automaticBreakoutLength;
    const targetLength = currentRoute.current.targetBreakoutLength ?? automaticBreakoutLength;
    if (resizeSide.current === "source") {
      const length = snap(direction * (pointer.x - sourceX - currentRoute.current.offsetX));
      currentRoute.current = { ...currentRoute.current, sourceBreakoutLength: Math.min(Math.max(0, length), Math.max(0, maximumBreakoutLength - targetLength)) };
    } else {
      const length = snap(direction * (targetX + currentRoute.current.offsetX - pointer.x));
      currentRoute.current = { ...currentRoute.current, targetBreakoutLength: Math.min(Math.max(0, length), Math.max(0, maximumBreakoutLength - sourceLength)) };
    }
    routeChanged.current = true;
    edgeData.onRoutePreview(id, currentRoute.current);
  };
  const beginPointerTracking = (pointerId: number) => {
    stopPointerTracking.current();
    const stop = () => {
      window.removeEventListener("pointermove", trackPointer, true);
      window.removeEventListener("pointerup", finishPointer, true);
      window.removeEventListener("pointercancel", cancelPointer, true);
      stopPointerTracking.current = () => undefined;
    };
    const trackPointer = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      event.preventDefault();
      if (resizeSide.current) moveResize(event.clientX, event.clientY);
      else moveDrag(event.clientX, event.clientY);
    };
    const finishPointer = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      stop();
      finishRoute();
    };
    const cancelPointer = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      stop();
      dragStart.current = null;
      resizeSide.current = null;
      routeChanged.current = false;
      edgeData.onRouteCancel(id);
    };
    window.addEventListener("pointermove", trackPointer, true);
    window.addEventListener("pointerup", finishPointer, true);
    window.addEventListener("pointercancel", cancelPointer, true);
    stopPointerTracking.current = stop;
  };
  useEffect(() => () => stopPointerTracking.current(), []);
  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (edgeData.locked || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const pointer = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    dragStart.current = { pointerX: pointer.x, pointerY: pointer.y, route };
    currentRoute.current = route;
    routeChanged.current = false;
    beginPointerTracking(event.pointerId);
  };
  const startResize = (side: "source" | "target", event: ReactPointerEvent<HTMLElement>) => {
    if (edgeData.locked || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    resizeSide.current = side;
    currentRoute.current = route;
    routeChanged.current = false;
    beginPointerTracking(event.pointerId);
  };
  const openContextMenu = (event: ReactMouseEvent<Element>) => {
    event.preventDefault();
    event.stopPropagation();
    edgeData.onSelect(id);
    edgeData.onContextMenu(id, event.clientX, event.clientY);
  };
  return <>
    <BaseEdge id={id} path={path} style={{ ...style, pointerEvents: "none" }} interactionWidth={0} />
    {!edgeData.locked && <circle className={`harness-cable-jacket-length-grip ${selected ? "is-selected" : ""}`} cx={geometry.sourceX} cy={geometry.sourceY} r={5} />}
    {!edgeData.locked && <circle className={`harness-cable-jacket-length-grip ${selected ? "is-selected" : ""}`} cx={geometry.targetX} cy={geometry.targetY} r={5} />}
    <EdgeLabelRenderer>
      {!edgeData.locked && [[geometry.sourceX, geometry.sourceY, centerX, geometry.sourceY], [centerX, geometry.sourceY, centerX, geometry.targetY], [centerX, geometry.targetY, geometry.targetX, geometry.targetY]].map(([x1, y1, x2, y2], index) => <div
        key={index}
        className="harness-cable-jacket-drag-zone nodrag nopan"
        style={hitSegmentStyle(x1, y1, x2, y2)}
        onPointerDown={startDrag}
        onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); edgeData.onEdit(id); }}
        onContextMenu={openContextMenu}
      />)}
      {!edgeData.locked && <button
        aria-label="외피 시작 길이 조절"
        className="harness-cable-jacket-length-hit nodrag nopan"
        style={{ left: geometry.sourceX - 8, top: geometry.sourceY - 8 }}
        onPointerDown={(event) => startResize("source", event)}
        onContextMenu={openContextMenu}
      />}
      {!edgeData.locked && <button
        aria-label="외피 끝 길이 조절"
        className="harness-cable-jacket-length-hit nodrag nopan"
        style={{ left: geometry.targetX - 8, top: geometry.targetY - 8 }}
        onPointerDown={(event) => startResize("target", event)}
        onContextMenu={openContextMenu}
      />}
      {label && <div
        className="harness-cable-jacket-label nodrag nopan"
        style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: "auto" }}
        onClick={(event) => { event.stopPropagation(); edgeData.onSelect(id); }}
        onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); if (!edgeData.locked) edgeData.onEdit(id); }}
        onContextMenu={openContextMenu}
      >{label}</div>}
    </EdgeLabelRenderer>
  </>;
}
