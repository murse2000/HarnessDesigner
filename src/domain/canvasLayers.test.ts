import { describe, expect, it } from "vitest";
import { canvasLayerZIndex, createCanvasLayers, updateCanvasLayer } from "./canvasLayers";

describe("도면 레이어 상태", () => {
  it("모든 레이어를 표시 및 편집 가능 상태로 시작한다", () => {
    const layers = createCanvasLayers();
    expect(Object.values(layers).every((layer) => layer.visible && !layer.locked)).toBe(true);
  });

  it("선택한 레이어의 표시와 잠금만 변경한다", () => {
    const layers = createCanvasLayers();
    const hidden = updateCanvasLayer(layers, "conductors", "visible");
    const locked = updateCanvasLayer(hidden, "nodes", "locked");

    expect(locked.conductors.visible).toBe(false);
    expect(locked.nodes.locked).toBe(true);
    expect(locked.annotations).toEqual({ visible: true, locked: false });
    expect(layers.conductors.visible).toBe(true);
  });

  it("케이블 외피를 도면 템플릿 위와 개별 코어 아래에 표시한다", () => {
    expect(canvasLayerZIndex.sheet).toBeLessThan(canvasLayerZIndex.cables);
    expect(canvasLayerZIndex.cables).toBeLessThan(canvasLayerZIndex.conductors);
  });
});
