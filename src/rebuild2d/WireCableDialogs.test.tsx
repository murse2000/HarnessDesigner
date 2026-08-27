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

  it("단선 한쪽 끝을 커넥터 없이 탈피 끝단으로 생성한다", async () => {
    backendInvoke.mockResolvedValue({
      summary,
      total: 1,
      offset: 0,
      limit: 100,
      parts: [{
        id: "wire-1",
        category: "wire",
        name: "20 AWG 단선",
        partNumber: "WIRE-20",
        manufacturer: "Test",
        description: "",
        outerDiameterMm: 1.6,
        pins: [],
        cores: [{ name: "WIRE", color: "RD", gauge: "20 AWG" }],
        drawing: {
          sourceName: "wire.png",
          widthMm: 40,
          heightMm: 4,
          paths: [],
          imageDataUrl: "data:image/png;base64,AA==",
          unsupportedEntities: [],
        },
      }],
    } satisfies LibraryPage2D);
    const onSubmit = vi.fn();

    render(<WireCableRunDialog kind="wire" summary={summary} harness={harnessWithTwoConnectors()} onCancel={() => {}} onOpenLibrary={() => {}} onSubmit={onSubmit} />);
    await screen.findByText("WIRE-20");
    expect(screen.getByLabelText("WIRE-20 부품 이미지")).toContainHTML("<image");
    fireEvent.change(screen.getByLabelText("From Housing"), { target: { value: "__free_end__" } });
    fireEvent.change(screen.getByLabelText("From 탈피 길이 (mm)"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "전선 생성" }));

    expect(onSubmit.mock.calls[0][0].from).toMatchObject({ componentId: "", pinId: "", freeEnd: { stripLengthMm: 12 } });
    expect(onSubmit.mock.calls[0][0].to.freeEnd).toBeUndefined();
  });

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
    expect(screen.getByLabelText("CBL-4C 기본 부품 이미지")).toContainHTML("<svg");
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

  it("멀티코어 케이블의 한쪽 모든 코어를 탈피 끝단으로 생성한다", async () => {
    const page: LibraryPage2D = {
      summary,
      total: 1,
      offset: 0,
      limit: 100,
      parts: [{
        id: "cable-free",
        category: "cable",
        name: "2C 케이블",
        partNumber: "CBL-2C",
        manufacturer: "Test",
        description: "",
        outerDiameterMm: 5,
        pins: [],
        cores: [
          { name: "CORE 1", color: "RD", gauge: "22 AWG" },
          { name: "CORE 2", color: "WH", gauge: "22 AWG" },
        ],
      }],
    };
    backendInvoke.mockResolvedValue(page);
    const onSubmit = vi.fn();

    render(<WireCableRunDialog kind="cable" summary={summary} harness={harnessWithTwoConnectors()} onCancel={() => {}} onOpenLibrary={() => {}} onSubmit={onSubmit} />);
    await screen.findByText("CBL-2C");
    fireEvent.change(screen.getByLabelText("To Housing"), { target: { value: "__free_end__" } });
    fireEvent.change(screen.getByLabelText("To 탈피 길이 (mm)"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "케이블 런 생성" }));

    expect(onSubmit.mock.calls[0][0].mappings).toHaveLength(2);
    expect(onSubmit.mock.calls[0][0].mappings.every((mapping: { to: { freeEnd?: { stripLengthMm: number } } }) => mapping.to.freeEnd?.stripLengthMm === 10)).toBe(true);
  });

  it("코어별 단색과 복합 색상을 수정하고 중복 지정할 수 있다", async () => {
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
    fireEvent.change(screen.getByLabelText("1번 코어 기본 색상"), { target: { value: "RD" } });
    fireEvent.change(screen.getByLabelText("1번 코어 보조 색상"), { target: { value: "WH" } });
    fireEvent.change(screen.getByLabelText("2번 코어 기본 색상"), { target: { value: "RD" } });
    fireEvent.change(screen.getByLabelText("2번 코어 보조 색상"), { target: { value: "WH" } });
    fireEvent.click(screen.getByRole("button", { name: "케이블 런 생성" }));

    expect(onSubmit.mock.calls[0][0].part.cores.slice(0, 2).map((core: { color: string }) => core.color)).toEqual(["RD/WH", "RD/WH"]);
  });
});
