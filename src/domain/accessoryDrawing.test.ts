import { describe, expect, it } from "vitest";
import { createSampleProject } from "../test/sampleProject";
import { buildAccessoryDrawingPlacements, updateAccessoryDrawingSize } from "./accessoryDrawing";

describe("2D 부자재 배치", () => {
  it("노드·구간·미지정 부자재를 연결 대상 주변에 배치한다", () => {
    const project = createSampleProject();
    const harness = project.harnesses[0];
    harness.accessories = [
      { id: "node-accessory", partId: "part-label", quantity: 1, nodeId: "node-j1", note: "J1 라벨" },
      { id: "segment-accessory", partId: "part-label", quantity: 2, segmentId: "seg-1", note: "구간 라벨" },
      { id: "unplaced-accessory", partId: "part-label", quantity: 1, note: "미배치 라벨" },
    ];

    const placements = buildAccessoryDrawingPlacements(harness, project.parts);

    expect(placements.map((item) => item.id)).toEqual(["node-accessory", "segment-accessory", "unplaced-accessory"]);
    expect(placements[0].position).toEqual({ x: 42, y: 118 });
    expect(placements[1].position).toEqual({ x: 202, y: 217 });
    expect(placements[2].position).toEqual({ x: 290, y: 88 });
  });

  it("사용자가 이동한 도면 위치를 우선한다", () => {
    const project = createSampleProject();
    const harness = project.harnesses[0];
    harness.accessories = [{
      id: "moved-accessory",
      partId: "part-label",
      quantity: 1,
      nodeId: "node-j1",
      drawingPosition: { x: 540, y: 260 },
      note: "수동 배치",
    }];

    expect(buildAccessoryDrawingPlacements(harness, project.parts)[0].position).toEqual({ x: 540, y: 260 });
  });

  it("라벨의 사용자 크기와 기본 크기를 제공한다", () => {
    const project = createSampleProject();
    const harness = project.harnesses[0];
    harness.accessories = [
      { id: "default-label", partId: "part-label", quantity: 1, note: "기본" },
      { id: "resized-label", partId: "part-label", quantity: 1, drawingWidth: 220, drawingHeight: 70, note: "조절" },
    ];

    const placements = buildAccessoryDrawingPlacements(harness, project.parts);

    expect(placements[0]).toMatchObject({ width: 116, height: 24 });
    expect(placements[1]).toMatchObject({ width: 220, height: 70 });
  });

  it("라벨 크기를 변경해도 사용자가 이동한 위치를 덮어쓰지 않는다", () => {
    const accessory = {
      id: "resized-label",
      partId: "part-label",
      quantity: 1,
      drawingPosition: { x: 540, y: 260 },
      note: "조절",
    };

    updateAccessoryDrawingSize(accessory, { width: 220.4, height: 69.6 });

    expect(accessory.drawingPosition).toEqual({ x: 540, y: 260 });
    expect(accessory).toMatchObject({ drawingWidth: 220, drawingHeight: 70 });
  });

});
