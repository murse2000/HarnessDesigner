import { describe, expect, it } from "vitest";
import { createSampleProject } from "../test/sampleProject";
import { buildThreeSceneItems } from "./sceneBrowser";

describe("3D 씬 탐색기", () => {
  it("하우징, 구간, 부자재를 제조 정보와 함께 나열한다", () => {
    const project = createSampleProject();
    const items = buildThreeSceneItems(project, project.harnesses[0]);

    expect(items.find((item) => item.id === "node-j1")?.detail).toContain("33482-4801");
    expect(items.find((item) => item.id === "seg-1")?.detail).toBe("개별 전선 · 2C · 450 mm");
    expect(items.find((item) => item.id === "acc-label-1")?.detail).toBe("label · 2 ea");
  });

  it("멀티코어 구간에는 해당 케이블 런에 속한 코어만 집계한다", () => {
    const project = createSampleProject();
    const harness = project.harnesses[0];
    const segment = harness.segments[0];
    project.parts.push({ id: "cable-4c", partNumber: "8444", manufacturer: "Belden", description: "", revision: "A", category: "cable", unit: "m", color: "BK", attributes: { coreCount: "4" } });
    segment.cablePartId = "cable-4c";
    harness.conductors[0].cableRunId = segment.id;
    harness.conductors[0].wirePartId = "cable-4c";

    expect(buildThreeSceneItems(project, harness).find((item) => item.id === segment.id)?.detail).toBe("8444 · 1C · 450 mm");
  });
});
