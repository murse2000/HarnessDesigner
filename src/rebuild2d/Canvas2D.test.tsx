import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Canvas2D } from "./Canvas2D";
import { addCableRun, addConnector, createEmptyProject } from "./model";
import { defaultSettings2D } from "./settings";

describe("2D 케이블 라벨", () => {
  it("등록된 부품 심벌의 윤곽을 진한 색상과 저장된 강도로 표시한다", () => {
    let project = createEmptyProject();
    const harnessId = project.harnesses[0].id;
    project = addConnector(project, harnessId, {
      name: "테스트 커넥터",
      partNumber: "TEST-04",
      manufacturer: "Test",
      pinCount: 1,
      drawing: {
        sourceName: "registered.dxf",
        widthMm: 20,
        heightMm: 10,
        outlineStrength: 4,
        paths: [{ points: [{ x: 0, y: 0 }, { x: 20, y: 10 }], closed: false, layer: "OUTLINE", sourceType: "LINE" }],
        unsupportedEntities: [],
      },
    }, { x: 100, y: 100 }).project;

    const { container } = render(<Canvas2D
      harness={project.harnesses[0]}
      projectNumber="PRJ-001"
      projectName="테스트 프로젝트"
      settings={defaultSettings2D}
      selection={{ componentIds: [], connectionIds: [], cableRunIds: [] }}
      selectedLabel={null}
      selectedAnnotationId={null}
      onSelectionChange={vi.fn()}
      onSelectComponentLabel={vi.fn()}
      onSelectAnnotation={vi.fn()}
      onMoveSelection={vi.fn()}
      onMoveConnectionRoute={vi.fn()}
      onMoveCableRunRoute={vi.fn()}
      onMoveCableRunLabel={vi.fn()}
      onMoveComponentLabel={vi.fn()}
      onMoveComponentPinMap={vi.fn()}
      onRenameConnection={vi.fn()}
      onUpdateProjectMetadata={vi.fn()}
      onUpdateHarnessMetadata={vi.fn()}
      onUpdateTitleBlock={vi.fn()}
      onUpdateAnnotation={vi.fn()}
      onConnect={vi.fn()}
      onMousePositionChange={vi.fn()}
    />);

    const outline = container.querySelector<SVGPathElement>(".hd2-part-symbol path");
    expect(outline?.style.stroke).toBe("rgb(23, 63, 89)");
    expect(outline?.style.strokeWidth).toBe("4.6");
  });

  it("케이블 라벨을 드래그하면 새 오프셋을 저장 요청한다", () => {
    let project = createEmptyProject();
    const harnessId = project.harnesses[0].id;
    const first = addConnector(project, harnessId, { name: "A", partNumber: "A-2", manufacturer: "Test", pinCount: 2 }, { x: 100, y: 100 });
    project = first.project;
    const second = addConnector(project, harnessId, { name: "B", partNumber: "B-2", manufacturer: "Test", pinCount: 2 }, { x: 600, y: 100 });
    project = second.project;
    const harness = project.harnesses[0];
    const cable = addCableRun(project, harnessId, {
      part: {
        name: "4C 케이블",
        partNumber: "MC-4C",
        manufacturer: "Test",
        outerDiameterMm: 6,
        cores: [{ name: "CORE 1", color: "BK", gauge: "22 AWG" }],
        source: { libraryId: "L1", libraryRevision: "1", partId: "C1" },
      },
      lengthMm: 300,
      mappings: [{
        coreIndex: 0,
        from: { componentId: first.componentId, pinId: harness.components[0].pins[0].id },
        to: { componentId: second.componentId, pinId: harness.components[1].pins[0].id },
      }],
    });
    const onMoveCableRunLabel = vi.fn();

    render(<Canvas2D
      harness={cable.project.harnesses[0]}
      projectNumber="PRJ-001"
      projectName="테스트 프로젝트"
      settings={defaultSettings2D}
      selection={{ componentIds: [], connectionIds: [], cableRunIds: [] }}
      selectedLabel={null}
      selectedAnnotationId={null}
      onSelectionChange={vi.fn()}
      onSelectComponentLabel={vi.fn()}
      onSelectAnnotation={vi.fn()}
      onMoveSelection={vi.fn()}
      onMoveConnectionRoute={vi.fn()}
      onMoveCableRunRoute={vi.fn()}
      onMoveCableRunLabel={onMoveCableRunLabel}
      onMoveComponentLabel={vi.fn()}
      onMoveComponentPinMap={vi.fn()}
      onRenameConnection={vi.fn()}
      onUpdateProjectMetadata={vi.fn()}
      onUpdateHarnessMetadata={vi.fn()}
      onUpdateTitleBlock={vi.fn()}
      onUpdateAnnotation={vi.fn()}
      onConnect={vi.fn()}
      onMousePositionChange={vi.fn()}
    />);

    const canvas = screen.getByLabelText("하네스 2D 도면");
    const label = screen.getByLabelText("CBL-001 케이블 라벨");
    fireEvent.pointerDown(label, { button: 0, pointerId: 4, clientX: 400, clientY: 100 });
    fireEvent.pointerMove(canvas, { pointerId: 4, clientX: 440, clientY: 130 });
    fireEvent.pointerUp(canvas, { pointerId: 4, clientX: 440, clientY: 130 });

    expect(onMoveCableRunLabel).toHaveBeenCalledWith(cable.cableRunId, { x: 40, y: 10 });
  });
});
