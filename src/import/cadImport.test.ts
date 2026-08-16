import { describe, expect, it } from "vitest";
import { importDxf, importSvg } from "./cadImport";

describe("CAD 하우징 가져오기", () => {
  it("SVG에서 실행 코드와 외부 링크를 제거한다", () => {
    const source = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><script>alert(1)</script><image href="https://example.com/a.png"/><rect onclick="alert(1)" width="20" height="10"/></svg>`;
    const result = importSvg(source, "housing.svg");
    expect(result.asset.viewBox).toBe("0 0 100 50");
    expect(result.asset.svg).not.toContain("script");
    expect(result.asset.svg).not.toContain("onclick");
    expect(result.asset.svg).not.toContain("https://example.com");
  });

  it("DXF 선과 원을 정규화된 SVG로 변환한다", () => {
    const dxf = [
      "0", "SECTION", "2", "ENTITIES",
      "0", "LINE", "10", "0", "20", "0", "11", "100", "21", "50",
      "0", "CIRCLE", "10", "50", "20", "25", "40", "10",
      "0", "ENDSEC", "0", "EOF",
    ].join("\n");
    const result = importDxf(dxf, "housing.dxf");
    expect(result.asset.sourceFormat).toBe("dxf");
    expect(result.asset.svg).toContain("<line");
    expect(result.asset.svg).toContain("<circle");
    expect(result.asset.viewBox).toMatch(/^-?\d/);
  });

  it("지원하지 않는 DXF 요소를 경고한다", () => {
    const dxf = ["0", "SPLINE", "10", "0", "20", "0", "0", "LINE", "10", "0", "20", "0", "11", "1", "21", "1", "0", "EOF"].join("\n");
    expect(importDxf(dxf, "mixed.dxf").warnings).toContain("지원하지 않는 DXF 요소: SPLINE");
  });
});
