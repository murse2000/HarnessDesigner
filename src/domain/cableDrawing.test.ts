import { describe, expect, it } from "vitest";
import { cableBreakoutGeometry, cableFanoutPath, cableJacketGeometry } from "./cableDrawing";

describe("멀티코어 케이블 2D 표시", () => {
  it("양끝 팬아웃 사이에 외피 구간을 남긴다", () => {
    expect(cableBreakoutGeometry(100, 700)).toEqual({ sourceX: 210, targetX: 590 });
    expect(cableBreakoutGeometry(700, 100)).toEqual({ sourceX: 590, targetX: 210 });
  });

  it("핀에서 외피 끝점으로 모이는 팬아웃 곡선을 만든다", () => {
    expect(cableFanoutPath(100, 40, 210, 100)).toBe("M 100 40 C 148 40, 162 100, 210 100");
  });

  it("수동 오프셋을 외피 양 끝점에 동일하게 적용한다", () => {
    expect(cableJacketGeometry(100, 40, 700, 120, 110, 20, 80)).toEqual({
      sourceX: 230,
      sourceY: 120,
      targetX: 610,
      targetY: 200,
    });
  });

  it("양쪽 팬아웃 길이를 독립적으로 조절해 외피 길이를 바꾼다", () => {
    expect(cableJacketGeometry(100, 40, 700, 120, 110, 20, 80, 40, 60)).toEqual({
      sourceX: 160,
      sourceY: 120,
      targetX: 660,
      targetY: 200,
    });
  });

  it("외피 끝점이 교차하지 않도록 최소 표시 길이를 남긴다", () => {
    expect(cableBreakoutGeometry(100, 700, 110, 400, 400)).toEqual({ sourceX: 500, targetX: 540 });
  });
});
