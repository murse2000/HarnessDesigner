import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PartSymbolEditor, stepRotationFromDrag } from "./PartSymbolEditor";
import type { LibraryPartDraft2D } from "./library";

const pdfMocks = vi.hoisted(() => ({
  parseImageDrawing: vi.fn(),
}));
const stepMocks = vi.hoisted(() => ({
  importStepAsset: vi.fn(),
  projectStepDrawing: vi.fn(),
}));

vi.mock("./pdfSymbol", () => ({
  extractRasterPartDrawing: vi.fn(),
  parseImageDrawing: pdfMocks.parseImageDrawing,
}));
vi.mock("../three/stepImport", () => ({ importStepAsset: stepMocks.importStepAsset }));
vi.mock("./stepSymbol", async (importOriginal) => ({
  ...await importOriginal<typeof import("./stepSymbol")>(),
  projectStepDrawing: stepMocks.projectStepDrawing,
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

function raster(sourceName: string) {
  return {
    sourceName,
    sourceType: "image" as const,
    bounds: { x: 0, y: 0, width: 100, height: 80 },
    paths: [],
    unsupported: [],
    imageDataUrl: "data:image/png;base64,AA==",
    pageNumber: 1,
    pageCount: 1,
  };
}

describe("부품 심벌 도면 입력", () => {
  beforeEach(() => {
    pdfMocks.parseImageDrawing.mockReset();
    stepMocks.importStepAsset.mockReset();
    stepMocks.projectStepDrawing.mockReset();
  });

  it("PNG 파일과 클립보드 이미지를 도면으로 불러온다", async () => {
    pdfMocks.parseImageDrawing.mockImplementation(async (_file: Blob, name: string) => raster(name));
    const { container } = render(<PartSymbolEditor draft={draft} onApply={() => {}} onClose={() => {}} />);
    const image = new File([new Uint8Array([1])], "connector.png", { type: "image/png" });

    fireEvent.change(container.querySelector("input[type=file]")!, { target: { files: [image] } });
    expect(await screen.findByText("connector.png · 이미지")).toBeInTheDocument();

    const clipboardImage = new File([new Uint8Array([2])], "", { type: "image/png" });
    fireEvent.paste(window, { clipboardData: { items: [{ type: "image/png", getAsFile: () => clipboardImage }] } });
    expect(await screen.findByText("클립보드 이미지.png · 이미지")).toBeInTheDocument();
  });

  it("STEP 마우스 드래그를 주축 5도 스냅 또는 미세 회전값으로 변환한다", () => {
    expect(stepRotationFromDrag({ x: 0, y: 0, z: 0 }, 100, -50, false)).toEqual({ x: 0, y: 40, z: 0 });
    expect(stepRotationFromDrag({ x: 0, y: 0, z: 0 }, 5, 19, false)).toEqual({ x: 10, y: 0, z: 0 });
    expect(stepRotationFromDrag({ x: 10, y: 20, z: 30 }, 50, 80, true)).toEqual({ x: 10, y: 20, z: 50 });
    expect(stepRotationFromDrag({ x: 0, y: 0, z: 0 }, 11, 2, false, 0.4, true)).toEqual({ x: 0, y: 4.4, z: 0 });
  });

  it("메인 도면용 STEP에 회전 가이드를 표시하고 R 키로 90도 회전한다", async () => {
    const onApply = vi.fn();
    stepMocks.importStepAsset.mockResolvedValue({
      id: "step",
      name: "part",
      sourceFormat: "step",
      sourceName: "part.step",
      sourceDataBase64: "AQ==",
      meshes: [{ name: "Body", positions: [0, 0, 0], indices: [0] }],
    });
    stepMocks.projectStepDrawing.mockImplementation(() => ({
      sourceName: "part.step · STEP 투영",
      bounds: { x: 0, y: 0, width: 100, height: 80 },
      paths: [{ points: [{ x: 0, y: 0 }, { x: 100, y: 80 }], closed: false, layer: "STEP_PROJECTION", sourceType: "STEP_EDGE" }],
      surfaces: [],
      unsupported: [],
    }));
    const drawingDraft = { ...draft, pins: [] };
    const { container } = render(<PartSymbolEditor draft={drawingDraft} purpose="drawing" onApply={onApply} onClose={() => {}} />);
    const file = new File([new Uint8Array([1])], "part.step");
    Object.defineProperty(file, "arrayBuffer", { value: async () => new Uint8Array([1]).buffer });

    fireEvent.change(container.querySelector("input[type=file]")!, { target: { files: [file] } });
    expect(await screen.findByLabelText("STEP 회전 가이드")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "우측" }));
    await waitFor(() => expect(stepMocks.projectStepDrawing).toHaveBeenLastCalledWith(expect.anything(), { x: 0, y: 90, z: 0 }));
    fireEvent.click(screen.getByRole("button", { name: "STEP X +5도" }));
    await waitFor(() => expect(stepMocks.projectStepDrawing).toHaveBeenLastCalledWith(expect.anything(), { x: 5, y: 90, z: 0 }));
    const canvas = container.querySelector<SVGSVGElement>(".hd2-symbol-canvas > svg")!;
    fireEvent.keyDown(canvas, { key: "r" });
    await waitFor(() => expect(stepMocks.projectStepDrawing).toHaveBeenLastCalledWith(expect.anything(), { x: 5, y: 90, z: 90 }));
    fireEvent.click(screen.getByRole("button", { name: "도면에 추가" }));

    await waitFor(() => expect(onApply).toHaveBeenCalled());
    expect(onApply.mock.calls[0][0].drawing.editorState.selection).toEqual({ x: 0, y: 0, width: 100, height: 80 });
    expect(onApply.mock.calls[0][0].drawing.editorState.stepAsset).toMatchObject({ sourceDataBase64: "AQ==", meshes: [] });
  });

  it("STEP 회전 중 확대율을 유지하고 새 투영 형상을 화면 중앙에 맞춘다", async () => {
    stepMocks.importStepAsset.mockResolvedValue({ id: "step", name: "part", sourceFormat: "step", sourceName: "part.step", sourceDataBase64: "", meshes: [] });
    stepMocks.projectStepDrawing.mockImplementation((_asset, rotation: { y: number }) => ({
      sourceName: "part.step · STEP 투영",
      bounds: rotation.y === 0 ? { x: 0, y: 0, width: 100, height: 80 } : { x: 20, y: 10, width: 180, height: 140 },
      paths: [{ points: [{ x: 0, y: 0 }, { x: 100, y: 80 }], closed: false, layer: "STEP_PROJECTION", sourceType: "STEP_EDGE" }],
      surfaces: [],
      unsupported: [],
    }));
    const { container } = render(<PartSymbolEditor draft={draft} onApply={() => {}} onClose={() => {}} />);
    const file = new File([new Uint8Array([1])], "part.step");
    Object.defineProperty(file, "arrayBuffer", { value: async () => new Uint8Array([1]).buffer });

    fireEvent.change(container.querySelector("input[type=file]")!, { target: { files: [file] } });
    await screen.findByText("part.step · STEP 투영 · 형상 1개");
    const canvas = container.querySelector<SVGSVGElement>(".hd2-symbol-canvas > svg")!;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}) });
    fireEvent.wheel(canvas, { deltaY: -100, clientX: 400, clientY: 300 });
    const zoomedViewBox = canvas.getAttribute("viewBox")!.split(" ").map(Number);

    fireEvent.change(screen.getByLabelText("STEP Y 회전"), { target: { value: "45" } });
    await waitFor(() => expect(stepMocks.projectStepDrawing).toHaveBeenLastCalledWith(expect.anything(), { x: 0, y: 45, z: 0 }));
    const centeredViewBox = canvas.getAttribute("viewBox")!.split(" ").map(Number);
    expect(centeredViewBox[2]).toBe(zoomedViewBox[2]);
    expect(centeredViewBox[3]).toBe(zoomedViewBox[3]);
    expect(centeredViewBox[0] + centeredViewBox[2] / 2).toBe(110);
    expect(centeredViewBox[1] + centeredViewBox[3] / 2).toBe(80);
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
    expect(document.querySelector<SVGGElement>(".hd2-symbol-source")?.style.strokeWidth).toBe("2.875");
    fireEvent.click(screen.getByRole("button", { name: "심벌 적용" }));

    await waitFor(() => expect(onApply).toHaveBeenCalled());
    expect(onApply.mock.calls[0][0].drawing.outlineStrength).toBe(2.5);
  });

  it("저장된 편집 원본과 추출 영역, 배율, 핀 배열을 그대로 복원한다", async () => {
    const onApply = vi.fn();
    stepMocks.projectStepDrawing.mockImplementation(() => ({
      sourceName: "connector.step · STEP 투영",
      bounds: { x: 0, y: 0, width: 80, height: 60 },
      paths: [{ points: [{ x: 10, y: 20 }, { x: 50, y: 40 }], closed: false, layer: "STEP_PROJECTION", sourceType: "STEP_EDGE" }],
      surfaces: [],
      unsupported: [],
    }));
    const existingDraft: LibraryPartDraft2D = {
      ...draft,
      pins: [{ number: "1", name: "VCC", anchor: { xMm: 20, yMm: 5, directionX: 1, directionY: 0 } }],
      drawing: {
        sourceName: "connector.step · STEP 투영",
        widthMm: 20,
        heightMm: 10,
        paths: [{ points: [{ x: 0, y: 0 }, { x: 20, y: 10 }], closed: false, layer: "STEP_PROJECTION", sourceType: "STEP_EDGE" }],
        outlineStrength: 2.2,
        unsupportedEntities: [],
        editorState: {
          source: {
            sourceName: "connector.step · STEP 투영",
            bounds: { x: 0, y: 0, width: 80, height: 60 },
            paths: [{ points: [{ x: 10, y: 20 }, { x: 50, y: 40 }], closed: false, layer: "STEP_PROJECTION", sourceType: "STEP_EDGE" }],
            unsupported: [],
          },
          selection: { x: 10, y: 20, width: 40, height: 20 },
          viewBox: { x: -5, y: -10, width: 100, height: 80 },
          pinPoints: [{ x: 50, y: 30 }],
          stepRotation: { x: 15, y: 25, z: 35 },
          stepAsset: { id: "step", name: "connector", sourceFormat: "step", sourceName: "connector.step", sourceDataBase64: "", meshes: [] },
        },
      },
    };
    const { container } = render(<PartSymbolEditor draft={existingDraft} onApply={onApply} onClose={() => {}} />);

    const canvas = container.querySelector<SVGSVGElement>(".hd2-symbol-canvas > svg")!;
    expect(canvas).toHaveAttribute("viewBox", "-5 -10 100 80");
    expect(screen.getByText("40.000")).toBeInTheDocument();
    expect(screen.getByText("배치됨")).toBeInTheDocument();
    expect(screen.getByLabelText("STEP X 회전")).toHaveValue(15);
    expect(screen.getByLabelText("STEP Y 회전")).toHaveValue(25);
    expect(screen.getByLabelText("STEP Z 회전")).toHaveValue(35);

    Object.defineProperty(canvas, "setPointerCapture", { value: vi.fn() });
    Object.defineProperty(canvas, "hasPointerCapture", { value: vi.fn(() => false) });
    fireEvent.click(screen.getByRole("button", { name: "마우스 회전" }));
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 120, clientY: 110 });
    expect(canvas).toHaveAttribute("viewBox", "-10 -10 100 80");
    expect(container.querySelector(".hd2-symbol-selection")).toBeInTheDocument();
    expect(container.querySelector(".hd2-symbol-pin")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "심벌 적용" }));
    await waitFor(() => expect(onApply).toHaveBeenCalled());
    expect(onApply.mock.calls[0][0].drawing.editorState.selection).toEqual({ x: 10, y: 20, width: 40, height: 20 });
    expect(onApply.mock.calls[0][0].pins[0].anchor).toEqual({ xMm: 40, yMm: 10, directionX: 1, directionY: 0 });
  });

  it("기존 도면의 미배치 핀은 그대로 두고 윤곽선만 수정할 수 있다", async () => {
    const onApply = vi.fn();
    const existingDraft: LibraryPartDraft2D = {
      ...draft,
      drawing: {
        sourceName: "legacy.dxf",
        widthMm: 20,
        heightMm: 10,
        paths: [{ points: [{ x: 0, y: 0 }, { x: 20, y: 10 }], closed: false, layer: "OUTLINE", sourceType: "LINE" }],
        unsupportedEntities: [],
      },
    };
    render(<PartSymbolEditor draft={existingDraft} onApply={onApply} onClose={() => {}} />);

    fireEvent.change(screen.getByRole("slider", { name: "윤곽선 강도" }), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "심벌 적용" }));

    await waitFor(() => expect(onApply).toHaveBeenCalled());
    expect(onApply.mock.calls[0][0].pins[0].anchor).toBeUndefined();
    expect(onApply.mock.calls[0][0].drawing.outlineStrength).toBe(3);
  });
});
