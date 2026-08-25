import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PartSymbolEditor, stepRotationFromDrag } from "./PartSymbolEditor";
import type { LibraryPartDraft2D } from "./library";

const pdfMocks = vi.hoisted(() => ({
  parsePdfDrawing: vi.fn(),
  parseImageDrawing: vi.fn(),
}));

vi.mock("./pdfSymbol", () => ({
  extractRasterPartDrawing: vi.fn(),
  parsePdfDrawing: pdfMocks.parsePdfDrawing,
  parseImageDrawing: pdfMocks.parseImageDrawing,
}));

const draft: LibraryPartDraft2D = {
  category: "housing",
  name: "테스트 하우징",
  partNumber: "TEST-04",
  manufacturer: "Test",
  description: "",
  outerDiameterMm: null,
  pins: [{ number: "1", name: "PIN" }],
  cores: [],
};

function raster(sourceName: string, sourceType: "pdf" | "image", pageNumber = 1, pageCount = 1) {
  return {
    sourceName,
    sourceType,
    bounds: { x: 0, y: 0, width: 100, height: 80 },
    paths: [],
    unsupported: [],
    imageDataUrl: "data:image/png;base64,AA==",
    pageNumber,
    pageCount,
  };
}

describe("부품 심벌 도면 입력", () => {
  beforeEach(() => {
    pdfMocks.parsePdfDrawing.mockReset();
    pdfMocks.parseImageDrawing.mockReset();
  });

  it("여러 장의 PDF에서 원하는 페이지로 이동한다", async () => {
    pdfMocks.parsePdfDrawing.mockImplementation(async (_data: Uint8Array, name: string, page = 1) => raster(name, "pdf", page, 3));
    const { container } = render(<PartSymbolEditor draft={draft} onApply={() => {}} onClose={() => {}} />);
    const file = new File([new Uint8Array([1, 2, 3])], "pages.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "arrayBuffer", { value: async () => new Uint8Array([1, 2, 3]).buffer });

    fireEvent.change(container.querySelector("input[type=file]")!, { target: { files: [file] } });
    expect(await screen.findByLabelText("PDF 페이지")).toHaveValue("1");
    fireEvent.click(screen.getByRole("button", { name: "다음 PDF 페이지" }));

    await waitFor(() => expect(screen.getByLabelText("PDF 페이지")).toHaveValue("2"));
    expect(pdfMocks.parsePdfDrawing).toHaveBeenLastCalledWith(expect.any(Uint8Array), "pages.pdf", 2);
  });

  it("PNG 파일과 클립보드 이미지를 도면으로 불러온다", async () => {
    pdfMocks.parseImageDrawing.mockImplementation(async (_file: Blob, name: string) => raster(name, "image"));
    const { container } = render(<PartSymbolEditor draft={draft} onApply={() => {}} onClose={() => {}} />);
    const image = new File([new Uint8Array([1])], "connector.png", { type: "image/png" });

    fireEvent.change(container.querySelector("input[type=file]")!, { target: { files: [image] } });
    expect(await screen.findByText("connector.png · 이미지")).toBeInTheDocument();

    const clipboardImage = new File([new Uint8Array([2])], "", { type: "image/png" });
    fireEvent.paste(window, { clipboardData: { items: [{ type: "image/png", getAsFile: () => clipboardImage }] } });
    expect(await screen.findByText("클립보드 이미지.png · 이미지")).toBeInTheDocument();
  });

  it("STEP 마우스 드래그를 X/Y 또는 Z 회전값으로 변환한다", () => {
    expect(stepRotationFromDrag({ x: 0, y: 0, z: 0 }, 100, -50, false)).toEqual({ x: -20, y: 40, z: 0 });
    expect(stepRotationFromDrag({ x: 10, y: 20, z: 30 }, 50, 80, true)).toEqual({ x: 10, y: 20, z: 50 });
  });

  it("등록된 벡터 도면을 수정할 때 윤곽선 강도를 표시하고 저장한다", async () => {
    const onApply = vi.fn();
    const existingDraft: LibraryPartDraft2D = {
      ...draft,
      pins: [{ number: "1", name: "PIN", anchor: { xMm: 20, yMm: 5, directionX: 1, directionY: 0 } }],
      drawing: {
        sourceName: "registered.dxf",
        widthMm: 20,
        heightMm: 10,
        paths: [{ points: [{ x: 0, y: 0 }, { x: 20, y: 10 }], closed: false, layer: "OUTLINE", sourceType: "LINE" }],
        unsupportedEntities: [],
      },
    };
    render(<PartSymbolEditor draft={existingDraft} onApply={onApply} onClose={() => {}} />);

    const strength = screen.getByRole("slider", { name: "윤곽선 강도" });
    expect(strength).toHaveValue("1");
    fireEvent.change(strength, { target: { value: "2.5" } });
    fireEvent.click(screen.getByRole("button", { name: "심벌 적용" }));

    await waitFor(() => expect(onApply).toHaveBeenCalled());
    expect(onApply.mock.calls[0][0].drawing.outlineStrength).toBe(2.5);
  });
});
