import { describe, expect, it } from "vitest";
import { createProject } from "../domain/sample";
import { buildThreeSceneItems } from "./sceneBrowser";

describe("3D 씬 탐색기", () => {
  it("하우징, 구간, 부자재를 제조 정보와 함께 나열한다", () => {
    const project = createProject();
    const items = buildThreeSceneItems(project, project.harnesses[0]);

    expect(items.find((item) => item.id === "node-j1")?.detail).toContain("MX150-8P");
    expect(items.find((item) => item.id === "seg-1")?.detail).toBe("개별 전선 · 2C · 450 mm");
    expect(items.find((item) => item.id === "acc-label-1")?.detail).toBe("label · 2 ea");
  });
});
