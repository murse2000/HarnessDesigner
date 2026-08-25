import { describe, expect, it } from "vitest";
import { createSampleProject } from "../test/sampleProject";
import { buildBom } from "../domain/calculations";
import { createFormboardState } from "../domain/formboard";
import { buildBomSvgPages, buildFormboardDxf, buildFormboardSvgPages, buildHarnessDxf, buildHarnessSvg, buildWorkInstructionSvgPages } from "./drawing";

describe("제조 문서 모델", () => {
  it("하네스 SVG와 DXF에 제목·구간·커넥터를 포함한다", () => {
    const project = createSampleProject();
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
    project.parts.push({ id: "heat-shrink-test", partNumber: "RNF-TEST", manufacturer: "TE", description: "Test heat shrink", revision: "A", category: "heatShrink", unit: "ea", color: "BK", attributes: {} });
    harness.segments[0].startHeatShrinkPartId = "heat-shrink-test";
    harness.segments[0].endHeatShrinkPartId = "heat-shrink-test";
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
    expect(svg).toContain("START HS · RNF-TEST");
    expect(svg).toContain("LBL-25 × 2");
    expect(dxf).toContain("START HEAT SHRINK RNF-TEST");
    expect(dxf).toContain("LABEL LBL-25 x 2");
  });

  it("BOM을 31행 단위로 페이지 분할한다", () => {
    const project = createSampleProject();
    const rows = Array.from({ length: 32 }, (_, index) => ({ ...buildBom(project)[0], partId: `part-${index}`, partNumber: `P-${index}` }));
    const pages = buildBomSvgPages(project, rows);
    expect(pages).toHaveLength(2);
    expect(pages[1]).toContain("PAGE 2/2");
  });

  it("제조 길이 기반 1:1 폼보드를 타일 도면과 DXF로 생성한다", () => {
    const project = createSampleProject();
    const harness = project.harnesses[0];
    const connectorPart = project.parts.find((part) => part.id === harness.nodes[0].partId)!;
    connectorPart.symbolAssetId = "step-front-symbol";
    project.assets.push({
      id: "step-front-symbol",
      name: "STEP FRONT",
      sourceFormat: "svg",
      sourceName: "connector_front.svg",
      viewBox: "0 0 20 10",
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10" data-step-view="front"><g><line x1="0" y1="0" x2="20" y2="0"/><line x1="20" y1="0" x2="20" y2="10"/></g></svg>',
    });
    harness.formboard = createFormboardState(harness);
    harness.formboard.segmentRoutes["seg-1"] = [{ x: 180, y: 70 }];
    harness.formboard.fixtures.push({ id: "fixture-1", kind: "peg", position: { x: 120, y: 40 }, label: "PEG-1" });
    const pages = buildFormboardSvgPages(project, harness, "A3");
    const dxf = buildFormboardDxf(project, harness);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages[0]).toContain("FORMBOARD SCALE 1:1");
    expect(pages[0]).toContain("CALIBRATION 100 mm");
    expect(pages[0]).toContain("CONNECTOR / PART / PINS");
    expect(dxf).toContain("FORMBOARD_1TO1");
    expect(dxf).toContain("CALIBRATION 100 mm");
    expect(dxf).toContain("450 mm");
    expect(pages.join("\n")).toContain("PEG-1");
    expect(pages.join("\n")).toContain('<line x1="0" y1="0" x2="20" y2="0"/>');
    expect(dxf).toContain("FORMBOARD_FIXTURES");
    expect(dxf).toContain("CONNECTOR_OUTLINE_1TO1");
    expect(dxf).toContain("PEG-1");
  });

  it("폼보드는 등록 심벌이 없는 STEP 부품도 투영 외곽선으로 출력한다", () => {
    const project = createSampleProject();
    const harness = project.harnesses[0];
    const connectorPart = project.parts.find((part) => part.id === harness.nodes[0].partId)!;
    connectorPart.symbolAssetId = undefined;
    connectorPart.modelAssetId = "formboard-step-model";
    project.modelAssets.push({
      id: "formboard-step-model",
      name: "FORMBOARD STEP",
      sourceFormat: "step",
      sourceName: "formboard.step",
      sourceDataBase64: "",
      meshes: [{ name: "body", positions: [0, 0, 0, 20, 0, 0, 20, 10, 0, 0, 10, 0], indices: [0, 1, 2, 0, 2, 3] }],
    });

    expect(buildFormboardSvgPages(project, harness, "A3").join("\n")).toContain('<line x1="0.0000" y1="-10.0000" x2="0.0000" y2="0.0000"/>');
    expect(buildFormboardDxf(project, harness)).toContain("CONNECTOR_OUTLINE_1TO1");
  });

  it("폼보드 양 끝 커넥터를 케이블 인입 방향으로 회전해 출력한다", () => {
    const project = createSampleProject();
    const harness = project.harnesses[0];
    const segment = { ...harness.segments[0], toNodeId: "node-j2", lengthMm: 100 };
    harness.nodes = harness.nodes.filter((node) => node.id === "node-j1" || node.id === "node-j2");
    harness.segments = [segment];
    harness.formboard = { nodePositions: { "node-j1": { x: 0, y: 0 }, "node-j2": { x: 100, y: 0 } }, segmentRoutes: {}, fixtures: [] };
    const symbolId = "route-aligned-symbol";
    project.assets.push({ id: symbolId, name: "ROUTE", sourceFormat: "svg", sourceName: "route.svg", viewBox: "0 0 20 10", svg: '<svg viewBox="0 0 20 10"><line x1="0" y1="0" x2="20" y2="0"/></svg>' });
    project.parts.filter((part) => part.category === "housing").forEach((part) => { part.symbolAssetId = symbolId; });

    const svg = buildFormboardSvgPages(project, harness, "A3").join("\n");

    expect(svg).toContain('transform="rotate(0)"');
    expect(svg).toContain('transform="rotate(180)"');
  });

  it("멀티코어 폼보드 출력에 중앙 외피와 실제 사용 코어 팬아웃을 포함한다", () => {
    const project = createSampleProject();
    const harness = project.harnesses[0];
    const segment = harness.segments[0];
    project.parts.push({ id: "part-cable-2c", partNumber: "CBL-2C", manufacturer: "TEST", description: "2 core cable", revision: "A", category: "cable", unit: "m", color: "BK", attributes: { construction: "multiCore", coreCount: "2", outerDiameterMm: "6", coreDiameterMm: "1.2", breakoutLengthMm: "30" } });
    segment.cablePartId = "part-cable-2c";
    harness.conductors = harness.conductors.map((conductor, index) => ({ ...conductor, cableRunId: segment.id, cableCoreId: String(index + 1), wirePartId: "part-cable-2c" }));

    const svg = buildFormboardSvgPages(project, harness, "A3").join("\n");
    const dxf = buildFormboardDxf(project, harness);

    expect(svg).toContain("stroke:#26323d;stroke-width:6");
    expect(svg).toContain("stroke:#d23b3b;stroke-width:1.2");
    expect(svg).toContain("stroke:#3488c8;stroke-width:1.2");
    expect(dxf).toContain("CABLE_JACKET_1TO1");
    expect(dxf).toContain("CABLE_CORE_RD");
    expect(dxf).toContain("CABLE_CORE_BU");
  });

  it("STEP에서 생성한 커넥터 형상을 하네스 SVG와 DXF에 매핑한다", () => {
    const project = createSampleProject();
    const harness = project.harnesses[0];
    const connectorPart = project.parts.find((part) => part.id === harness.nodes[0].partId)!;
    connectorPart.symbolAssetId = "step-front-symbol";
    project.assets.push({
      id: "step-front-symbol",
      name: "STEP FRONT",
      sourceFormat: "svg",
      sourceName: "connector_front.svg",
      viewBox: "0 0 20 10",
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10" data-step-view="front"><g><line x1="0" y1="0" x2="20" y2="0"/></g></svg>',
    });

    expect(buildHarnessSvg(project, harness)).toContain('<line x1="0" y1="0" x2="20" y2="0"/>');
    expect(buildHarnessDxf(project, harness)).toContain("CONNECTOR_OUTLINE");
  });

  it("작업 지시서를 출력 페이지로 생성한다", () => {
    const project = createSampleProject();
    project.workInstructions.push({ id: "work-1", harnessId: project.harnesses[0].id, sequence: 1, kind: "inspection", title: "연속성 검사", description: "모든 회로를 검사합니다.", estimatedMinutes: 5 });
    const pages = buildWorkInstructionSvgPages(project);
    expect(pages[0]).toContain("MANUFACTURING WORK INSTRUCTIONS");
    expect(pages[0]).toContain("연속성 검사");
  });
});
