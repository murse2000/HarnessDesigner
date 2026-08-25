import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectorPickerDialog, PartsLibraryDialog } from "./LibraryDialogs";
import type { LibraryPage2D, LibrarySummary2D } from "./library";

const backendInvoke = vi.fn();

vi.mock("../platform", () => ({
  backendInvoke: (...args: unknown[]) => backendInvoke(...args),
}));

const summary: LibrarySummary2D = {
  path: "/tmp/parts.hlib2d",
  id: "library-1",
  name: "Parts",
  revision: "2",
  partCount: 1,
};

describe("라이브러리 커넥터 선택", () => {
  beforeEach(() => {
    backendInvoke.mockReset();
  });

  it("검색한 외부 부품의 핀과 출처를 커넥터 초안으로 전달한다", async () => {
    const page: LibraryPage2D = {
      summary,
      total: 1,
      offset: 0,
      limit: 100,
      parts: [{
        id: "part-1",
        category: "housing",
        name: "4핀 하우징",
        partNumber: "TEST-04",
        manufacturer: "Test",
        description: "",
        outerDiameterMm: null,
        pins: [{ number: "1", name: "POWER" }, { number: "2", name: "GND" }],
        cores: [],
      }],
    };
    backendInvoke.mockResolvedValue(page);
    const onSubmit = vi.fn();

    render(<ConnectorPickerDialog summary={summary} onCancel={() => {}} onOpenLibrary={() => {}} onSubmit={onSubmit} />);
    fireEvent.click(await screen.findByText("TEST-04"));
    fireEvent.click(screen.getByRole("button", { name: "추가" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      partNumber: "TEST-04",
      pins: [{ number: "1", name: "POWER" }, { number: "2", name: "GND" }],
      source: { libraryId: "library-1", libraryRevision: "2", partId: "part-1" },
    }));
  });

  it("부품 목록에 등록 도면 미리보기와 미등록 상태를 표시한다", async () => {
    const page: LibraryPage2D = {
      summary: { ...summary, partCount: 2 },
      total: 2,
      offset: 0,
      limit: 100,
      parts: [{
        id: "part-drawing",
        category: "housing",
        name: "도면 등록 하우징",
        partNumber: "DRAWING-04",
        manufacturer: "Test",
        description: "",
        outerDiameterMm: null,
        pins: [{ number: "1", name: "PIN" }],
        cores: [],
        drawing: {
          sourceName: "drawing.pdf · 1페이지",
          widthMm: 20,
          heightMm: 10,
          paths: [],
          imageDataUrl: "data:image/png;base64,AA==",
          unsupportedEntities: [],
        },
      }, {
        id: "part-empty",
        category: "housing",
        name: "도면 없는 하우징",
        partNumber: "EMPTY-04",
        manufacturer: "Test",
        description: "",
        outerDiameterMm: null,
        pins: [{ number: "1", name: "PIN" }],
        cores: [],
      }],
    };
    backendInvoke.mockResolvedValue(page);

    render(<PartsLibraryDialog summary={page.summary} onSummaryChange={() => {}} onClose={() => {}} />);

    expect(await screen.findByLabelText("DRAWING-04 2D 도면 등록됨")).toContainHTML("<image");
    expect(screen.getByLabelText("EMPTY-04 2D 도면 없음")).toHaveTextContent("도면 없음");
    fireEvent.click(screen.getByText("DRAWING-04"));
    expect(screen.getByRole("button", { name: "2D 도면 · 등록됨" })).toBeInTheDocument();
    expect(screen.getByText("drawing.pdf · 1페이지")).toBeInTheDocument();
  });
});
