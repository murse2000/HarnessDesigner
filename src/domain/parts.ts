import type { HarnessNode, PartSnapshot, PinDefinition, Termination } from "./types";

type StoredPin = Pick<PinDefinition, "number" | "name" | "position">;

export function getPartName(part: PartSnapshot): string {
  return part.name?.trim() || part.description;
}

function storedPinMap(part: PartSnapshot): StoredPin[] {
  const value = part.attributes.pinMap;
  if (!value) return [];
  try {
    const pins = JSON.parse(value) as StoredPin[];
    return Array.isArray(pins)
      ? pins.filter((pin) => typeof pin.number === "string" && Number.isFinite(pin.position?.x) && Number.isFinite(pin.position?.y))
      : [];
  } catch {
    return [];
  }
}

export function hasMappedPinPositions(part: PartSnapshot | undefined): boolean {
  return part ? storedPinMap(part).length > 0 : false;
}

export function getPartPinCount(part: PartSnapshot): number {
  const pins = storedPinMap(part);
  if (pins.length) return pins.length;
  const count = Number(part.attributes.pinCount ?? part.attributes.cavities ?? 0);
  return Number.isInteger(count) && count > 0 ? count : 0;
}

export function getPartPinNumbers(part: PartSnapshot): string[] {
  const pins = storedPinMap(part);
  if (pins.length) return pins.map((pin) => pin.number);
  return Array.from({ length: getPartPinCount(part) }, (_, index) => String(index + 1));
}

export function getCompatibleTerminalIds(part: PartSnapshot): string[] {
  return parsePartIds(part.attributes.compatibleTerminalPartIds);
}

export function getCompatibleClampIds(part: PartSnapshot): string[] {
  return parsePartIds(part.attributes.compatibleClampPartIds);
}

export function isConnectorClampPart(part: PartSnapshot | undefined): boolean {
  return part?.category === "clip" && part.attributes.accessoryType === "connectorClamp";
}

function parsePartIds(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const ids = JSON.parse(value) as unknown;
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function createPinsFromPart(part: PartSnapshot): PinDefinition[] {
  const terminalPartId = part.attributes.defaultTerminalPartId || undefined;
  const pins = storedPinMap(part);
  if (pins.length) {
    return pins.map((pin) => ({
      id: crypto.randomUUID(),
      number: pin.number,
      name: pin.name ?? "",
      position: { ...pin.position },
      terminalPartId,
    }));
  }
  return Array.from({ length: getPartPinCount(part) }, (_, index) => ({
    id: crypto.randomUUID(),
    number: String(index + 1),
    name: "",
    position: { x: (index % 4) * 20, y: Math.floor(index / 4) * 20 },
    terminalPartId,
  }));
}

export function resolvePinTermination(parts: PartSnapshot[], node: HarnessNode | undefined, pinId: string | undefined): Pick<Termination, "terminalPartId" | "sealPartId"> {
  const pin = node?.pins.find((item) => item.id === pinId);
  const housing = parts.find((part) => part.id === node?.partId && part.category === "housing");
  const terminalPartId = pin?.terminalPartId || housing?.attributes.defaultTerminalPartId || undefined;
  const terminal = parts.find((part) => part.id === terminalPartId && part.category === "terminal");
  return {
    terminalPartId,
    sealPartId: pin?.sealPartId || terminal?.attributes.defaultSealPartId || housing?.attributes.defaultSealPartId || undefined,
  };
}

export function nextConnectorReference(nodes: HarnessNode[]): string {
  const used = new Set(nodes.map((node) => node.reference.toUpperCase()));
  let index = 1;
  while (used.has(`J${index}`)) index += 1;
  return `J${index}`;
}
