import type { HarnessAssembly, PartSnapshot } from "./types";
import { pinConductorCapacity, pinConductorUsage } from "./pinCapacity";

export interface PinDestination {
  nodeId: string;
  nodeReference: string;
  nodeLabel: string;
  pinId: string;
  pinNumber: string;
  pinName: string;
  partNumber?: string;
}

export function searchPinDestinations(
  harness: HarnessAssembly,
  parts: PartSnapshot[],
  sourceNodeId: string,
  query: string,
): PinDestination[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return harness.nodes
    .filter((node) => node.id !== sourceNodeId)
    .flatMap((node) => {
      const part = parts.find((item) => item.id === node.partId);
      return node.pins.flatMap((pin) => {
        const usage = pinConductorUsage(harness, node.id, pin.id);
        const capacity = pinConductorCapacity(parts, node, pin.id);
        const searchable = [node.reference, node.label, part?.partNumber, part?.manufacturer, pin.number, pin.name]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase();
        const reference = node.reference.toLocaleLowerCase();
        const hasExactReference = terms.includes(reference);
        const remainingTerms = hasExactReference ? terms.filter((term) => term !== reference) : terms;
        const pinSearchable = [pin.number, pin.name].filter(Boolean).join(" ").toLocaleLowerCase();
        const matches = hasExactReference
          ? remainingTerms.every((term) => pinSearchable.includes(term))
          : terms.every((term) => searchable.includes(term));
        if (usage >= capacity || !matches) return [];
        return [{
          nodeId: node.id,
          nodeReference: node.reference,
          nodeLabel: node.label,
          pinId: pin.id,
          pinNumber: pin.number,
          pinName: pin.name,
          partNumber: part?.partNumber,
        }];
      });
    })
    .slice(0, 30);
}
