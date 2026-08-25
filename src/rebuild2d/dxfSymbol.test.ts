import { describe, expect, it } from "vitest";
import { extractPartDrawing, parseDxfDrawing } from "./dxfSymbol";

const dxf = `0
SECTION
2
HEADER
0
ENDSEC
0
SECTION
2
BLOCKS
0
BLOCK
2
TEST_BLOCK
10
0
20
0
0
LINE
8
OUTLINE
10
0
20
0
11
10
21
0
0
ENDBLK
0
ENDSEC
0
SECTION
2
ENTITIES
0
INSERT
2
TEST_BLOCK
10
20
20
10
0
CIRCLE
8
PINS
10
25
20
15
40
2
0
TEXT
8
NOTES
10
0
20
0
1
IGNORE
0
ENDSEC
0
EOF`;

describe("제조사 독립 DXF 심벌 추출", () => {
  it("블록 삽입 변환과 표준 도형을 제조사 레이어명과 무관하게 읽는다", () => {
    const parsed = parseDxfDrawing(dxf, "vendor.dxf");
    expect(parsed.paths).toHaveLength(2);
    expect(parsed.bounds.x).toBe(20);
    expect(parsed.bounds.y).toBe(-17);
    expect(parsed.unsupported).toContainEqual({ type: "TEXT", count: 1 });
  });

  it("사용자가 지정한 영역과 기준 배율로 정규화된 심벌을 만든다", () => {
    const parsed = parseDxfDrawing(dxf, "vendor.dxf");
    const drawing = extractPartDrawing(parsed, { x: 19, y: -18, width: 13, height: 10 }, 0.5);
    expect(drawing.sourceName).toBe("vendor.dxf");
    expect(drawing.widthMm).toBe(6.5);
    expect(drawing.heightMm).toBe(5);
    expect(drawing.paths.length).toBeGreaterThan(0);
  });
});
