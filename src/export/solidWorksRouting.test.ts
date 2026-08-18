import { describe, expect, it } from "vitest";
import { createProject } from "../domain/sample";
import { buildSolidWorksRoutingPackage } from "./solidWorksRouting";

describe("SolidWorks Routing 패키지", () => {
  it("From-To, CPoint, 경로와 정적 참조 STEP을 함께 만든다", () => {
    const project = createProject("ROUTING TEST");
    const harness = project.harnesses[0];
    const output = buildSolidWorksRoutingPackage(project, harness);

    expect(output.fromToRows).toHaveLength(harness.conductors.length + 1);
    expect(output.fromToRows[1]).toEqual(expect.arrayContaining(["W001", "J1", "1", "J2", "1"]));
    expect(output.cableLibraryRows.some((row) => row.includes("TXL-20-RD"))).toBe(true);
    expect(output.entries.map((entry) => entry.path)).toEqual(expect.arrayContaining([
      "manifest.json",
      "routing/CPoints.json",
      "routing/Routes.json",
      "routing/HarnessDesignerRouting.xml",
      "reference/HNS-001_REFERENCE.step",
    ]));
  });

  it("등록된 커넥터 원본 STEP을 components 폴더에 포함한다", () => {
    const project = createProject("ROUTING COMPONENT");
    project.modelAssets.push({ id: "model-j1", name: "J1", sourceFormat: "step", sourceName: "J1.stp", sourceDataBase64: btoa("ISO-10303-21;"), meshes: [] });
    project.parts.find((part) => part.id === "part-housing-8")!.modelAssetId = "model-j1";
    const output = buildSolidWorksRoutingPackage(project, project.harnesses[0]);
    expect(output.entries.some((entry) => entry.path === "components/33482-4801_model-j1.step")).toBe(true);
  });

  it("연결이 없는 하네스는 Routing 패키지를 만들지 않는다", () => {
    const project = createProject("EMPTY ROUTING");
    project.harnesses[0].conductors = [];
    expect(() => buildSolidWorksRoutingPackage(project, project.harnesses[0])).toThrow("From-To 연결");
  });
});
