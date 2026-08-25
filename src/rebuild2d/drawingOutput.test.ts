import { afterEach, describe, expect, it, vi } from "vitest";
import { drawingSheetDimensions, preparePaperDrawing, printPaperDrawing } from "./drawingOutput";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("용지 기준 도면 출력", () => {
  it("A1/A2/A3 가로 용지 크기를 mm로 제공한다", () => {
    expect(drawingSheetDimensions("A1")).toEqual({ widthMm: 841, heightMm: 594 });
    expect(drawingSheetDimensions("A2")).toEqual({ widthMm: 594, heightMm: 420 });
    expect(drawingSheetDimensions("A3")).toEqual({ widthMm: 420, heightMm: 297 });
  });

  it("화면 이동과 편집 요소를 제거하고 입력값을 SVG 텍스트로 변환한다", () => {
    document.body.innerHTML = `
      <svg class="hd2-canvas" style="color: rgb(20, 30, 40)">
        <defs></defs>
        <g transform="translate(120 80) scale(2)">
          <rect class="hd2-grid" width="1000" height="1000"/>
          <path class="hd2-wire is-selected" d="M 10 20 L 30 40"/>
          <circle class="hd2-route-handle" cx="20" cy="20" r="8"/>
          <foreignObject x="30" y="40" width="100" height="16"><input value="SIGNAL_A"/></foreignObject>
        </g>
      </svg>`;
    const source = document.querySelector("svg") as SVGSVGElement;

    const drawing = preparePaperDrawing(source, "A3");

    expect(drawing.widthMm).toBe(420);
    expect(drawing.heightMm).toBe(297);
    expect(drawing.markup).toContain('viewBox="0 0 420 297"');
    expect(drawing.markup).toContain("SIGNAL_A");
    expect(drawing.markup).not.toContain("foreignObject");
    expect(drawing.markup).not.toContain("hd2-grid");
    expect(drawing.markup).not.toContain("hd2-route-handle");
    expect(drawing.markup).not.toContain("is-selected");
    expect(drawing.markup).not.toContain("translate(120 80) scale(2)");
  });

  it("선택한 용지 크기로 운영체제 인쇄를 요청한다", async () => {
    const print = vi.fn(() => {
      expect(document.querySelector(".hd2-print-output")).toBeInTheDocument();
    });
    vi.useFakeTimers();

    await printPaperDrawing({ markup: "<svg></svg>", widthMm: 594, heightMm: 420 }, print);

    expect(print).toHaveBeenCalledOnce();
    expect(document.querySelector(".hd2-print-style")?.textContent).toContain("size: 594mm 420mm");
    window.dispatchEvent(new Event("afterprint"));
    expect(document.querySelector(".hd2-print-output")).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
