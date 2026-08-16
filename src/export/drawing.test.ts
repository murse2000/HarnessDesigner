import { describe, expect, it } from "vitest";
import { createProject } from "../domain/sample";
import { buildBom } from "../domain/calculations";
import { buildBomSvgPages, buildHarnessDxf, buildHarnessSvg } from "./drawing";

describe("제조 문서 모델", () => {
  it("하네스 SVG와 DXF에 제목·구간·커넥터를 포함한다", () => {
    const project = createProject();
    const harness = project.harnesses[0];
    const svg = buildHarnessSvg(project, harness);
    const dxf = buildHarnessDxf(project, harness);
    expect(svg).toContain("HNS-001");
    expect(svg).toContain("450 mm");
    expect(dxf).toContain("AC1032");
    expect(dxf).toContain("CONNECTORS");
    expect(dxf).toContain("HNS-001");
  });

  it("BOM을 31행 단위로 페이지 분할한다", () => {
    const project = createProject();
    const rows = Array.from({ length: 32 }, (_, index) => ({ ...buildBom(project)[0], partId: `part-${index}`, partNumber: `P-${index}` }));
    const pages = buildBomSvgPages(project, rows);
    expect(pages).toHaveLength(2);
    expect(pages[1]).toContain("PAGE 2/2");
  });
});
