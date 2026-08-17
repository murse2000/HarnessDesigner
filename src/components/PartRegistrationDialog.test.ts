import { describe, expect, it } from "vitest";
import { assetDropZoneAtPoint } from "./partAssetDrop";

const photoRect = { left: 10, right: 110, top: 20, bottom: 120 };
const modelRect = { left: 10, right: 110, top: 130, bottom: 330 };

describe("assetDropZoneAtPoint", () => {
  it("사진과 STEP 드롭 영역을 구분한다", () => {
    expect(assetDropZoneAtPoint({ x: 40, y: 60 }, photoRect, modelRect)).toBe(
      "photo",
    );
    expect(assetDropZoneAtPoint({ x: 40, y: 200 }, photoRect, modelRect)).toBe(
      "model",
    );
  });

  it("등록 영역 밖의 파일 드롭은 무시한다", () => {
    expect(assetDropZoneAtPoint({ x: 200, y: 200 }, photoRect, modelRect)).toBe(
      null,
    );
  });
});
