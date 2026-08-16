import { describe, expect, it } from "vitest";
import { createProject } from "./sample";
import { pinConductorCapacity, pinConductorUsage, pinHasConductorCapacity, terminalConductorCapacity } from "./pinCapacity";

describe("터미널 전선 수용량", () => {
  it("미지정 터미널은 한 가닥만 허용한다", () => {
    expect(terminalConductorCapacity()).toBe(1);
  });

  it("더블 크림프 터미널은 같은 핀에 두 가닥을 허용한다", () => {
    const project = createProject();
    const harness = project.harnesses[0];
    const terminal = project.parts.find((part) => part.id === "part-terminal")!;
    terminal.attributes.maxConductors = "2";
    const pinId = "j1-pin-1";

    expect(pinConductorCapacity(project.parts, harness.nodes[0], pinId)).toBe(2);
    expect(pinConductorUsage(harness, "node-j1", pinId)).toBe(1);
    expect(pinHasConductorCapacity(harness, project.parts, "node-j1", pinId)).toBe(true);

    const second = structuredClone(harness.conductors[1]);
    second.id = "wire-double-crimp";
    second.from = { nodeId: "node-j1", pinId };
    harness.conductors.push(second);
    expect(pinConductorUsage(harness, "node-j1", pinId)).toBe(2);
    expect(pinHasConductorCapacity(harness, project.parts, "node-j1", pinId)).toBe(false);
  });
});
