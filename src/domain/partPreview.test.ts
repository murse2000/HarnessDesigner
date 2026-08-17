import { describe, expect, it } from "vitest";
import { createDrawingPreview, createModelPreview, getPartDrawingPreview, getPartPhotoPreview, selectStoredPreview } from "./partPreview";
import type { ModelAsset, PartSnapshot, SymbolAsset } from "./types";

const part: PartSnapshot = {
  id: "part-1",
  partNumber: "P-1",
  manufacturer: "Maker",
  description: "",
  revision: "A",
  category: "housing",
  unit: "ea",
  attributes: {},
};

describe("부품 대표 미리보기", () => {
  it("사진을 3D와 도면보다 우선한다", () => {
    const photo = { kind: "photo" as const, dataUrl: "data:image/jpeg;base64,photo" };
    expect(selectStoredPreview({ ...part, modelAssetId: "model", symbolAssetId: "symbol", preview: photo })).toBe(photo);
  });

  it("STEP 메시에서 3D SVG 미리보기를 만든다", () => {
    const asset: ModelAsset = {
      id: "model",
      name: "model",
      sourceFormat: "step",
      sourceName: "model.step",
      sourceDataBase64: "",
      meshes: [{ name: "body", positions: [0, 0, 0, 10, 0, 0, 0, 10, 0], indices: [0, 1, 2] }],
    };
    const preview = createModelPreview(asset);
    expect(preview?.kind).toBe("model");
    expect(preview?.dataUrl).toMatch(/^data:image\/svg\+xml/);
  });

  it("DXF/SVG 자산을 도면 미리보기로 만든다", () => {
    const asset: SymbolAsset = { id: "symbol", name: "drawing", sourceFormat: "svg", sourceName: "drawing.svg", viewBox: "0 0 10 10", svg: "<svg viewBox=\"0 0 10 10\"></svg>" };
    expect(createDrawingPreview(asset)).toMatchObject({ kind: "drawing", sourceName: "drawing.svg" });
    expect(getPartDrawingPreview(part, asset)).toMatchObject({ kind: "drawing", sourceName: "drawing.svg" });
  });

  it("수정 창에서 등록된 제조사 사진을 사용한다", () => {
    expect(getPartPhotoPreview({
      ...part,
      attributes: { officialImageUrl: "https://example.com/part.png" },
    })).toEqual({
      kind: "photo",
      dataUrl: "https://example.com/part.png",
      sourceName: "제조사 공식 제품 이미지",
    });
  });
});
