import { getCompatibleTerminalIds } from "./parts";
import { terminalConductorCapacity } from "./pinCapacity";
import type { HarnessAssembly, PartSnapshot, PinDefinition, ProjectDocument } from "./types";

export interface ConnectorRemapGroup {
  oldPinId: string;
  oldPinNumber: string;
  conductorIds: string[];
  targetPinId?: string;
}

const pinOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function connectorRemapPlan(harness: HarnessAssembly, nodeId: string, replacementPins: PinDefinition[]): ConnectorRemapGroup[] {
  const node = harness.nodes.find((item) => item.id === nodeId);
  if (!node) return [];
  const conductorIdsByPin = new Map<string, string[]>();
  for (const conductor of harness.conductors) {
    for (const endpoint of [conductor.from, conductor.to]) {
      if (endpoint.nodeId !== nodeId || !endpoint.pinId) continue;
      conductorIdsByPin.set(endpoint.pinId, [...(conductorIdsByPin.get(endpoint.pinId) ?? []), conductor.id]);
    }
  }
  const groups: ConnectorRemapGroup[] = node.pins
    .filter((pin) => conductorIdsByPin.has(pin.id))
    .sort((a, b) => pinOrder.compare(a.number, b.number))
    .map((pin) => ({ oldPinId: pin.id, oldPinNumber: pin.number, conductorIds: conductorIdsByPin.get(pin.id) ?? [] }));
  const targetByNumber = new Map(replacementPins.map((pin) => [pin.number, pin.id]));
  const used = new Set<string>();
  for (const group of groups) {
    const targetPinId = targetByNumber.get(group.oldPinNumber);
    if (targetPinId) {
      group.targetPinId = targetPinId;
      used.add(targetPinId);
    }
  }
  const remaining = replacementPins.filter((pin) => !used.has(pin.id)).sort((a, b) => pinOrder.compare(a.number, b.number));
  for (const group of groups.filter((item) => !item.targetPinId)) group.targetPinId = remaining.shift()?.id;
  return groups;
}

export function connectorRemapErrors(groups: ConnectorRemapGroup[], replacementPins: PinDefinition[], parts: PartSnapshot[]): string[] {
  const errors: string[] = [];
  const pinById = new Map(replacementPins.map((pin) => [pin.id, pin]));
  const usage = new Map<string, number>();
  for (const group of groups) {
    if (!group.targetPinId || !pinById.has(group.targetPinId)) {
      errors.push(`기존 핀 ${group.oldPinNumber}의 새 핀이 지정되지 않았습니다.`);
      continue;
    }
    usage.set(group.targetPinId, (usage.get(group.targetPinId) ?? 0) + group.conductorIds.length);
  }
  for (const [pinId, count] of usage) {
    const pin = pinById.get(pinId)!;
    const terminal = parts.find((part) => part.id === pin.terminalPartId && part.category === "terminal");
    const capacity = terminalConductorCapacity(terminal);
    if (count > capacity) errors.push(`새 핀 ${pin.number}은 ${count}가닥을 수용할 수 없습니다. 터미널 허용량은 ${capacity}가닥입니다.`);
  }
  return errors;
}

export function applyConnectorRemap(harness: HarnessAssembly, nodeId: string, replacementPins: PinDefinition[], groups: ConnectorRemapGroup[]): void {
  const targetByOldPin = new Map(groups.map((group) => [group.oldPinId, group.targetPinId]));
  for (const conductor of harness.conductors) {
    for (const endpoint of [conductor.from, conductor.to]) {
      if (endpoint.nodeId !== nodeId || !endpoint.pinId) continue;
      endpoint.pinId = targetByOldPin.get(endpoint.pinId);
    }
  }
  const node = harness.nodes.find((item) => item.id === nodeId);
  if (node) node.pins = replacementPins;
}

export function terminalSwitchErrors(project: ProjectDocument, harnessId: string, nodeId: string, terminalPartId: string, availableParts: PartSnapshot[] = project.parts): string[] {
  const harness = project.harnesses.find((item) => item.id === harnessId);
  const node = harness?.nodes.find((item) => item.id === nodeId);
  const housing = availableParts.find((part) => part.id === node?.partId && part.category === "housing");
  const terminal = availableParts.find((part) => part.id === terminalPartId && part.category === "terminal");
  if (!harness || !node || node.kind !== "connector") return ["교체할 커넥터를 찾을 수 없습니다."];
  if (!housing) return ["커넥터 하우징 부품 정보가 없습니다."];
  if (!terminal) return ["교체할 터미널 부품을 찾을 수 없습니다."];
  if (!getCompatibleTerminalIds(housing).includes(terminalPartId)) return [`${terminal.partNumber}은 ${housing.partNumber} 하우징과 호환되지 않습니다.`];
  const capacity = terminalConductorCapacity(terminal);
  return node.pins.flatMap((pin) => {
    const count = harness.conductors.filter((conductor) => [conductor.from, conductor.to].some((endpoint) => endpoint.nodeId === nodeId && endpoint.pinId === pin.id)).length;
    return count > capacity ? [`핀 ${pin.number}의 ${count}가닥 연결이 터미널 허용량 ${capacity}가닥을 초과합니다.`] : [];
  });
}

export function switchConnectorTerminal(project: ProjectDocument, harnessId: string, nodeId: string, terminalPartId: string): void {
  const errors = terminalSwitchErrors(project, harnessId, nodeId, terminalPartId);
  if (errors.length) throw new Error(errors[0]);
  const harness = project.harnesses.find((item) => item.id === harnessId)!;
  const node = harness.nodes.find((item) => item.id === nodeId)!;
  const terminal = project.parts.find((part) => part.id === terminalPartId)!;
  const defaultSealPartId = terminal.attributes.defaultSealPartId || undefined;
  for (const pin of node.pins) {
    pin.terminalPartId = terminalPartId;
    if (defaultSealPartId) pin.sealPartId = defaultSealPartId;
  }
  for (const conductor of harness.conductors) {
    for (const [side, endpoint] of [["startTermination", conductor.from], ["endTermination", conductor.to]] as const) {
      if (endpoint.nodeId !== nodeId || !endpoint.pinId) continue;
      conductor[side].terminalPartId = terminalPartId;
      if (defaultSealPartId) conductor[side].sealPartId = defaultSealPartId;
    }
  }
}
