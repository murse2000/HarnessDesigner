import { describe, expect, it } from "vitest";
import { createSampleProject } from "../test/sampleProject";
import { validateProject } from "./validation";

describe("제조 DRC", () => {
  it("중복된 커넥터와 전선 참조명을 검출한다", () => {
    const project = createSampleProject();
    const harness = project.harnesses[0];
    harness.nodes[1].reference = harness.nodes[0].reference;
    harness.conductors[1].reference = harness.conductors[0].reference;

    const issues = validateProject(project).filter((issue) => issue.code === "DUPLICATE_REFERENCE");
    expect(issues).toHaveLength(2);
  });
});
