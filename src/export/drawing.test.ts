import { describe, expect, it } from "vitest";
import { createProject } from "../domain/sample";
import { buildBom } from "../domain/calculations";
import { buildBomSvgPages, buildFormboardDxf, buildFormboardSvgPages, buildHarnessDxf, buildHarnessSvg, buildWorkInstructionSvgPages } from "./drawing";

describe("제조 문서 모델", () => {
  it("하네스 SVG와 DXF에 제목·구간·커넥터를 포함한다", () => {
    const project = createProject();
    const harness = project.harnesses[0];
    harness.drawingNotes = "커넥터 체결 상태 확인\n완성 후 연속성 검사";
    harness.drawingTableOffsets = {
      notes: { x: 20, y: 10 },
      materials: { x: -15, y: 25 },
      lengths: { x: -30, y: -20 },
    };
    harness.drawingAnnotations = [
      { id: "label-1", kind: "label", text: "검사 완료", position: { x: 120, y: 110 }, width: 140, height: 36 },
      { id: "text-1", kind: "text", text: "체결 토크 확인\n라벨 방향 확인", position: { x: 300, y: 120 }, width: 220, height: 90 },
      { id: "image-1", kind: "image", text: "조립 참고", position: { x: 560, y: 120 }, width: 180, height: 120, imageDataUrl: "data:image/png;base64,aGVsbG8=" },
      { id: "rectangle-1", kind: "rectangle", text: "RECTANGLE", position: { x: 100, y: 280 }, width: 120, height: 60, fillColor: "#ffffff", strokeColor: "#ff0000" },
      { id: "ellipse-1", kind: "ellipse", text: "ELLIPSE", position: { x: 250, y: 280 }, width: 120, height: 60 },
      { id: "arrow-1", kind: "arrow", text: "ARROW", position: { x: 400, y: 280 }, width: 160, height: 40 },
    ];
    const svg = buildHarnessSvg(project, harness);
    const dxf = buildHarnessDxf(project, harness);
    expect(svg).toContain("HNS-001");
    expect(svg).toContain("450 mm");
    expect(dxf).toContain("AC1032");
    expect(dxf).toContain("CONNECTORS");
    expect(dxf).toContain("HNS-001");
    expect(svg).toContain("NOTES");
    expect(svg).toContain("커넥터 체결 상태 확인");
    expect(svg).toContain("MANUFACTURING SUMMARY");
    expect(svg).toContain("TERM-20");
    expect(svg).toContain("CLAMP / CLIP");
    expect(svg).toContain("LBL-25");
    expect(svg).toContain("CUT LENGTH");
    expect(svg).toContain("830 mm");
    expect(svg).toContain('transform="translate(54 410)"');
    expect(svg).toContain('transform="translate(329 425)"');
    expect(svg).toContain('transform="translate(684 380)"');
    expect(dxf).toContain("커넥터 체결 상태 확인");
    expect(dxf).toContain("TERM-20");
    expect(dxf).toContain("\r\n10\r\n54\r\n20\r\n-410\r\n");
    expect(svg).toContain("검사 완료");
    expect(svg).toContain("체결 토크 확인");
    expect(svg).toContain("data:image/png;base64,aGVsbG8=");
    expect(dxf).toContain("IMAGE_ATTACHMENTS");
    expect(dxf).toContain("검사 완료");
    expect(svg).toContain("<ellipse");
    expect(svg).toContain("#ff0000");
    expect(dxf).toContain("SHAPES");
  });

  it("BOM을 31행 단위로 페이지 분할한다", () => {
    const project = createProject();
    const rows = Array.from({ length: 32 }, (_, index) => ({ ...buildBom(project)[0], partId: `part-${index}`, partNumber: `P-${index}` }));
    const pages = buildBomSvgPages(project, rows);
    expect(pages).toHaveLength(2);
    expect(pages[1]).toContain("PAGE 2/2");
  });

  it("제조 길이 기반 1:1 폼보드를 타일 도면과 DXF로 생성한다", () => {
    const project = createProject();
    const harness = project.harnesses[0];
    const pages = buildFormboardSvgPages(project, harness, "A3");
    const dxf = buildFormboardDxf(project, harness);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages[0]).toContain("FORMBOARD SCALE 1:1");
    expect(pages[0]).toContain("CALIBRATION 100 mm");
    expect(pages[0]).toContain("CONNECTOR / PART / PINS");
    expect(dxf).toContain("FORMBOARD_1TO1");
    expect(dxf).toContain("CALIBRATION 100 mm");
    expect(dxf).toContain("450 mm");
  });

  it("작업 지시서를 출력 페이지로 생성한다", () => {
    const project = createProject();
    project.workInstructions.push({ id: "work-1", harnessId: project.harnesses[0].id, sequence: 1, kind: "inspection", title: "연속성 검사", description: "모든 회로를 검사합니다.", estimatedMinutes: 5 });
    const pages = buildWorkInstructionSvgPages(project);
    expect(pages[0]).toContain("MANUFACTURING WORK INSTRUCTIONS");
    expect(pages[0]).toContain("연속성 검사");
  });
});
