import { NodeResizer, type Node, type NodeProps, type ResizeParams } from "@xyflow/react";
import type { PartSnapshot } from "../domain/types";

export type AccessoryFlowNode = Node<{
  accessoryId: string;
  partNumber: string;
  category: PartSnapshot["category"];
  quantity: number;
  note: string;
  externallySelected: boolean;
  onEdit?: (id: string, x: number, y: number) => void;
  onResize?: (id: string, size: ResizeParams) => void;
}, "accessory">;

export function AccessoryNode({ data, selected }: NodeProps<AccessoryFlowNode>) {
  const label = data.category === "label";
  const isSelected = selected || data.externallySelected;
  return <>
    {label && isSelected && data.onResize && <NodeResizer
      minWidth={64}
      minHeight={24}
      maxWidth={800}
      maxHeight={320}
      handleClassName="harness-accessory-node__resize-handle"
      lineClassName="harness-accessory-node__resize-line"
      onResizeEnd={(_, size) => data.onResize?.(data.accessoryId, size)}
    />}
    <div className={`harness-accessory-node harness-accessory-node--${data.category} ${isSelected ? "is-selected" : ""}`} title={data.note || data.partNumber} onDoubleClick={label && data.onEdit ? (event) => { event.preventDefault(); event.stopPropagation(); data.onEdit?.(data.accessoryId, event.clientX, event.clientY); } : undefined}>
      <span>{data.category === "clip" ? "CLAMP / CLIP" : data.category === "heatShrink" ? "HEAT SHRINK" : data.category.toUpperCase()}</span>
      <strong>{label ? data.note || data.partNumber : data.partNumber}</strong>
      <small>× {data.quantity}</small>
    </div>
  </>;
}
