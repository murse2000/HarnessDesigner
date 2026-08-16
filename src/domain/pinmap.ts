import type { Conductor, HarnessAssembly, PartSnapshot } from "./types";
import { resolvePinTermination } from "./parts";

export interface PinConnectionDraft {
  reference: string;
  fromNodeId: string;
  fromPinId: string;
  toNodeId: string;
  toPinId: string;
  wirePartId: string;
  routeSegmentIds: string[];
  color: string;
  gauge: string;
  twistGroup: string;
  startAllowanceMm: number;
  endAllowanceMm: number;
  adjustmentMm: number;
}

export interface PinConnectionPreset {
  fromNodeId: string;
  fromPinId: string;
  toNodeId: string;
  toPinId: string;
  routeSegmentIds: string[];
  createDirectSegment?: boolean;
}

export function hasConnectedPins(conductor: Pick<Conductor, "from" | "to">): conductor is Pick<Conductor, "from" | "to"> & {
  from: Conductor["from"] & { pinId: string };
  to: Conductor["to"] & { pinId: string };
} {
  return Boolean(conductor.from.pinId && conductor.to.pinId);
}

export function hasRenderableEndpoints(conductor: Pick<Conductor, "from" | "to" | "cableRunId">): boolean {
  return hasConnectedPins(conductor) || Boolean(conductor.cableRunId && (conductor.from.pinId || conductor.to.pinId));
}

export function findUniqueSegmentRoute(harness: HarnessAssembly, fromNodeId: string, toNodeId: string): string[] {
  if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) return [];
  const routes: string[][] = [];
  const visit = (nodeId: string, visitedNodes: Set<string>, segmentIds: string[]) => {
    if (routes.length > 1) return;
    if (nodeId === toNodeId) {
      routes.push(segmentIds);
      return;
    }
    for (const segment of harness.segments) {
      const nextNodeId = segment.fromNodeId === nodeId
        ? segment.toNodeId
        : segment.toNodeId === nodeId ? segment.fromNodeId : undefined;
      if (!nextNodeId || visitedNodes.has(nextNodeId)) continue;
      visit(nextNodeId, new Set([...visitedNodes, nextNodeId]), [...segmentIds, segment.id]);
    }
  };
  visit(fromNodeId, new Set([fromNodeId]), []);
  return routes.length === 1 ? routes[0] : [];
}

export function hasSegmentRoute(harness: HarnessAssembly, fromNodeId: string, toNodeId: string): boolean {
  const pending = [fromNodeId];
  const visited = new Set<string>();
  while (pending.length) {
    const nodeId = pending.shift()!;
    if (nodeId === toNodeId) return true;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    for (const segment of harness.segments) {
      if (segment.fromNodeId === nodeId && !visited.has(segment.toNodeId)) pending.push(segment.toNodeId);
      if (segment.toNodeId === nodeId && !visited.has(segment.fromNodeId)) pending.push(segment.fromNodeId);
    }
  }
  return false;
}

export function nextWireReference(conductors: Conductor[]): string {
  const used = new Set(conductors.map((wire) => wire.reference.toUpperCase()));
  let index = 1;
  while (used.has(`W${String(index).padStart(3, "0")}`)) index += 1;
  return `W${String(index).padStart(3, "0")}`;
}

export function createConductorFromDraft(draft: PinConnectionDraft, harness: HarnessAssembly, wirePart: PartSnapshot, parts: PartSnapshot[] = []): Conductor {
  const fromTermination = resolvePinTermination(parts, harness.nodes.find((node) => node.id === draft.fromNodeId), draft.fromPinId);
  const toTermination = resolvePinTermination(parts, harness.nodes.find((node) => node.id === draft.toNodeId), draft.toPinId);
  return {
    id: crypto.randomUUID(),
    reference: draft.reference.trim(),
    from: { nodeId: draft.fromNodeId, pinId: draft.fromPinId },
    to: { nodeId: draft.toNodeId, pinId: draft.toPinId },
    wirePartId: wirePart.id,
    color: draft.color.trim(),
    gauge: draft.gauge.trim(),
    routeSegmentIds: [...draft.routeSegmentIds],
    startTermination: { ...fromTermination, allowanceMm: draft.startAllowanceMm },
    endTermination: { ...toTermination, allowanceMm: draft.endAllowanceMm },
    adjustmentMm: draft.adjustmentMm,
    twistGroup: draft.twistGroup.trim() || undefined,
  };
}
