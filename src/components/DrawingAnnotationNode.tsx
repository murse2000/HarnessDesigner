import { Image, Tag, Type } from "lucide-react";
import { NodeResizer, type Node, type NodeProps, type ResizeParams } from "@xyflow/react";
import type { DrawingAnnotation } from "../domain/types";

export type DrawingAnnotationFlowNode = Node<{
  model: DrawingAnnotation;
  externallySelected: boolean;
  onEdit: (id: string, x: number, y: number) => void;
  onResize?: (id: string, size: ResizeParams) => void;
}, "drawing-annotation">;

export function DrawingAnnotationNode({ data, selected }: NodeProps<DrawingAnnotationFlowNode>) {
  const annotation = data.model;
  const isSelected = selected || data.externallySelected;
  const Icon = annotation.kind === "label" ? Tag : annotation.kind === "image" ? Image : Type;
  const transform = `scale(${annotation.flippedX ? -1 : 1}, ${annotation.flippedY ? -1 : 1})`;
  return <>
    {isSelected && data.onResize && <NodeResizer
      minWidth={40}
      minHeight={24}
      maxWidth={1200}
      maxHeight={800}
      handleClassName="drawing-annotation__resize-handle"
      lineClassName="drawing-annotation__resize-line"
      onResizeEnd={(_, size) => data.onResize?.(annotation.id, size)}
    />}
    <div className={`drawing-annotation drawing-annotation--${annotation.kind} ${isSelected ? "is-selected" : ""}`} onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); data.onEdit(annotation.id, event.clientX, event.clientY); }}>
      {annotation.kind === "image" && annotation.imageDataUrl
        ? <img src={annotation.imageDataUrl} alt={annotation.text || "도면 첨부 이미지"} draggable={false} style={{ transform }} />
        : annotation.kind === "rectangle" ? <svg viewBox="0 0 100 100" preserveAspectRatio="none"><rect x="2" y="2" width="96" height="96" fill={annotation.fillColor ?? "#fff"} stroke={annotation.strokeColor ?? "#1f668f"} strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg>
        : annotation.kind === "ellipse" ? <svg viewBox="0 0 100 100" preserveAspectRatio="none"><ellipse cx="50" cy="50" rx="48" ry="48" fill={annotation.fillColor ?? "#fff"} stroke={annotation.strokeColor ?? "#1f668f"} strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg>
        : annotation.kind === "arrow" ? <svg viewBox="0 0 100 20" preserveAspectRatio="none"><defs><marker id={`arrow-${annotation.id}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill={annotation.strokeColor ?? "#1f668f"} /></marker></defs><line x1="2" y1="10" x2="92" y2="10" stroke={annotation.strokeColor ?? "#1f668f"} strokeWidth="2" vectorEffect="non-scaling-stroke" markerEnd={`url(#arrow-${annotation.id})`} /></svg>
        : <><Icon size={annotation.kind === "label" ? 12 : 13} /><span>{annotation.text || (annotation.kind === "label" ? "LABEL" : "텍스트")}</span></>}
    </div>
  </>;
}
