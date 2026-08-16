import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { BaseEdge, useInternalNode, useReactFlow, type Edge, type EdgeProps, type InternalNode } from "@xyflow/react";
import { cableFanoutPath, cableJacketGeometry } from "../domain/cableDrawing";

interface CableBreakoutEdgeData {
  sourceBundleHandleId: string;
  targetBundleHandleId: string;
  sourcePinConnected: boolean;
  targetPinConnected: boolean;
  displayLength: number;
  offsetX: number;
  offsetY: number;
  sourceBreakoutLength?: number;
  targetBreakoutLength?: number;
}

export interface EditableConductorEdgeData extends Record<string, unknown> {
  entityType: "conductor";
  manualBendX?: number;
  gridSnap: boolean;
  gridSize: number;
  onBendCommit: (wireId: string, bendX: number) => void;
  onSelect: (wireId: string) => void;
  onContextMenu: (wireId: string, x: number, y: number) => void;
  cableBreakout?: CableBreakoutEdgeData;
}

export type EditableConductorFlowEdge = Edge<EditableConductorEdgeData, "editable-conductor">;

export function orthogonalConductorPath(sourceX: number, sourceY: number, targetX: number, targetY: number, bendX: number) {
  if (sourceY === targetY) return `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
  const firstDirection = Math.sign(bendX - sourceX) || 1;
  const verticalDirection = Math.sign(targetY - sourceY) || 1;
  const lastDirection = Math.sign(targetX - bendX) || 1;
  const radius = Math.min(8, Math.abs(bendX - sourceX), Math.abs(targetY - sourceY) / 2, Math.abs(targetX - bendX));
  return [
    `M ${sourceX} ${sourceY}`,
    `L ${bendX - firstDirection * radius} ${sourceY}`,
    `Q ${bendX} ${sourceY} ${bendX} ${sourceY + verticalDirection * radius}`,
    `L ${bendX} ${targetY - verticalDirection * radius}`,
    `Q ${bendX} ${targetY} ${bendX + lastDirection * radius} ${targetY}`,
    `L ${targetX} ${targetY}`,
  ].join(" ");
}

function handleCenter(node: InternalNode | undefined, handleId: string) {
  const handles = [...(node?.internals.handleBounds?.source ?? []), ...(node?.internals.handleBounds?.target ?? [])];
  const handle = handles.find((item) => item.id === handleId);
  if (!node || !handle) return null;
  return {
    x: node.internals.positionAbsolute.x + handle.x + handle.width / 2,
    y: node.internals.positionAbsolute.y + handle.y + handle.height / 2,
  };
}

export function EditableConductorEdge({ id, source, target, sourceX, sourceY, targetX, targetY, data, selected, label, labelStyle, labelBgStyle, style }: EdgeProps<EditableConductorFlowEdge>) {
  const { screenToFlowPosition } = useReactFlow();
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const edgeData = data as EditableConductorEdgeData;
  const automaticBendX = (sourceX + targetX) / 2;
  const [bendX, setBendX] = useState(edgeData.manualBendX ?? automaticBendX);
  const bendXRef = useRef(bendX);
  const dragging = useRef(false);

  useEffect(() => {
    if (!dragging.current) {
      const next = edgeData.manualBendX ?? automaticBendX;
      bendXRef.current = next;
      setBendX(next);
    }
  }, [automaticBendX, edgeData.manualBendX]);

  const moveBend = (event: ReactPointerEvent<SVGElement>) => {
    if (!dragging.current) return;
    const position = screenToFlowPosition(
      { x: event.clientX, y: event.clientY },
      edgeData.gridSnap ? { snapToGrid: true, snapGrid: [edgeData.gridSize, edgeData.gridSize] } : undefined,
    );
    bendXRef.current = position.x;
    setBendX(position.x);
  };
  const finishBend = (event: ReactPointerEvent<SVGElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    edgeData.onBendCommit(id, Math.round(bendXRef.current));
  };

  const sourceBundle = edgeData.cableBreakout ? handleCenter(sourceNode, edgeData.cableBreakout.sourceBundleHandleId) : null;
  const targetBundle = edgeData.cableBreakout ? handleCenter(targetNode, edgeData.cableBreakout.targetBundleHandleId) : null;
  const breakoutGeometry = sourceBundle && targetBundle && edgeData.cableBreakout
    ? cableJacketGeometry(sourceBundle.x, sourceBundle.y, targetBundle.x, targetBundle.y, edgeData.cableBreakout.displayLength, edgeData.cableBreakout.offsetX, edgeData.cableBreakout.offsetY, edgeData.cableBreakout.sourceBreakoutLength, edgeData.cableBreakout.targetBreakoutLength)
    : null;
  const cablePaths = breakoutGeometry && sourceBundle && targetBundle && edgeData.cableBreakout ? [
    edgeData.cableBreakout.sourcePinConnected ? cableFanoutPath(sourceX, sourceY, breakoutGeometry.sourceX, breakoutGeometry.sourceY) : "",
    edgeData.cableBreakout.targetPinConnected ? cableFanoutPath(breakoutGeometry.targetX, breakoutGeometry.targetY, targetX, targetY) : "",
  ].filter(Boolean) : [];
  const path = cablePaths.length ? cablePaths.join(" ") : orthogonalConductorPath(sourceX, sourceY, targetX, targetY, bendX);
  const cableLabelAtSource = Boolean(edgeData.cableBreakout?.sourcePinConnected);
  const labelX = cablePaths.length && breakoutGeometry ? (cableLabelAtSource ? sourceX + (breakoutGeometry.sourceX - sourceX) * 0.55 : targetX + (breakoutGeometry.targetX - targetX) * 0.55) : bendX - 16;
  const labelY = cablePaths.length ? (cableLabelAtSource ? sourceY : targetY) - 9 : (sourceY + targetY) / 2;
  const dragPath = `M ${bendX} ${sourceY} L ${bendX} ${targetY}`;
  const startBend = (event: ReactPointerEvent<SVGElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragging.current = true;
    edgeData.onSelect(id);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const openContextMenu = (event: ReactMouseEvent<SVGElement>) => {
    event.preventDefault();
    event.stopPropagation();
    edgeData.onSelect(id);
    edgeData.onContextMenu(id, event.clientX, event.clientY);
  };
  return <>
    <BaseEdge
      id={id}
      path={path}
      label={label}
      labelX={labelX}
      labelY={labelY}
      labelStyle={labelStyle}
      labelBgStyle={labelBgStyle}
      style={style}
      interactionWidth={12}
    />
    {!cablePaths.length && <path
      d={dragPath}
      className={`harness-conductor-drag-zone nodrag nopan ${edgeData.manualBendX !== undefined ? "is-manual" : ""}`}
      style={{ pointerEvents: "stroke" }}
      onPointerDown={startBend}
      onPointerMove={moveBend}
      onPointerUp={finishBend}
      onContextMenu={openContextMenu}
      onPointerCancel={() => {
        const next = edgeData.manualBendX ?? automaticBendX;
        dragging.current = false;
        bendXRef.current = next;
        setBendX(next);
      }}
    />}
    {!cablePaths.length && selected && sourceY !== targetY && <circle
      className="harness-conductor-bend-grip nodrag nopan"
      cx={bendX}
      cy={(sourceY + targetY) / 2}
      r={5}
      onPointerDown={startBend}
      onPointerMove={moveBend}
      onPointerUp={finishBend}
      onContextMenu={openContextMenu}
      onPointerCancel={() => {
        const next = edgeData.manualBendX ?? automaticBendX;
        dragging.current = false;
        bendXRef.current = next;
        setBendX(next);
      }}
    />}
  </>;
}
