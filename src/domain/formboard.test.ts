import { describe, expect, it } from "vitest";
import { buildFormboardLayout, createFormboardState, fitFormboardSegmentRoute, formboardCableGeometry, formboardNodeRouteAngle, formboardSegmentMetrics } from "./formboard";
import { createSampleProject } from "../test/sampleProject";

describe("1:1 폼보드 배치", () => {
  it("각 번들의 도면 길이를 등록된 제조 길이와 일치시킨다", () => {
    const harness = createSampleProject().harnesses[0];
    const layout = buildFormboardLayout(harness);

    for (const segment of harness.segments) {
      const from = layout.nodes[segment.fromNodeId];
      const to = layout.nodes[segment.toNodeId];
      expect(Math.hypot(to.x - from.x, to.y - from.y)).toBeCloseTo(segment.lengthMm, 6);
    }
  });

  it("저장된 노드와 경로점으로 폼보드 길이 오차를 계산한다", () => {
    const harness = createSampleProject().harnesses[0];
    harness.formboard = createFormboardState(harness);
    harness.formboard.nodePositions["node-sp1"] = { x: 200, y: 0 };
    const from = harness.formboard.nodePositions["node-j1"];
    const to = harness.formboard.nodePositions["node-sp1"];
    harness.formboard.segmentRoutes["seg-1"] = fitFormboardSegmentRoute(from, to, 450) ?? [];

    const metric = formboardSegmentMetrics(harness).find((item) => item.segmentId === "seg-1");
    expect(metric?.drawingLengthMm).toBeCloseTo(450, 6);
    expect(metric?.valid).toBe(true);
  });

  it("노드 간 거리가 제조 길이보다 길면 자동 경로 맞춤을 거부한다", () => {
    expect(fitFormboardSegmentRoute({ x: 0, y: 0 }, { x: 451, y: 0 }, 450)).toBeNull();
  });

  it("양 끝 커넥터에서 케이블 쪽을 향하는 인입 각도를 계산한다", () => {
    const harness = createSampleProject().harnesses[0];
    harness.segments = [harness.segments[0]];
    harness.formboard = createFormboardState(harness);
    harness.formboard.nodePositions[harness.segments[0].fromNodeId] = { x: 0, y: 0 };
    harness.formboard.nodePositions[harness.segments[0].toNodeId] = { x: 100, y: 100 };
    const layout = buildFormboardLayout(harness);

    expect(formboardNodeRouteAngle(harness, layout, harness.segments[0].fromNodeId)).toBeCloseTo(45, 6);
    expect(formboardNodeRouteAngle(harness, layout, harness.segments[0].toNodeId)).toBeCloseTo(-135, 6);
  });

  it("여러 경로가 직접 연결된 노드는 자동 회전하지 않는다", () => {
    const harness = createSampleProject().harnesses[0];
    const layout = buildFormboardLayout(harness);

    expect(formboardNodeRouteAngle(harness, layout, "node-sp1")).toBeNull();
  });

  it("멀티코어 케이블 경로를 양 끝 팬아웃과 중앙 외피로 분리한다", () => {
    const geometry = formboardCableGeometry([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 60 }], 20, 30);

    expect(geometry?.sourceFanoutPoints.at(-1)).toEqual({ x: 20, y: 0 });
    expect(geometry?.jacketPoints).toEqual([{ x: 20, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }]);
    expect(geometry?.targetFanoutPoints[0]).toEqual({ x: 40, y: 30 });
    expect(geometry?.targetFanoutPoints.at(-1)).toEqual({ x: 40, y: 60 });
  });
});
