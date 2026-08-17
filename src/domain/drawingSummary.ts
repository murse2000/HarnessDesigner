import { buildBom, buildCutList } from "./calculations";
import type { HarnessAssembly, PartCategory, ProjectDocument, QuantityUnit } from "./types";

export interface DrawingMaterialRow {
  type: "TERMINAL" | "CLAMP / CLIP" | "LABEL";
  partNumber: string;
  quantity: number;
  unit: QuantityUnit;
  present: boolean;
}

export interface DrawingLengthRow {
  id: string;
  reference: string;
  partNumber: string;
  from: string;
  to: string;
  lengthMm: number;
}

export interface HarnessDrawingSummary {
  notes: string[];
  materials: DrawingMaterialRow[];
  lengths: DrawingLengthRow[];
}

const materialTypes: Array<{ category: PartCategory; type: DrawingMaterialRow["type"] }> = [
  { category: "terminal", type: "TERMINAL" },
  { category: "clip", type: "CLAMP / CLIP" },
  { category: "label", type: "LABEL" },
];

export function buildHarnessDrawingSummary(project: ProjectDocument, harness: HarnessAssembly): HarnessDrawingSummary {
  const scopedProject = { ...project, harnesses: [harness] };
  const bom = buildBom(scopedProject);
  const materials = materialTypes.flatMap(({ category, type }) => {
    const rows = bom.filter((row) => row.category === category);
    return rows.length
      ? rows.map((row) => ({ type, partNumber: row.partNumber, quantity: row.quantity, unit: row.unit, present: true }))
      : [{ type, partNumber: "NONE", quantity: 0, unit: "ea" as const, present: false }];
  });
  const lengths = buildCutList(scopedProject).map((row) => ({
    id: row.conductorId,
    reference: row.reference,
    partNumber: row.partNumber || "UNASSIGNED",
    from: row.from,
    to: row.to,
    lengthMm: row.lengthMm,
  }));
  const notes = [
    ...(harness.drawingNotes ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    ...harness.conductors.filter((conductor) => conductor.notes?.trim()).map((conductor) => `${conductor.reference}: ${conductor.notes!.trim()}`),
  ];
  return { notes, materials, lengths };
}
