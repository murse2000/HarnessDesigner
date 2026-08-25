import { describe, expect, it } from "vitest";
import occtImportJs from "occt-import-js";
import { createSampleProject } from "../test/sampleProject";
import { buildHarnessCadData, buildHarnessStep } from "./step3d";

describe("3D STEP 내보내기", () => {
  it("하네스 노드와 폐곡면 전선을 AP242 형상으로 만든다", () => {
    const project = createSampleProject("STEP TEST");
    const harness = project.harnesses[0];
    const data = buildHarnessCadData(project, harness);
    const step = buildHarnessStep(project, harness);

    expect(data.nodePositions.size).toBe(harness.nodes.length);
    expect(data.routes).toHaveLength(harness.segments.length);
    expect(data.meshes.some((mesh) => mesh.name.includes("W001"))).toBe(true);
    expect(data.meshes.some((mesh) => mesh.name.includes("label_LBL-25"))).toBe(true);
    expect(step).toContain("ISO-10303-21");
    expect(step).toContain("AP242_MANAGED_MODEL_BASED_3D_ENGINEERING");
    expect(step).toContain("FACETED_BREP");
    expect(step).toContain("J1_33482-4801");
  });

  it("실드 멀티코어 케이블의 외피와 실드층을 함께 만든다", () => {
    const project = createSampleProject("SHIELDED CABLE");
    project.parts.push({
      id: "part-shielded-cable",
      partNumber: "SHIELD-4C",
      manufacturer: "TEST",
      description: "4 core shielded cable",
      revision: "A",
      category: "cable",
      unit: "m",
      color: "BK",
      attributes: { construction: "shieldedMultiCore", coreCount: "4", outerDiameterMm: "8", coreDiameterMm: "1.2", breakoutLengthMm: "30" },
    });
    project.harnesses[0].segments[0].cablePartId = "part-shielded-cable";
    const meshes = buildHarnessCadData(project, project.harnesses[0]).meshes;
    expect(meshes.some((mesh) => mesh.name === "MAIN_JACKET")).toBe(true);
    expect(meshes.some((mesh) => mesh.name === "MAIN_SHIELD")).toBe(true);
  });

  it("생성한 STEP을 OpenCascade가 다시 읽는다", async () => {
    const project = createSampleProject("STEP ROUND TRIP");
    const step = buildHarnessStep(project, project.harnesses[0]);
    const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd();
    const occt = await occtImportJs({ locateFile: () => `${cwd}/node_modules/occt-import-js/dist/occt-import-js.wasm` });
    const result = occt.ReadStepFile(new TextEncoder().encode(step), { linearUnit: "millimeter" }) as { success: boolean; meshes: unknown[] };
    expect(result.success).toBe(true);
    expect(result.meshes.length).toBeGreaterThan(0);
  });

  it("형상이 없는 프로젝트는 빈 STEP을 만들지 않는다", () => {
    const project = createSampleProject("EMPTY");
    project.harnesses[0].nodes = [];
    project.harnesses[0].segments = [];
    project.harnesses[0].conductors = [];
    expect(() => buildHarnessStep(project, project.harnesses[0])).toThrow("3D 형상");
  });
});
