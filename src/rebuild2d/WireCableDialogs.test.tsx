import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addConnector, createEmptyProject } from "./model";
import { WireCableRunDialog } from "./WireCableDialogs";
import type { LibraryPage2D, LibrarySummary2D } from "./library";

const backendInvoke = vi.fn();

vi.mock("../platform", () => ({
  backendInvoke: (...args: unknown[]) => backendInvoke(...args),
}));

const summary: LibrarySummary2D = {
  path: "/tmp/parts.hlib2d",
  id: "library-1",
  name: "Parts",
  revision: "3",
  partCount: 1,
};

function harnessWithTwoConnectors() {
  let project = createEmptyProject();
  const harnessId = project.harnesses[0].id;
  project = addConnector(project, harnessId, { name: "J1", partNumber: "A", manufacturer: "Test", pinCount: 4 }, { x: 0, y: 0 }).project;
  project = addConnector(project, harnessId, { name: "J2", partNumber: "B", manufacturer: "Test", pinCount: 4 }, { x: 500, y: 0 }).project;
  return project.harnesses[0];
}

describe("전선과 케이블 런 추가", () => {
  beforeEach(() => backendInvoke.mockReset());

  it("사용 해제한 코어는 매핑에서 제외하고 부품 스냅샷에는 유지한다", async () => {
    const page: LibraryPage2D = {
      summary,
      total: 1,
      offset: 0,
      limit: 100,
      parts: [{
        id: "cable-1",
        category: "cable",
        name: "4C 케이블",
        partNumber: "CBL-4C",
        manufacturer: "Test",
        description: "",
        outerDiameterMm: 6.2,
        pins: [],
        cores: [
          { name: "CORE 1", color: "BK", gauge: "22 AWG" },
          { name: "CORE 2", color: "WH", gauge: "22 AWG" },
          { name: "CORE 3", color: "RD", gauge: "22 AWG" },
          { name: "CORE 4", color: "GN", gauge: "22 AWG" },
        ],
      }],
    };
    backendInvoke.mockResolvedValue(page);
    const onSubmit = vi.fn();

    render(<WireCableRunDialog kind="cable" summary={summary} harness={harnessWithTwoConnectors()} onCancel={() => {}} onOpenLibrary={() => {}} onSubmit={onSubmit} />);
    fireEvent.click(await screen.findByText("CBL-4C"));
    fireEvent.click(screen.getByLabelText("4번 코어 사용"));
    fireEvent.click(screen.getByRole("button", { name: "케이블 런 생성" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      part: expect.objectContaining({
        cores: expect.arrayContaining([expect.objectContaining({ name: "CORE 4" })]),
        source: { libraryId: "library-1", libraryRevision: "3", partId: "cable-1" },
      }),
      mappings: expect.arrayContaining([
        expect.objectContaining({ coreIndex: 0 }),
        expect.objectContaining({ coreIndex: 1 }),
        expect.objectContaining({ coreIndex: 2 }),
      ]),
    }));
    expect(onSubmit.mock.calls[0][0].mappings).toHaveLength(3);
    expect(onSubmit.mock.calls[0][0].part.cores).toHaveLength(4);
  });
});
