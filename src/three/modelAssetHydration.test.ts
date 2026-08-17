import { describe, expect, it } from "vitest";
import { decodeBase64Bytes } from "./modelAssetHydration";

describe("STEP 모델 자산 복원", () => {
  it("SQLite에 저장된 Base64 원본을 바이트 배열로 되돌린다", () => {
    expect(Array.from(decodeBase64Bytes("U1RFUA=="))).toEqual([83, 84, 69, 80]);
  });
});
