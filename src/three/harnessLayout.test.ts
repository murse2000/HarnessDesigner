import { describe, expect, it } from "vitest";
import { sampleHarness } from "../domain/sample";
import { getCompactCoilLayout, layoutHarnessNodes } from "./harnessLayout";

describe("layoutHarnessNodes", () => {
  it("2D 배치 방향을 유지하면서 구간의 실제 mm 길이를 사용한다", () => {
    const harness = structuredClone(sampleHarness);
    const positions = layoutHarnessNodes(harness);

    for (const segment of harness.segments) {
      const start = positions.get(segment.fromNodeId)!;
      const end = positions.get(segment.toNodeId)!;
      expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeCloseTo(segment.lengthMm, 5);
    }
  });

  it("2D 좌표가 같은 노드도 입력된 구간 길이만큼 배치한다", () => {
    const harness = structuredClone(sampleHarness);
    harness.nodes[1].position = { ...harness.nodes[0].position };
    harness.segments = [harness.segments[0]];

    const positions = layoutHarnessNodes(harness);
    const start = positions.get(harness.segments[0].fromNodeId)!;
    const end = positions.get(harness.segments[0].toNodeId)!;
    expect(Math.hypot(end.x - start.x, end.z - start.z)).toBe(450);
  });

  it("컴팩트 배치에서는 긴 구간의 화면상 노드 간격만 제한한다", () => {
    const harness = structuredClone(sampleHarness);
    const positions = layoutHarnessNodes(harness, 180);
    const segment = harness.segments[0];
    const start = positions.get(segment.fromNodeId)!;
    const end = positions.get(segment.toNodeId)!;
    expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeCloseTo(180, 5);
    expect(segment.lengthMm).toBe(450);
  });

  it("컴팩트 코일은 일반 구간 1회, 매우 긴 구간도 최대 3회만 감는다", () => {
    expect(getCompactCoilLayout(450, 180)?.turns).toBe(1);
    expect(getCompactCoilLayout(3000, 180)?.turns).toBe(2);
    expect(getCompactCoilLayout(10000, 180)?.turns).toBe(3);
  });
});
