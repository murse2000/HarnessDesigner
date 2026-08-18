import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PartSnapshot } from "../domain/types";
import { backendInvoke } from "../platform";
import { PartThumbnail } from "./PartThumbnail";

vi.mock("../platform", () => ({
  backendInvoke: vi.fn(),
  isTauri: () => true,
}));

const part: PartSnapshot = {
  id: "housing-1",
  name: "테스트 하우징",
  partNumber: "TEST-001",
  manufacturer: "TEST",
  description: "외부 자산 지연 로딩 검사",
  revision: "A",
  category: "housing",
  unit: "ea",
  attributes: {},
  modelAssetId: "model-1",
};

describe("부품 썸네일 외부 자산 로딩", () => {
  beforeEach(() => vi.mocked(backendInvoke).mockReset());

  it("라이브러리 목록에서는 미리보기 없는 STEP 원본을 자동 조회하지 않는다", () => {
    render(<PartThumbnail part={part} loadAssetPreview={false} />);

    expect(screen.getByText("기본 이미지")).toBeTruthy();
    expect(backendInvoke).not.toHaveBeenCalled();
  });
});
