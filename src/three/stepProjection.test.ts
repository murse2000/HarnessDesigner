import { describe, expect, it } from "vitest";
import type { ModelAsset } from "../domain/types";
import { createStepProjectionSymbol, projectStepEdges } from "./stepProjection";

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

describe("STEP 2D 투영", () => {
  it("평면의 삼각 분할선은 제거하고 외곽선만 만든다", () => {
    const segments = projectStepEdges(asset, "front");
    expect(segments).toHaveLength(4);
    expect(segments.some((segment) => segment.x1 === 0 && segment.y1 === 0 && segment.x2 === 20 && segment.y2 === -10)).toBe(false);
  });

  it("실제 mm 크기의 SVG 심벌을 만든다", () => {
    const symbol = createStepProjectionSymbol(asset, "front", 1, "symbol");
    expect(symbol.id).toBe("symbol");
    expect(symbol.sourceName).toBe("plate_front.svg");
    expect(symbol.svg.match(/<line /g)).toHaveLength(4);
    const [, , width, height] = symbol.viewBox.split(" ").map(Number);
    expect(width).toBeGreaterThan(20);
    expect(height).toBeGreaterThan(10);
  });

  it("저장된 3D 인입축과 축 회전을 적용한 뒤 투영한다", () => {
    const aligned = createStepProjectionSymbol(asset, "front", 1, "aligned", { cableAxis: "-y", rollDeg: 0 });
    const [, , alignedWidth, alignedHeight] = aligned.viewBox.split(" ").map(Number);
    const symbol = createStepProjectionSymbol(asset, "front", 1, "rotated", { cableAxis: "-y", rollDeg: 90 });
    const [, , width, height] = symbol.viewBox.split(" ").map(Number);

    expect(alignedWidth).toBeGreaterThan(alignedHeight);
    expect(width).toBeLessThan(height);
  });
});
