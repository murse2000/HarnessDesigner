import { describe, expect, it } from "vitest";
import { createHarness, createProject } from "./project";

describe("새 프로젝트 생성", () => {
  it("샘플 데이터 없이 편집 가능한 빈 하네스 프로젝트를 만든다", () => {
    const project = createProject();

    expect(project.parts).toEqual([]);
    expect(project.harnesses).toHaveLength(1);
    expect(project.harnesses[0]).toMatchObject({ number: "HNS-001", name: "NEW HARNESS", revision: "A" });
    expect(project.harnesses[0].nodes).toEqual([]);
    expect(project.harnesses[0].segments).toEqual([]);
    expect(project.harnesses[0].conductors).toEqual([]);
    expect(project.harnesses[0].accessories).toEqual([]);
    expect(project.assets).toEqual([]);
    expect(project.modelAssets).toEqual([]);
    expect(project.equipmentProfiles).toEqual([]);
  });

  it("사용자가 추가한 하네스만 빈 상태로 생성한다", () => {
    const harness = createHarness(2);

    expect(harness).toMatchObject({ number: "HNS-002", name: "NEW HARNESS", revision: "A" });
    expect(harness.nodes).toEqual([]);
    expect(harness.segments).toEqual([]);
    expect(harness.conductors).toEqual([]);
    expect(harness.accessories).toEqual([]);
  });
});
