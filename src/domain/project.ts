import type { HarnessAssembly, ProjectDocument } from "./types";

export function createHarness(index: number): HarnessAssembly {
  return {
    id: crypto.randomUUID(),
    number: `HNS-${String(index).padStart(3, "0")}`,
    name: "NEW HARNESS",
    revision: "A",
    releaseStatus: "draft",
    nodes: [],
    segments: [],
    conductors: [],
    accessories: [],
  };
}

export function createProject(name = "NEW HARNESS PROJECT"): ProjectDocument {
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
    parts: [],
    harnesses: [createHarness(1)],
    releaseHistory: [],
    testRuns: [],
    manufacturingRules: {
      bundlePackingFactor: 0.7,
      maxBundleFillPercent: 80,
      minBendRadiusMultiplier: 6,
      maxVoltageDropPercent: 3,
      requireUnusedCavitySeal: false,
      currency: "KRW",
      laborRatePerHour: 0,
      overheadPercent: 0,
    },
    workInstructions: [],
    equipmentProfiles: [],
    variants: [],
    systems: [],
    members: [],
    reviewComments: [],
  };
}
