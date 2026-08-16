import type { HarnessAssembly, HarnessNode, PartSnapshot } from "./types";

export function terminalConductorCapacity(terminal?: PartSnapshot): number {
  const value = Number(terminal?.attributes.maxConductors);
  return value === 2 ? 2 : 1;
}

export function pinConductorCapacity(parts: PartSnapshot[], node: HarnessNode | undefined, pinId: string): number {
  const terminalPartId = node?.pins.find((pin) => pin.id === pinId)?.terminalPartId;
  return terminalConductorCapacity(parts.find((part) => part.id === terminalPartId && part.category === "terminal"));
}

export function pinConductorUsage(harness: HarnessAssembly, nodeId: string, pinId: string, excludedConductorIds: ReadonlySet<string> = new Set()): number {
  return harness.conductors.filter((conductor) => !excludedConductorIds.has(conductor.id) && [conductor.from, conductor.to].some((endpoint) => endpoint.nodeId === nodeId && endpoint.pinId === pinId)).length;
}

export function pinHasConductorCapacity(harness: HarnessAssembly, parts: PartSnapshot[], nodeId: string, pinId: string, excludedConductorIds: ReadonlySet<string> = new Set()): boolean {
  const node = harness.nodes.find((item) => item.id === nodeId);
  return pinConductorUsage(harness, nodeId, pinId, excludedConductorIds) < pinConductorCapacity(parts, node, pinId);
}
