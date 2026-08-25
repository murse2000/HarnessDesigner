import { describe, expect, it } from "vitest";
import { sampleHarness } from "../test/sampleProject";
import { conductorRouteConnectsEndpoints, directWireConductors, directWireLengthMm, getCompactCoilLayout, layoutHarnessNodes, positionHarnessRoutePoint, projectHarnessRoutePoint } from "./harnessLayout";

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

  it("사용자가 지정한 3D 분기점 위치를 자동 배치보다 우선한다", () => {
    const harness = structuredClone(sampleHarness);
    expect(harness.nodes[1].kind).toBe("junction");
    harness.nodes[1].threeDPosition = { x: 125, y: 45, z: -80 };

    expect(layoutHarnessNodes(harness, 180).get(harness.nodes[1].id)).toEqual({ x: 125, y: 45, z: -80 });
  });

  it("일반 전선의 구간 경로가 실제 끝점에 도달하지 않으면 직접 연결로 배치한다", () => {
    const harness = structuredClone(sampleHarness);
    const conductor = harness.conductors[1];
    conductor.routeSegmentIds = [harness.segments[0].id];

    expect(conductorRouteConnectsEndpoints(harness, conductor)).toBe(false);
    expect(directWireConductors(harness).map((item) => item.id)).toContain(conductor.id);
    expect(directWireLengthMm(harness, conductor)).toBe(harness.segments[0].lengthMm);
    const positions = layoutHarnessNodes(harness);
    const start = positions.get(conductor.from.nodeId)!;
    const end = positions.get(conductor.to.nodeId)!;
    expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeCloseTo(harness.segments[0].lengthMm, 5);
  });

  it("컴팩트 코일은 일반 구간 1회, 매우 긴 구간도 최대 3회만 감는다", () => {
    expect(getCompactCoilLayout(450, 180)?.turns).toBe(1);
    expect(getCompactCoilLayout(3000, 180)?.turns).toBe(2);
    expect(getCompactCoilLayout(10000, 180)?.turns).toBe(3);
  });

  it("3D 경로 제어점을 구간 상대 좌표로 저장하고 다시 복원한다", () => {
    const start = { x: 10, y: 5, z: 20 };
    const end = { x: 110, y: 5, z: 20 };
    const routePoint = { t: 0.4, offsetX: 30, offsetY: 15 };
    const position = positionHarnessRoutePoint(start, end, routePoint);
    expect(position).toEqual({ x: 50, y: 20, z: 50 });
    expect(projectHarnessRoutePoint(start, end, position)).toEqual(routePoint);
  });
});
