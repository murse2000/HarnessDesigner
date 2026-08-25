import type { HarnessAssembly, ProjectDocument } from "../domain/types";

export interface ThreeSceneItem {
  id: string;
  kind: "node" | "segment" | "accessory";
  reference: string;
  detail: string;
}

export function buildThreeSceneItems(project: ProjectDocument, harness: HarnessAssembly): ThreeSceneItem[] {
  const partById = new Map(project.parts.map((part) => [part.id, part]));
  const nodes: ThreeSceneItem[] = harness.nodes.map((node) => {
    const part = partById.get(node.partId ?? "");
    return { id: node.id, kind: "node", reference: node.reference, detail: part ? `${part.partNumber} · ${part.manufacturer}` : node.label };
  });
  const segments: ThreeSceneItem[] = harness.segments.map((segment) => {
    const part = partById.get(segment.cablePartId ?? "");
    const cores = harness.conductors.filter((conductor) => part?.category === "cable"
      ? conductor.cableRunId === segment.id
      : !conductor.cableRunId && conductor.routeSegmentIds.includes(segment.id)).length;
    return { id: segment.id, kind: "segment", reference: segment.label, detail: `${part?.partNumber ?? "개별 전선"} · ${cores}C · ${segment.lengthMm} mm` };
  });
  const accessories: ThreeSceneItem[] = harness.accessories.map((accessory) => {
    const part = partById.get(accessory.partId);
    return { id: accessory.id, kind: "accessory", reference: part?.partNumber ?? accessory.partId, detail: `${part?.category ?? "accessory"} · ${accessory.quantity} ${part?.unit ?? "ea"}` };
  });
  return [...nodes, ...segments, ...accessories];
}
