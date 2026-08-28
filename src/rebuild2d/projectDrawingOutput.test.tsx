import { describe, expect, it } from "vitest";
import { addHarness, createEmptyProject } from "./model";
import { prepareProjectPaperDrawings } from "./projectDrawingOutput";
import { defaultSettings2D } from "./settings";

describe("프로젝트 다페이지 도면 출력", () => {
  it("프로젝트의 모든 하네스를 순서대로 개별 용지로 준비한다", () => {
    const project = addHarness(createEmptyProject()).project;
    project.harnesses[0].name = "첫 번째 도면";
    project.harnesses.find((sheet) => sheet.partNumber === "HNS-002")!.name = "두 번째 도면";

    const drawings = prepareProjectPaperDrawings(project, { ...defaultSettings2D, drawingSheet: "A3" });

    expect(drawings).toHaveLength(4);
    expect(drawings[0].markup).toContain("HARNESS DOCUMENT PACKAGE");
    expect(drawings[1].markup).toContain("DRAWING INDEX");
    expect(drawings[1].markup).toContain("HNS-002");
    expect(drawings[2].markup).toContain("HNS-001");
    expect(drawings[2].markup).toContain("첫 번째 도면");
    expect(drawings[3].markup).toContain("HNS-002");
    expect(drawings[3].markup).toContain("두 번째 도면");
    expect(drawings.every((drawing) => drawing.widthMm === 420 && drawing.heightMm === 297)).toBe(true);
  });
});
