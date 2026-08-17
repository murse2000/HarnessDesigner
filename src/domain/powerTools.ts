import type { HarnessAssembly, PartSnapshot, ProjectDocument } from "./types";

export interface PartUsage {
  partId: string;
  harnessNumber: string;
  reference: string;
  usage: string;
}

export function conductorsInSegment(harness: HarnessAssembly, segmentId: string) {
  return harness.conductors.filter((conductor) => conductor.routeSegmentIds.includes(segmentId));
}

export function partUsage(project: ProjectDocument): PartUsage[] {
  return project.harnesses.flatMap((harness) => {
    const usages: PartUsage[] = [];
    for (const node of harness.nodes) if (node.partId) usages.push({ partId: node.partId, harnessNumber: harness.number, reference: node.reference, usage: "하우징 / 종단" });
    for (const segment of harness.segments) {
      for (const [partId, usage] of [
        [segment.cablePartId, "케이블"], [segment.startHeatShrinkPartId, "시작 수축튜브"], [segment.endHeatShrinkPartId, "끝 수축튜브"],
        [segment.sleevePartId, "슬리브"], [segment.shieldPartId, "실드"], [segment.tapePartId, "테이프"],
      ] as const) if (partId) usages.push({ partId, harnessNumber: harness.number, reference: segment.label, usage });
    }
    for (const conductor of harness.conductors) {
      usages.push({ partId: conductor.wirePartId, harnessNumber: harness.number, reference: conductor.reference, usage: conductor.cableRunId ? "케이블 코어" : "전선" });
      for (const [partId, usage] of [
        [conductor.startTermination.terminalPartId, "From 터미널"], [conductor.startTermination.sealPartId, "From 씰"], [conductor.startTermination.lugPartId, "From 러그"],
        [conductor.endTermination.terminalPartId, "To 터미널"], [conductor.endTermination.sealPartId, "To 씰"], [conductor.endTermination.lugPartId, "To 러그"],
      ] as const) if (partId) usages.push({ partId, harnessNumber: harness.number, reference: conductor.reference, usage });
    }
    for (const accessory of harness.accessories) usages.push({ partId: accessory.partId, harnessNumber: harness.number, reference: accessory.note || accessory.id, usage: "부자재" });
    return usages;
  });
}

export function duplicatePartGroups(parts: PartSnapshot[]): PartSnapshot[][] {
  const groups = new Map<string, PartSnapshot[]>();
  for (const part of parts) {
    const key = `${part.manufacturer.trim().toLowerCase()}|${part.partNumber.trim().toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), part]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

export function unusedParts(project: ProjectDocument): PartSnapshot[] {
  const used = new Set(partUsage(project).map((usage) => usage.partId));
  return project.parts.filter((part) => !used.has(part.id));
}
