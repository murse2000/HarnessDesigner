import type { BomRow, Conductor, CutListRow, HarnessAssembly, PartSnapshot, ProjectDocument } from "./types";

const round = (value: number, digits = 3) => Number(value.toFixed(digits));
export interface ManufacturingFormat { cutLengthRoundingMm?: number; bomWastePercent?: number; bomLengthRoundingMm?: number }

const roundUp = (value: number, step: number) => step > 0 ? Math.ceil((value - Number.EPSILON) / step) * step : value;

export function conductorLengthMm(conductor: Conductor, harness: HarnessAssembly): number {
  const segmentMap = new Map(harness.segments.map((segment) => [segment.id, segment]));
  const routeLength = conductor.routeSegmentIds.reduce((total, id) => total + (segmentMap.get(id)?.lengthMm ?? 0), 0);
  return round(routeLength + conductor.startTermination.allowanceMm + conductor.endTermination.allowanceMm + conductor.adjustmentMm, 1);
}

function endpointLabel(harness: HarnessAssembly, nodeId: string, pinId?: string): string {
  const node = harness.nodes.find((item) => item.id === nodeId);
  const pin = node?.pins.find((item) => item.id === pinId);
  return `${node?.reference ?? "?"}${pin ? `:${pin.number}` : ""}`;
}

export function buildCutList(project: ProjectDocument, format: ManufacturingFormat = {}): CutListRow[] {
  const partMap = new Map(project.parts.map((part) => [part.id, part]));
  return project.harnesses.flatMap((harness) => [
    ...harness.segments.filter((segment) => segment.cablePartId && harness.conductors.some((conductor) => conductor.cableRunId === segment.id)).map((segment) => {
      const part = partMap.get(segment.cablePartId!);
      return {
        harnessNumber: harness.number,
        conductorId: segment.id,
        reference: segment.label,
        from: endpointLabel(harness, segment.fromNodeId),
        to: endpointLabel(harness, segment.toNodeId),
        partNumber: part?.partNumber ?? "",
        color: part?.color ?? "",
        gauge: `${part?.attributes.coreCount ?? "?"}C`,
        lengthMm: round(roundUp(segment.lengthMm, format.cutLengthRoundingMm ?? 0), 1),
      };
    }),
    ...harness.conductors.filter((conductor) => !conductor.cableRunId).map((conductor) => ({
      harnessNumber: harness.number,
      conductorId: conductor.id,
      reference: conductor.reference,
      from: endpointLabel(harness, conductor.from.nodeId, conductor.from.pinId),
      to: endpointLabel(harness, conductor.to.nodeId, conductor.to.pinId),
      partNumber: partMap.get(conductor.wirePartId)?.partNumber ?? "",
      color: conductor.color,
      gauge: conductor.gauge,
      lengthMm: round(roundUp(conductorLengthMm(conductor, harness), format.cutLengthRoundingMm ?? 0), 1),
    })),
  ]);
}

export function buildBom(project: ProjectDocument, format: ManufacturingFormat = {}): BomRow[] {
  const parts = new Map(project.parts.map((part) => [part.id, part]));
  const rows = new Map<string, BomRow>();

  const add = (partId: string | undefined, quantity: number, harnessNumber: string) => {
    if (!partId || quantity <= 0) return;
    const part = parts.get(partId);
    if (!part) return;
    const key = `${part.partNumber}|${part.color ?? ""}|${part.gauge ?? ""}|${part.unit}`;
    const row = rows.get(key) ?? toBomRow(part);
    row.quantity += quantity;
    if (!row.harnesses.includes(harnessNumber)) row.harnesses.push(harnessNumber);
    rows.set(key, row);
  };

  for (const harness of project.harnesses) {
    const terminalEndpoints = new Set<string>();
    for (const node of harness.nodes) {
      add(node.partId, 1, harness.number);
    }
    for (const segment of harness.segments) {
      add(segment.cablePartId, segment.lengthMm / 1000, harness.number);
      add(segment.startHeatShrinkPartId, 1, harness.number);
      add(segment.endHeatShrinkPartId, 1, harness.number);
      add(segment.sleevePartId, segment.lengthMm / 1000, harness.number);
      add(segment.shieldPartId, segment.lengthMm / 1000, harness.number);
      add(segment.tapePartId, segment.lengthMm / 1000, harness.number);
    }
    for (const conductor of harness.conductors) {
      if (!conductor.cableRunId) add(conductor.wirePartId, conductorLengthMm(conductor, harness) / 1000, harness.number);
      for (const [side, endpoint, termination] of [["start", conductor.from, conductor.startTermination], ["end", conductor.to, conductor.endTermination]] as const) {
        if (termination.terminalPartId) {
          const terminalKey = endpoint.pinId ? `${endpoint.nodeId}:${endpoint.pinId}:${termination.terminalPartId}` : `${conductor.id}:${side}:${termination.terminalPartId}`;
          if (!terminalEndpoints.has(terminalKey)) {
            terminalEndpoints.add(terminalKey);
            add(termination.terminalPartId, 1, harness.number);
          }
        }
        add(termination.sealPartId, 1, harness.number);
        add(termination.lugPartId, 1, harness.number);
      }
    }
    for (const accessory of harness.accessories) add(accessory.partId, accessory.quantity, harness.number);
  }

  return [...rows.values()]
    .map((row) => {
      if (row.unit !== "m") return { ...row, quantity: round(row.quantity) };
      const withWaste = row.quantity * (1 + Math.max(0, format.bomWastePercent ?? 0) / 100);
      const roundingM = Math.max(0, format.bomLengthRoundingMm ?? 0) / 1000;
      return { ...row, quantity: round(roundUp(withWaste, roundingM)) };
    })
    .sort((a, b) => a.category.localeCompare(b.category) || a.partNumber.localeCompare(b.partNumber));
}

export function buildHarnessBom(project: ProjectDocument, format: ManufacturingFormat = {}): Array<BomRow & { harnessNumber: string }> {
  return project.harnesses.flatMap((harness) => buildBom({ ...project, harnesses: [harness] }, format).map((row) => ({ ...row, harnessNumber: harness.number })));
}

function toBomRow(part: PartSnapshot): BomRow {
  return {
    partId: part.id,
    partNumber: part.partNumber,
    manufacturer: part.manufacturer,
    description: part.description,
    category: part.category,
    specification: [part.gauge, part.color].filter(Boolean).join(" / "),
    unit: part.unit,
    quantity: 0,
    harnesses: [],
  };
}
