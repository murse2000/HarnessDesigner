import { describe, expect, it } from "vitest";
import { createSampleProject } from "../test/sampleProject";
import { searchPinDestinations } from "./destinations";

describe("핀 목적지 검색", () => {
  it("참조명과 핀 번호로 검색하고 용량이 찬 핀은 제외한다", () => {
    const project = createSampleProject();
    const harness = project.harnesses[0];
    const source = harness.nodes.find((node) => node.reference === "J1")!;
    const target = harness.nodes.find((node) => node.reference === "J2")!;
    const connectedPinId = harness.conductors.find((wire) => wire.to.nodeId === target.id)?.to.pinId;
    const availablePin = target.pins.find((pin) => pin.id !== connectedPinId)!;

    const results = searchPinDestinations(harness, project.parts, source.id, `J2 ${availablePin.number}`);

    expect(results.map((item) => item.pinId)).toEqual([availablePin.id]);
    expect(results.some((item) => item.pinId === connectedPinId)).toBe(false);
  });

  it("부품번호와 핀 이름도 검색한다", () => {
    const project = createSampleProject();
    const harness = project.harnesses[0];
    const source = harness.nodes[0];
    const target = harness.nodes.find((node) => node.id !== source.id && node.pins.length > 2)!;
    const part = project.parts.find((item) => item.id === target.partId)!;

    expect(searchPinDestinations(harness, project.parts, source.id, part.partNumber).length).toBeGreaterThan(0);
    expect(searchPinDestinations(harness, project.parts, source.id, target.pins[2].name).some((item) => item.pinId === target.pins[2].id)).toBe(true);
  });
});
