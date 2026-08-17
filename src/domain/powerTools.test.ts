import { describe, expect, it } from "vitest";
import { createProject } from "./sample";
import { conductorsInSegment, duplicatePartGroups, partUsage, unusedParts } from "./powerTools";

describe("하네스 파워 도구", () => {
  it("번들에 통과하는 전선을 찾는다", () => {
    const project = createProject();
    expect(conductorsInSegment(project.harnesses[0], "seg-1").map((item) => item.reference)).toEqual(["W001", "W002"]);
  });

  it("부품 사용처와 미사용 및 중복 부품을 계산한다", () => {
    const project = createProject();
    const duplicate = { ...structuredClone(project.parts[0]), id: "duplicate-part" };
    const unused = { ...structuredClone(project.parts[0]), id: "unused-part", partNumber: "UNUSED" };
    project.parts.push(duplicate, unused);
    expect(partUsage(project).some((item) => item.partId === project.parts[0].id)).toBe(true);
    expect(duplicatePartGroups(project.parts).some((group) => group.some((item) => item.id === duplicate.id))).toBe(true);
    expect(unusedParts(project).map((item) => item.id)).toEqual(expect.arrayContaining([duplicate.id, unused.id]));
  });
});
