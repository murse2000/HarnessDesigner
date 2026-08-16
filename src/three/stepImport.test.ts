import { describe, expect, it } from "vitest";
import { normalizeStepMeshes } from "./stepImport";

describe("normalizeStepMeshes", () => {
  it("OCCT의 중첩 배열을 렌더링 가능한 평면 배열로 변환한다", () => {
    const meshes = normalizeStepMeshes({
      success: true,
      meshes: [{
        name: "Housing",
        color: [0.2, 0.4, 0.6],
        attributes: { position: { array: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] }, normal: { array: [[0, 0, 1], [0, 0, 1], [0, 0, 1]] } },
        index: { array: [[0, 1, 2]] },
      }],
    });
    expect(meshes[0]).toMatchObject({ name: "Housing", color: [0.2, 0.4, 0.6], indices: [0, 1, 2] });
    expect(meshes[0].positions).toHaveLength(9);
  });

  it("표시 가능한 메시가 없으면 등록을 중단한다", () => {
    expect(() => normalizeStepMeshes({ success: true, meshes: [] })).toThrow("표시 가능한");
  });
});
