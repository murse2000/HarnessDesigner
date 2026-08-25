import type { HarnessAssembly, PartSnapshot, ProjectDocument } from "../domain/types";

export const sampleParts: PartSnapshot[] = [
  { id: "builtin-molex-33482-4801", name: "MX150 8핀 플러그 하우징", partNumber: "33482-4801", manufacturer: "Molex", description: "3.50 mm pitch, sealed 8 circuit plug housing", revision: "CATALOG", category: "housing", unit: "ea", attributes: { cavities: "8", compatibleTerminalPartIds: "[\"part-terminal\"]", defaultTerminalPartId: "part-terminal" }, modelAssetId: "builtin-model-molex-334824801" },
  { id: "builtin-molex-51021-0400", name: "PicoBlade 4핀 리셉터클 하우징", partNumber: "51021-0400", manufacturer: "Molex", description: "1.25 mm pitch, 4 circuit receptacle housing", revision: "CATALOG", category: "housing", unit: "ea", attributes: { cavities: "4", compatibleTerminalPartIds: "[\"part-terminal\"]", defaultTerminalPartId: "part-terminal" }, modelAssetId: "builtin-model-molex-510210400" },
  { id: "part-terminal", partNumber: "TERM-20", manufacturer: "Generic", description: "20 AWG female terminal", revision: "A", category: "terminal", unit: "ea", attributes: {} },
  { id: "part-seal", partNumber: "SEAL-20", manufacturer: "Generic", description: "20 AWG wire seal", revision: "A", category: "seal", unit: "ea", attributes: {} },
  { id: "part-wire-red", partNumber: "TXL-20-RD", manufacturer: "Champlain", description: "TXL automotive wire", revision: "A", category: "wire", unit: "m", color: "RD", gauge: "20 AWG", attributes: { outerDiameterMm: "2.2" } },
  { id: "part-wire-blue", partNumber: "TXL-20-BU", manufacturer: "Champlain", description: "TXL automotive wire", revision: "A", category: "wire", unit: "m", color: "BU", gauge: "20 AWG", attributes: { outerDiameterMm: "2.2" } },
  { id: "part-sleeve", partNumber: "SLV-08", manufacturer: "Generic", description: "Braided sleeve 8 mm", revision: "A", category: "sleeve", unit: "m", attributes: { diameter: "8 mm", innerDiameterMm: "8" } },
  { id: "part-label", partNumber: "LBL-25", manufacturer: "Generic", description: "25 mm heat-shrink label", revision: "A", category: "label", unit: "ea", attributes: {} },
];

const pins = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => ({
  id: `${prefix}-pin-${index + 1}`,
  number: String(index + 1),
  name: index < 2 ? `SIGNAL_${index + 1}` : "",
  position: { x: (index % 4) * 20, y: Math.floor(index / 4) * 20 },
  terminalPartId: "part-terminal",
  sealPartId: "part-seal",
}));

export const sampleHarness: HarnessAssembly = {
  id: "harness-main",
  number: "HNS-001",
  name: "MAIN CONTROL HARNESS",
  revision: "A",
  releaseStatus: "draft",
  nodes: [
    { id: "node-j1", kind: "connector", reference: "J1", label: "MAIN PCB", partId: "builtin-molex-33482-4801", position: { x: 100, y: 170 }, pins: pins("j1", 8) },
    { id: "node-sp1", kind: "junction", reference: "BR1", label: "BRANCH POINT", position: { x: 420, y: 220 }, pins: [] },
    { id: "node-j2", kind: "connector", reference: "J2", label: "FRONT SENSOR", partId: "builtin-molex-51021-0400", position: { x: 720, y: 100 }, pins: pins("j2", 4) },
    { id: "node-j3", kind: "connector", reference: "J3", label: "REAR SENSOR", partId: "builtin-molex-51021-0400", position: { x: 720, y: 340 }, pins: pins("j3", 4) },
  ],
  segments: [
    { id: "seg-1", fromNodeId: "node-j1", toNodeId: "node-sp1", lengthMm: 450, label: "MAIN", sleevePartId: "part-sleeve" },
    { id: "seg-2", fromNodeId: "node-sp1", toNodeId: "node-j2", lengthMm: 320, label: "BRANCH A", sleevePartId: "part-sleeve" },
    { id: "seg-3", fromNodeId: "node-sp1", toNodeId: "node-j3", lengthMm: 380, label: "BRANCH B", sleevePartId: "part-sleeve" },
  ],
  conductors: [
    { id: "wire-1", reference: "W001", from: { nodeId: "node-j1", pinId: "j1-pin-1" }, to: { nodeId: "node-j2", pinId: "j2-pin-1" }, wirePartId: "part-wire-red", color: "RD", gauge: "20 AWG", routeSegmentIds: ["seg-1", "seg-2"], startTermination: { terminalPartId: "part-terminal", sealPartId: "part-seal", allowanceMm: 25 }, endTermination: { terminalPartId: "part-terminal", sealPartId: "part-seal", allowanceMm: 25 }, adjustmentMm: 10, twistGroup: "TP1" },
    { id: "wire-2", reference: "W002", from: { nodeId: "node-j1", pinId: "j1-pin-2" }, to: { nodeId: "node-j3", pinId: "j3-pin-1" }, wirePartId: "part-wire-blue", color: "BU", gauge: "20 AWG", routeSegmentIds: ["seg-1", "seg-3"], startTermination: { terminalPartId: "part-terminal", sealPartId: "part-seal", allowanceMm: 25 }, endTermination: { terminalPartId: "part-terminal", sealPartId: "part-seal", allowanceMm: 25 }, adjustmentMm: 10, twistGroup: "TP1" },
  ],
  accessories: [{ id: "acc-label-1", partId: "part-label", quantity: 2, note: "양단 라벨" }],
};

export function createSampleProject(name = "TEST HARNESS PROJECT"): ProjectDocument {
  const now = new Date().toISOString();
  return {
    schemaVersion: 2,
    id: crypto.randomUUID(),
    name,
    projectNumber: "PRJ-001",
    revision: "A",
    createdAt: now,
    updatedAt: now,
    settings: { unit: "mm", paper: "A3", orientation: "landscape", outputLocales: ["ko", "en"], imageDpi: 300 },
    assets: [],
    modelAssets: [],
    parts: structuredClone(sampleParts),
    harnesses: [structuredClone(sampleHarness)],
    releaseHistory: [],
    testRuns: [],
    manufacturingRules: { bundlePackingFactor: 0.7, maxBundleFillPercent: 80, minBendRadiusMultiplier: 6, maxVoltageDropPercent: 3, requireUnusedCavitySeal: false, currency: "KRW", laborRatePerHour: 0, overheadPercent: 0 },
    workInstructions: [],
    equipmentProfiles: [
      { id: "equipment-wire-generic", name: "범용 전선 가공기 CSV", kind: "wireProcessor", delimiter: ",", includeHeader: true, enabled: true },
      { id: "equipment-label-generic", name: "범용 라벨 프린터 CSV", kind: "labelPrinter", delimiter: ",", includeHeader: true, enabled: true },
      { id: "equipment-tester-generic", name: "범용 연속성 검사기 CSV", kind: "tester", delimiter: ",", includeHeader: true, enabled: true },
    ],
    variants: [],
    systems: [],
    members: [],
    reviewComments: [],
  };
}
