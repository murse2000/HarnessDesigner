import { describe, expect, it } from "vitest";
import type { ModelAsset } from "../domain/types";
import { extractPartDrawing } from "./dxfSymbol";
import { projectStepDrawing } from "./stepSymbol";

const asset: ModelAsset = {
  id: "model",
  name: "plate",
  sourceFormat: "step",
  sourceName: "plate.step",
  sourceDataBase64: "",
  meshes: [{
    name: "plate",
    positions: [0, 0, 0, 20, 0, 0, 20, 10, 0, 0, 10, 0],
    indices: [0, 1, 2, 0, 2, 3],
  }],
};

describe("STEP 부품 도면 변환", () => {
  it("투영 특징선을 2D 부품 경로로 변환한다", () => {
    const drawing = projectStepDrawing(asset, { x: 0, y: 0, z: 0 });

    expect(drawing.sourceName).toBe("plate.step · STEP 투영");
    expect(drawing.paths).toHaveLength(4);
    expect(drawing.bounds.width).toBe(20);
    expect(drawing.bounds.height).toBe(10);
    expect(drawing.paths.every((path) => path.sourceType === "STEP_EDGE")).toBe(true);

    const saved = extractPartDrawing(drawing, drawing.bounds, 1);
    expect(saved.sourceName).toBe("plate.step · STEP 투영");
    expect(saved.paths).toHaveLength(4);
    expect(saved.widthMm).toBe(20);
    expect(saved.heightMm).toBe(10);
  });
});
