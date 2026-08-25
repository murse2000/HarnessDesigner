import { describe, expect, it } from "vitest";
import { applyConnectorRemap, connectorRemapErrors, connectorRemapPlan, switchConnectorTerminal, terminalSwitchErrors } from "./connectionTools";
import { createSampleProject } from "../test/sampleProject";
import type { PartSnapshot, PinDefinition } from "./types";

describe("커넥터 연결 자동 재매핑", () => {
  it("같은 핀 번호를 우선 유지하고 없는 번호는 남은 핀 순서로 배정한다", () => {
    const project = createSampleProject();
    const harness = project.harnesses[0];
    const pins: PinDefinition[] = [
      { id: "new-1", number: "1", name: "", position: { x: 0, y: 0 }, terminalPartId: "part-terminal" },
      { id: "new-A", number: "A", name: "", position: { x: 20, y: 0 }, terminalPartId: "part-terminal" },
    ];
    const plan = connectorRemapPlan(harness, "node-j1", pins);
    expect(plan.map((item) => [item.oldPinNumber, item.targetPinId])).toEqual([["1", "new-1"], ["2", "new-A"]]);
    expect(connectorRemapErrors(plan, pins, project.parts)).toEqual([]);
    applyConnectorRemap(harness, "node-j1", pins, plan);
    expect(harness.conductors.map((item) => item.from.pinId)).toEqual(["new-1", "new-A"]);
  });

  it("연결 그룹보다 새 핀이 적으면 적용 오류를 반환한다", () => {
    const project = createSampleProject();
    const pins: PinDefinition[] = [{ id: "new-1", number: "1", name: "", position: { x: 0, y: 0 }, terminalPartId: "part-terminal" }];
    const plan = connectorRemapPlan(project.harnesses[0], "node-j1", pins);
    expect(connectorRemapErrors(plan, pins, project.parts)).toContain("기존 핀 2의 새 핀이 지정되지 않았습니다.");
  });

  it("더블 크림프 연결은 한 핀 그룹으로 유지하고 새 터미널 용량을 검사한다", () => {
    const project = createSampleProject();
    const harness = project.harnesses[0];
    const terminal = project.parts.find((part) => part.id === "part-terminal")!;
    terminal.attributes.maxConductors = "2";
    const second = structuredClone(harness.conductors[1]);
    second.id = "wire-double";
    second.reference = "W003";
    second.from.pinId = "j1-pin-1";
    harness.conductors = [harness.conductors[0], second];
    const pins: PinDefinition[] = [{ id: "new-1", number: "1", name: "", position: { x: 0, y: 0 }, terminalPartId: terminal.id }];
    const plan = connectorRemapPlan(harness, "node-j1", pins);
    expect(plan[0].conductorIds).toEqual(["wire-1", "wire-double"]);
    expect(connectorRemapErrors(plan, pins, project.parts)).toEqual([]);
    terminal.attributes.maxConductors = "1";
    expect(connectorRemapErrors(plan, pins, project.parts)[0]).toContain("2가닥");
  });
});

describe("터미널 일괄 교체", () => {
  it("호환 터미널을 모든 캐비티와 연결 종단에 반영한다", () => {
    const project = createSampleProject();
    const housing = project.parts.find((part) => part.id === "builtin-molex-33482-4801")!;
    const replacement: PartSnapshot = { id: "terminal-new", partNumber: "TERM-NEW", manufacturer: "TEST", description: "", revision: "A", category: "terminal", unit: "ea", attributes: { defaultSealPartId: "part-seal", maxConductors: "2" } };
    project.parts.push(replacement);
    housing.attributes.compatibleTerminalPartIds = JSON.stringify(["part-terminal", replacement.id]);
    expect(terminalSwitchErrors(project, "harness-main", "node-j1", replacement.id)).toEqual([]);
    switchConnectorTerminal(project, "harness-main", "node-j1", replacement.id);
    expect(project.harnesses[0].nodes[0].pins.every((pin) => pin.terminalPartId === replacement.id)).toBe(true);
    expect(project.harnesses[0].conductors.every((conductor) => conductor.startTermination.terminalPartId === replacement.id)).toBe(true);
  });

  it("하우징과 호환되지 않는 터미널은 차단한다", () => {
    const project = createSampleProject();
    const incompatible: PartSnapshot = { id: "terminal-other", partNumber: "OTHER", manufacturer: "TEST", description: "", revision: "A", category: "terminal", unit: "ea", attributes: {} };
    project.parts.push(incompatible);
    expect(terminalSwitchErrors(project, "harness-main", "node-j1", incompatible.id)[0]).toContain("호환되지 않습니다");
  });
});
