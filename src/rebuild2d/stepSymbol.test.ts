import { describe, expect, it } from "vitest";
import type { ModelAsset } from "../domain/types";
import { extractPartDrawing } from "./dxfSymbol";
import { extractStepShadedPartDrawing, preferStepShadedDrawing, projectStepDrawing } from "./stepSymbol";

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
    expect(drawing.surfaces).toHaveLength(2);

    const saved = extractPartDrawing(drawing, drawing.bounds, 1);
    expect(saved.sourceName).toBe("plate.step · STEP 투영");
    expect(saved.paths).toHaveLength(4);
    expect(saved.widthMm).toBe(20);
    expect(saved.heightMm).toBe(10);
  });

  it("STEP 표면을 투명 배경의 음영 기술 일러스트로 저장한다", () => {
    const projected = projectStepDrawing(asset, { x: 0, y: 0, z: 0 });
    const saved = extractStepShadedPartDrawing(projected, asset, { "0": "#ff0000" }, projected.bounds, 2, 3);

    expect(saved.paths).toEqual([]);
    expect(saved.widthMm).toBe(40);
    expect(saved.heightMm).toBe(20);
    expect(saved.imageDataUrl).toMatch(/^data:image\/svg\+xml/);
    const svg = decodeURIComponent(saved.imageDataUrl!.split(",", 2)[1]);
    expect(svg).toContain("fill=\"#ff0000\"");
    expect(svg).toContain("stroke=\"#314a59\"");
    expect(svg).not.toContain("<rect");
  });

  it("저장된 STEP 원본이 있으면 기존 선 도면보다 음영 투영을 우선한다", () => {
    const projected = projectStepDrawing(asset, { x: 0, y: 0, z: 0 });
    const technical = extractPartDrawing(projected, projected.bounds, 2);
    technical.editorState = {
      source: projected,
      selection: projected.bounds,
      viewBox: projected.bounds,
      pinPoints: [],
      stepAsset: asset,
      stepRotation: { x: 0, y: 0, z: 0 },
      stepRenderMode: "technical",
      stepSurfaceColors: { "0": "#00ff00" },
    };

    const preferred = preferStepShadedDrawing(technical);

    expect(preferred.paths).toEqual([]);
    expect(preferred.imageDataUrl).toContain("%2300ff00");
    expect(preferred.editorState).toBe(technical.editorState);
  });
});
