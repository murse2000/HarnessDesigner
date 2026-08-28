import { describe, expect, it } from "vitest";
import { addCableHeatShrink, addCableRun, addConnector, addDrawingAnnotation, addHarness, addHarnessFolder, addWireRun, applyDrawingMetadataToAllHarnesses, connectPins, copyHarness, copyHarnessDrawing, createEmptyProject, deleteCableHeatShrink, deleteDrawingAnnotation, deleteHarness, deleteHarnessFolder, deleteItems, moveComponent, moveItems, moveProjectTreeItem, pasteHarness, pasteHarnessDrawing, projectDocumentIndex, projectTreeNodes, renameHarnessFolder, reorderHarness, setCableRunBreakout, setCableRunLabelOffset, setCableRunRoute, setComponentDisplayScale, setComponentLabelPlacement, setComponentPinMapOffset, setComponentRotation, setConnectionRoute, updateCableHeatShrink, updateCableRunStripLength, updateConnectionStripLength, updateDrawingAnnotation, updateDrawingTitleBlock, updateHarnessMetadata, type Project2D } from "./model";

const harnessSheets = (project: Project2D) => project.harnesses.filter((sheet) => !sheet.sheetType || sheet.sheetType === "harness");

describe("새 2D 프로젝트 모델", () => {
  it("샘플 부품 없이 빈 하네스로 시작한다", () => {
    const project = createEmptyProject();
    expect(project.documentType).toBe("harness-designer-2d");
    expect(project.schemaVersion).toBe(2);
    expect(project.harnesses).toHaveLength(3);
    expect(project.harnesses.map((sheet) => sheet.sheetType)).toEqual(["harness", "cover", "toc"]);
    expect(projectDocumentIndex(project).map((sheet) => [sheet.pageNumber, sheet.folderPath, sheet.sheetType])).toEqual([
      [1, "표지", "cover"],
      [2, "표지", "toc"],
      [3, "도면", "harness"],
    ]);
    expect(project.harnesses[0].components).toEqual([]);
    expect(project.harnesses[0].connections).toEqual([]);
    expect(project.harnesses[0].cableRuns).toEqual([]);
    expect(project.harnesses[0].drawing.titleBlock?.createdDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(project.harnesses[0].drawing.annotations).toEqual([]);

    const label = addDrawingAnnotation(project, project.harnesses[0].id, { kind: "label", position: { x: 10, y: 20 } });
    expect(label.project.harnesses[0].drawing.annotations?.[0]).toMatchObject({
      fontFamily: "Arial, sans-serif",
      italic: false,
      underline: false,
      textAlign: "center",
    });
  });

  it("새 빈 하네스에 다음 파트번호와 독립 도면을 부여한다", () => {
    const first = addHarness(createEmptyProject());
    const second = addHarness(first.project);

    const sheets = harnessSheets(second.project);
    expect(sheets.map((harness) => harness.partNumber)).toEqual(["HNS-001", "HNS-002", "HNS-003"]);
    expect(sheets[2]).toMatchObject({ id: second.harnessId, name: "새 하네스", revision: "A", components: [], connections: [], cableRuns: [] });
    expect(sheets[2].drawing.titleBlock?.drawingTitle).toBe("HARNESS ASSEMBLY DRAWING");
  });

  it("현재 도면의 공통 정보를 전체 하네스와 새 하네스에 재사용한다", () => {
    let project = createEmptyProject();
    const sourceId = project.harnesses[0].id;
    project = updateHarnessMetadata(project, sourceId, { revision: "B" });
    project = updateDrawingTitleBlock(project, sourceId, { createdDate: "2026-08-28", createdBy: "작성자", reviewedBy: "검토자", approvedBy: "승인자" });
    project = addHarness(project).project;

    project = applyDrawingMetadataToAllHarnesses(project, sourceId);
    expect(harnessSheets(project)).toHaveLength(2);
    expect(harnessSheets(project).every((harness) => harness.revision === "B")).toBe(true);
    expect(harnessSheets(project).every((harness) => harness.drawing.titleBlock?.createdBy === "작성자")).toBe(true);

    const added = addHarness(project, null, sourceId);
    const addedHarness = harnessSheets(added.project).at(-1)!;
    expect(addedHarness).toMatchObject({ revision: "B" });
    expect(addedHarness.drawing.titleBlock).toMatchObject({ createdDate: "2026-08-28", createdBy: "작성자", reviewedBy: "검토자", approvedBy: "승인자" });
  });

  it("선택한 하네스를 삭제하되 마지막 하네스는 유지한다", () => {
    const project = createEmptyProject();
    const added = addHarness(project);
    const deleted = deleteHarness(added.project, added.harnessId);

    expect(harnessSheets(deleted).map((harness) => harness.partNumber)).toEqual(["HNS-001"]);
    expect(deleteHarness(deleted, harnessSheets(deleted)[0].id)).toBe(deleted);
  });

  it("하네스 도면 순서를 앞뒤로 변경하고 직렬화 후에도 유지한다", () => {
    const first = addHarness(createEmptyProject());
    const second = addHarness(first.project);
    const [harness1, harness2, harness3] = harnessSheets(second.project);

    const movedFirst = reorderHarness(second.project, harness3.id, harness1.id, "before");
    expect(harnessSheets(movedFirst).map((harness) => harness.partNumber)).toEqual(["HNS-003", "HNS-001", "HNS-002"]);

    const movedLast = reorderHarness(movedFirst, harness3.id, harness2.id, "after");
    expect(harnessSheets(movedLast).map((harness) => harness.partNumber)).toEqual(["HNS-001", "HNS-002", "HNS-003"]);
    expect(harnessSheets(JSON.parse(JSON.stringify(movedLast))).map((harness) => harness.partNumber)).toEqual(["HNS-001", "HNS-002", "HNS-003"]);
  });

  it("폴더와 하위 폴더를 만들고 하네스를 마우스 이동용 트리 순서로 배치한다", () => {
    const rootFolder = addHarnessFolder(createEmptyProject());
    const childFolder = addHarnessFolder(rootFolder.project, rootFolder.folderId);
    const added = addHarness(childFolder.project);
    const moved = moveProjectTreeItem(added.project, added.harnessId, childFolder.folderId, "inside");

    expect(projectTreeNodes(moved)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: rootFolder.folderId, kind: "folder", parentId: null }),
      expect.objectContaining({ id: childFolder.folderId, kind: "folder", parentId: rootFolder.folderId }),
      expect.objectContaining({ harnessId: added.harnessId, kind: "harness", parentId: childFolder.folderId }),
    ]));
    expect(moveProjectTreeItem(moved, rootFolder.folderId, childFolder.folderId, "inside")).toBe(moved);
  });

  it("폴더 이름을 수정하고 삭제 시 내부 항목을 상위 폴더로 이동한다", () => {
    const folder = addHarnessFolder(createEmptyProject());
    const added = addHarness(folder.project, folder.folderId);
    const renamed = renameHarnessFolder(added.project, folder.folderId, "제어반");
    const deleted = deleteHarnessFolder(renamed, folder.folderId);

    expect(projectTreeNodes(renamed)).toContainEqual(expect.objectContaining({ id: folder.folderId, name: "제어반" }));
    expect(projectTreeNodes(deleted)).not.toContainEqual(expect.objectContaining({ id: folder.folderId }));
    expect(projectTreeNodes(deleted)).toContainEqual(expect.objectContaining({ harnessId: added.harnessId, parentId: null }));
    expect(harnessSheets(deleted)).toHaveLength(2);
  });

  it("도면 제목란과 주석을 저장하고 수정 및 삭제한다", () => {
    let project = createEmptyProject();
    const harnessId = project.harnesses[0].id;
    project = updateDrawingTitleBlock(project, harnessId, { createdBy: "작성자", reviewedBy: "검토자", approvedBy: "승인자" });
    const added = addDrawingAnnotation(project, harnessId, { kind: "label", position: { x: 100, y: 80 } });
    project = updateDrawingAnnotation(added.project, harnessId, added.annotationId, {
      text: "주의",
      position: { x: 140, y: 120 },
      width: 180,
      height: 44,
      fillColor: "#ffeeaa",
    });

    expect(project.harnesses[0].drawing.titleBlock).toMatchObject({ createdBy: "작성자", reviewedBy: "검토자", approvedBy: "승인자" });
    expect(project.harnesses[0].drawing.annotations?.[0]).toMatchObject({ text: "주의", position: { x: 140, y: 120 }, width: 180, height: 44, fillColor: "#ffeeaa" });

    project = deleteDrawingAnnotation(project, harnessId, added.annotationId);
    expect(project.harnesses[0].drawing.annotations).toEqual([]);
  });

  it("메인 도면의 STEP 투영 객체와 회전, 색상을 저장한다", () => {
    const project = createEmptyProject();
    const harnessId = project.harnesses[0].id;
    const drawing = {
      sourceName: "fixture.step · STEP 투영",
      widthMm: 40,
      heightMm: 20,
      paths: [{ points: [{ x: 0, y: 0 }, { x: 40, y: 20 }], closed: false, layer: "STEP_PROJECTION", sourceType: "STEP_EDGE" }],
      unsupportedEntities: [],
    };
    const added = addDrawingAnnotation(project, harnessId, {
      kind: "step",
      position: { x: 120, y: 90 },
      drawing,
      rotation: 90,
      tintColor: "#ff6600",
    });

    expect(added.project.harnesses[0].drawing.annotations?.[0]).toMatchObject({
      kind: "step",
      drawing: { sourceName: "fixture.step · STEP 투영" },
      rotation: 90,
      tintColor: "#ff6600",
    });
    expect(JSON.parse(JSON.stringify(added.project)).harnesses[0].drawing.annotations[0].drawing.paths).toHaveLength(1);
  });

  it("하네스 전체 복사 시 제목란과 주석을 독립 복제한다", () => {
    let project = createEmptyProject();
    const harnessId = project.harnesses[0].id;
    project = updateDrawingTitleBlock(project, harnessId, { createdBy: "작성자" });
    project = addDrawingAnnotation(project, harnessId, { kind: "text", position: { x: 20, y: 30 }, text: "작업 지시" }).project;

    const result = pasteHarness(project, copyHarness(project.harnesses[0]));
    const pasted = result.project.harnesses.find((sheet) => sheet.id === result.harnessId)!;

    expect(pasted.drawing.titleBlock?.createdBy).toBe("작성자");
    expect(pasted.drawing.annotations?.[0]).toMatchObject({ kind: "text", text: "작업 지시", position: { x: 20, y: 30 } });
    expect(pasted.drawing.annotations?.[0].id).not.toBe(project.harnesses[0].drawing.annotations?.[0].id);
    expect(pasted.drawing.annotations?.[0]).not.toBe(project.harnesses[0].drawing.annotations?.[0]);
  });

  it("라이브러리 단선을 핀 연결과 부품 스냅샷으로 저장한다", () => {
    const fixture = twoConnectors();
    const result = addWireRun(fixture.project, fixture.harnessId, {
      part: {
        name: "20 AWG 단선", partNumber: "WIRE-20-RD", manufacturer: "Test", outerDiameterMm: 1.6,
        color: "RD", gauge: "20 AWG", source: { libraryId: "library-1", libraryRevision: "2", partId: "wire-1" },
      },
      from: fixture.from,
      to: fixture.to,
      lengthMm: 450,
    });

    expect(result.project.harnesses[0].connections[0]).toMatchObject({
      kind: "wire", color: "RD", gauge: "20 AWG", lengthMm: 450,
      part: { partNumber: "WIRE-20-RD", source: { partId: "wire-1" } },
    });
  });

  it("사용한 코어만 cableRunId 연결로 만들고 미사용 코어는 케이블 스냅샷에 유지한다", () => {
    const fixture = twoConnectors();
    const cores = [
      { name: "CORE 1", color: "WH/RD", gauge: "22 AWG" },
      { name: "CORE 2", color: "WH", gauge: "22 AWG" },
      { name: "CORE 3", color: "RD", gauge: "22 AWG" },
      { name: "CORE 4", color: "GN", gauge: "22 AWG" },
    ];
    const result = addCableRun(fixture.project, fixture.harnessId, {
      part: {
        name: "4C 케이블", partNumber: "CABLE-4", manufacturer: "Test", outerDiameterMm: 6,
        cores, source: { libraryId: "library-1", libraryRevision: "4", partId: "cable-1" },
      },
      lengthMm: 300,
      mappings: [{ coreIndex: 0, from: fixture.from, to: fixture.to }],
    });
    const harness = result.project.harnesses[0];

    expect(harness.cableRuns[0]).toMatchObject({ reference: "CBL-001", lengthMm: 300, cores });
    expect(harness.connections).toHaveLength(1);
    expect(harness.connections[0]).toMatchObject({ kind: "cableCore", reference: "CBL-001:1", cableRunId: result.cableRunId, cableCoreIndex: 0, color: "WH/RD" });
  });

  it("커넥터가 없는 탈피 끝단을 단선과 케이블 코어에 저장한다", () => {
    const fixture = twoConnectors();
    const freeEnd = { componentId: "", pinId: "", freeEnd: { position: { x: 850, y: 160 }, stripLengthMm: 9 } };
    const wire = addWireRun(fixture.project, fixture.harnessId, {
      part: {
        name: "20 AWG 단선", partNumber: "WIRE-20", manufacturer: "Test", outerDiameterMm: 1.6,
        color: "RD", gauge: "20 AWG", source: { libraryId: "L1", libraryRevision: "1", partId: "W1" },
      },
      from: fixture.from,
      to: freeEnd,
      lengthMm: 300,
    });
    const cable = addCableRun(wire.project, fixture.harnessId, {
      part: {
        name: "2C 케이블", partNumber: "CABLE-2", manufacturer: "Test", outerDiameterMm: 5,
        cores: [{ name: "CORE 1", color: "BK", gauge: "22 AWG" }],
        source: { libraryId: "L1", libraryRevision: "1", partId: "C1" },
      },
      lengthMm: 300,
      mappings: [{ coreIndex: 0, from: fixture.from, to: freeEnd }],
    });

    expect(cable.project.harnesses[0].connections.map((connection) => connection.to.freeEnd?.stripLengthMm)).toEqual([9, 9]);
  });

  it("생성된 단선과 멀티코어 케이블의 탈피 길이를 수정한다", () => {
    const fixture = twoConnectors();
    const freeEnd = { componentId: "", pinId: "", freeEnd: { position: { x: 850, y: 160 }, stripLengthMm: 8 } };
    const wire = addWireRun(fixture.project, fixture.harnessId, {
      part: {
        name: "20 AWG 단선", partNumber: "WIRE-20", manufacturer: "Test", outerDiameterMm: 1.6,
        color: "RD", gauge: "20 AWG", source: { libraryId: "L1", libraryRevision: "1", partId: "W1" },
      },
      from: fixture.from,
      to: freeEnd,
      lengthMm: 300,
    });
    const cable = addCableRun(wire.project, fixture.harnessId, {
      part: {
        name: "2C 케이블", partNumber: "CABLE-2", manufacturer: "Test", outerDiameterMm: 5,
        cores: [{ name: "CORE 1", color: "BK", gauge: "22 AWG" }, { name: "CORE 2", color: "RD", gauge: "22 AWG" }],
        source: { libraryId: "L1", libraryRevision: "1", partId: "C1" },
      },
      lengthMm: 300,
      mappings: [
        { coreIndex: 0, from: fixture.from, to: freeEnd },
        { coreIndex: 1, from: fixture.from, to: freeEnd },
      ],
    });

    const updatedWire = updateConnectionStripLength(cable.project, fixture.harnessId, wire.connectionId, "to", 12);
    const updatedCable = updateCableRunStripLength(updatedWire, fixture.harnessId, cable.cableRunId, "to", 18);
    const harness = updatedCable.harnesses[0];

    expect(harness.connections.find((connection) => connection.id === wire.connectionId)?.to.freeEnd?.stripLengthMm).toBe(12);
    expect(harness.connections.filter((connection) => connection.cableRunId === cable.cableRunId).map((connection) => connection.to.freeEnd?.stripLengthMm)).toEqual([18, 18]);
    expect(() => updateConnectionStripLength(updatedCable, fixture.harnessId, wire.connectionId, "to", -1)).toThrow("탈피 길이는 0 이상이어야 합니다.");
  });

  it("선택한 단선과 멀티코어 케이블의 탈피 끝단을 이동한다", () => {
    const fixture = twoConnectors();
    const freeEnd = { componentId: "", pinId: "", freeEnd: { position: { x: 850, y: 160 }, stripLengthMm: 9 } };
    const wire = addWireRun(fixture.project, fixture.harnessId, {
      part: {
        name: "20 AWG 단선", partNumber: "WIRE-20", manufacturer: "Test", outerDiameterMm: 1.6,
        color: "RD", gauge: "20 AWG", source: { libraryId: "L1", libraryRevision: "1", partId: "W1" },
      },
      from: fixture.from,
      to: freeEnd,
      lengthMm: 300,
    });
    const cable = addCableRun(wire.project, fixture.harnessId, {
      part: {
        name: "2C 케이블", partNumber: "CABLE-2", manufacturer: "Test", outerDiameterMm: 5,
        cores: [{ name: "CORE 1", color: "BK", gauge: "22 AWG" }],
        source: { libraryId: "L1", libraryRevision: "1", partId: "C1" },
      },
      lengthMm: 300,
      mappings: [{ coreIndex: 0, from: fixture.from, to: freeEnd }],
    });

    const moved = moveItems(
      cable.project,
      fixture.harnessId,
      new Set(),
      new Set([wire.connectionId]),
      new Set([cable.cableRunId]),
      { x: 40, y: 30 },
    );

    expect(moved.harnesses[0].connections.map((connection) => connection.to.freeEnd?.position)).toEqual([
      { x: 890, y: 190 },
      { x: 890, y: 190 },
    ]);
  });

  it("핀 연결은 세그먼트 없이 양 끝 핀만 저장한다", () => {
    let project = createEmptyProject();
    const harnessId = project.harnesses[0].id;
    const first = addConnector(project, harnessId, { name: "A", partNumber: "A-4", manufacturer: "Test", pinCount: 4 }, { x: 100, y: 100 });
    project = first.project;
    const second = addConnector(project, harnessId, { name: "B", partNumber: "B-4", manufacturer: "Test", pinCount: 4 }, { x: 600, y: 100 });
    project = second.project;
    const harness = project.harnesses[0];
    const connection = connectPins(project, harnessId, {
      componentId: first.componentId,
      pinId: harness.components[0].pins[0].id,
    }, {
      componentId: second.componentId,
      pinId: harness.components[1].pins[1].id,
    });

    expect(connection.project.harnesses[0].connections).toHaveLength(1);
    expect(connection.project.harnesses[0].connections[0]).not.toHaveProperty("segments");
    expect(connection.project.harnesses[0].connections[0].to.pinId).toBe(harness.components[1].pins[1].id);
  });

  it("커넥터 이동과 여러 항목 삭제를 한 번에 반영한다", () => {
    let project = createEmptyProject();
    const harnessId = project.harnesses[0].id;
    const first = addConnector(project, harnessId, { name: "A", partNumber: "A-2", manufacturer: "Test", pinCount: 2 }, { x: 0, y: 0 });
    project = first.project;
    const second = addConnector(project, harnessId, { name: "B", partNumber: "B-2", manufacturer: "Test", pinCount: 2 }, { x: 500, y: 0 });
    project = second.project;
    project = moveComponent(project, harnessId, first.componentId, { x: 120, y: 80 });
    expect(project.harnesses[0].drawing.componentPlacements[first.componentId].position).toEqual({ x: 120, y: 80 });

    project = deleteItems(project, harnessId, new Set([first.componentId, second.componentId]), new Set());
    expect(project.harnesses[0].components).toHaveLength(0);
    expect(project.harnesses[0].drawing.componentPlacements).toEqual({});
  });

  it("커넥터 회전과 표시 배율을 도면 배치에 저장하고 복사본에도 유지한다", () => {
    const project = createEmptyProject();
    const harnessId = project.harnesses[0].id;
    const added = addConnector(project, harnessId, { name: "A", partNumber: "A-2", manufacturer: "Test", pinCount: 2 }, { x: 100, y: 100 });
    const rotated = setComponentRotation(added.project, harnessId, added.componentId, 90);
    const resized = setComponentDisplayScale(rotated, harnessId, added.componentId, 1.75);
    const harness = JSON.parse(JSON.stringify(resized)).harnesses[0];

    expect(harness.drawing.componentPlacements[added.componentId].rotation).toBe(90);
    expect(harness.drawing.componentPlacements[added.componentId].displayScale).toBe(1.75);
    expect(copyHarnessDrawing(harness, new Set([added.componentId]), new Set(), new Set()).components[0].placement.rotation).toBe(90);
    expect(copyHarnessDrawing(harness, new Set([added.componentId]), new Set(), new Set()).components[0].placement.displayScale).toBe(1.75);
  });

  it("커넥터 라벨 위치와 각도를 도면 배치에 저장하고 복사본에도 유지한다", () => {
    const project = createEmptyProject();
    const harnessId = project.harnesses[0].id;
    const added = addConnector(project, harnessId, { name: "회전 라벨", partNumber: "P-1", manufacturer: "M", pinCount: 2 }, { x: 100, y: 100 });
    const moved = setComponentLabelPlacement(added.project, harnessId, added.componentId, "referenceLabel", { offset: { x: 150, y: -30 }, rotation: 35 });
    const placement = moved.harnesses[0].drawing.componentPlacements[added.componentId];

    expect(placement.referenceLabel).toEqual({ offset: { x: 150, y: -30 }, rotation: 35 });
    expect(copyHarnessDrawing(moved.harnesses[0], new Set([added.componentId]), new Set(), new Set()).components[0].placement.referenceLabel).toEqual({ offset: { x: 150, y: -30 }, rotation: 35 });
  });

  it("커넥터 핀맵 위치를 도면 배치에 저장하고 복사본에도 유지한다", () => {
    const project = createEmptyProject();
    const harnessId = project.harnesses[0].id;
    const added = addConnector(project, harnessId, { name: "핀맵", partNumber: "P-2", manufacturer: "M", pinCount: 2 }, { x: 100, y: 100 });
    const moved = setComponentPinMapOffset(added.project, harnessId, added.componentId, { x: 240, y: -45 });
    const placement = moved.harnesses[0].drawing.componentPlacements[added.componentId];

    expect(placement.pinMapOffset).toEqual({ x: 240, y: -45 });
    expect(copyHarnessDrawing(moved.harnesses[0], new Set([added.componentId]), new Set(), new Set()).components[0].placement.pinMapOffset).toEqual({ x: 240, y: -45 });
  });

  it("라이브러리 핀과 출처를 프로젝트 스냅샷으로 저장한다", () => {
    const project = createEmptyProject();
    const harnessId = project.harnesses[0].id;
    const result = addConnector(project, harnessId, {
      name: "Library housing",
      partNumber: "LIB-02",
      manufacturer: "Test",
      pinCount: 2,
      pins: [{ number: "A1", name: "POWER" }, { number: "A2", name: "GND" }],
      source: { libraryId: "library-1", libraryRevision: "3", partId: "part-1" },
    }, { x: 100, y: 100 });

    const connector = result.project.harnesses[0].components[0];
    expect(connector.pins.map(({ number, name }) => ({ number, name }))).toEqual([
      { number: "A1", name: "POWER" },
      { number: "A2", name: "GND" },
    ]);
    expect(connector.source).toEqual({ libraryId: "library-1", libraryRevision: "3", partId: "part-1" });
  });

  it("전선과 케이블의 수동 경로점을 도면 배치에 저장하고 삭제 시 정리한다", () => {
    const fixture = twoConnectors();
    const wire = addWireRun(fixture.project, fixture.harnessId, {
      part: {
        name: "단선", partNumber: "WIRE-1", manufacturer: "Test", outerDiameterMm: 1.2,
        color: "RD", gauge: "22 AWG", source: { libraryId: "L1", libraryRevision: "1", partId: "P1" },
      },
      from: fixture.from, to: fixture.to, lengthMm: 300,
    });
    let project = setConnectionRoute(wire.project, fixture.harnessId, wire.connectionId, { x: 420, y: 260 });
    expect(project.harnesses[0].drawing.connectionRoutes?.[wire.connectionId].point).toEqual({ x: 420, y: 260 });

    const cable = addCableRun(project, fixture.harnessId, {
      part: {
        name: "2C", partNumber: "CABLE-2", manufacturer: "Test", outerDiameterMm: 5,
        cores: [{ name: "CORE 1", color: "BK", gauge: "22 AWG" }],
        source: { libraryId: "L1", libraryRevision: "1", partId: "C1" },
      },
      lengthMm: 300,
      mappings: [{ coreIndex: 0, from: fixture.from, to: fixture.to }],
    });
    project = setCableRunRoute(cable.project, fixture.harnessId, cable.cableRunId, { x: 430, y: 320 });
    project = setCableRunBreakout(project, fixture.harnessId, cable.cableRunId, "from", { x: 300, y: 180 });
    project = setCableRunLabelOffset(project, fixture.harnessId, cable.cableRunId, { x: 35, y: -28 });
    expect(project.harnesses[0].drawing.cableRunRoutes?.[cable.cableRunId].point).toEqual({ x: 430, y: 320 });
    expect(project.harnesses[0].drawing.cableRunLabelOffsets?.[cable.cableRunId]).toEqual({ x: 35, y: -28 });
    expect(project.harnesses[0].drawing.cableRunBreakouts?.[cable.cableRunId].from).toEqual({ x: 300, y: 180 });

    project = deleteItems(project, fixture.harnessId, new Set(), new Set([wire.connectionId]), new Set([cable.cableRunId]));
    expect(project.harnesses[0].drawing.connectionRoutes).toEqual({});
    expect(project.harnesses[0].drawing.cableRunRoutes).toEqual({});
    expect(project.harnesses[0].drawing.cableRunBreakouts).toEqual({});
    expect(project.harnesses[0].drawing.cableRunLabelOffsets).toEqual({});
  });

  it("선택한 커넥터와 수동 경로점을 같은 거리로 한 번에 이동한다", () => {
    const fixture = twoConnectors();
    const wire = addWireRun(fixture.project, fixture.harnessId, {
      part: {
        name: "단선", partNumber: "WIRE-1", manufacturer: "Test", outerDiameterMm: 1.2,
        color: "RD", gauge: "22 AWG", source: { libraryId: "L1", libraryRevision: "1", partId: "P1" },
      },
      from: fixture.from, to: fixture.to, lengthMm: 300,
    });
    let project = setConnectionRoute(wire.project, fixture.harnessId, wire.connectionId, { x: 420, y: 260 });
    const cable = addCableRun(project, fixture.harnessId, {
      part: {
        name: "2C", partNumber: "CABLE-2", manufacturer: "Test", outerDiameterMm: 5,
        cores: [{ name: "CORE 1", color: "BK", gauge: "22 AWG" }],
        source: { libraryId: "L1", libraryRevision: "1", partId: "C1" },
      },
      lengthMm: 300,
      mappings: [{ coreIndex: 0, from: fixture.from, to: fixture.to }],
    });
    project = setCableRunRoute(cable.project, fixture.harnessId, cable.cableRunId, { x: 430, y: 320 });
    project = setCableRunBreakout(project, fixture.harnessId, cable.cableRunId, "from", { x: 300, y: 180 });

    project = moveItems(
      project,
      fixture.harnessId,
      new Set(project.harnesses[0].components.map((component) => component.id)),
      new Set([wire.connectionId]),
      new Set([cable.cableRunId]),
      { x: 80, y: 40 },
    );

    expect(project.harnesses[0].drawing.componentPlacements[fixture.from.componentId].position).toEqual({ x: 180, y: 140 });
    expect(project.harnesses[0].drawing.componentPlacements[fixture.to.componentId].position).toEqual({ x: 780, y: 140 });
    expect(project.harnesses[0].drawing.connectionRoutes?.[wire.connectionId].point).toEqual({ x: 500, y: 300 });
    expect(project.harnesses[0].drawing.cableRunRoutes?.[cable.cableRunId].point).toEqual({ x: 510, y: 360 });
    expect(project.harnesses[0].drawing.cableRunBreakouts?.[cable.cableRunId].from).toEqual({ x: 380, y: 220 });
  });

  it("선택한 하네스 도면의 부품·전선·케이블·경로를 새 ID로 함께 복제한다", () => {
    const fixture = twoConnectors();
    const wire = addWireRun(fixture.project, fixture.harnessId, {
      part: {
        name: "단선", partNumber: "WIRE-1", manufacturer: "Test", outerDiameterMm: 1.2,
        color: "RD", gauge: "22 AWG", source: { libraryId: "L1", libraryRevision: "1", partId: "P1" },
      },
      from: fixture.from, to: fixture.to, lengthMm: 300,
    });
    let project = setConnectionRoute(wire.project, fixture.harnessId, wire.connectionId, { x: 420, y: 260 });
    const harnessBeforeCable = project.harnesses[0];
    const cable = addCableRun(project, fixture.harnessId, {
      part: {
        name: "2C", partNumber: "CABLE-2", manufacturer: "Test", outerDiameterMm: 5,
        cores: [{ name: "CORE 1", color: "BK", gauge: "22 AWG" }],
        source: { libraryId: "L1", libraryRevision: "1", partId: "C1" },
      },
      lengthMm: 300,
      mappings: [{
        coreIndex: 0,
        from: { componentId: fixture.from.componentId, pinId: harnessBeforeCable.components[0].pins[1].id },
        to: { componentId: fixture.to.componentId, pinId: harnessBeforeCable.components[1].pins[1].id },
      }],
    });
    project = setCableRunRoute(cable.project, fixture.harnessId, cable.cableRunId, { x: 430, y: 320 });
    project = setCableRunBreakout(project, fixture.harnessId, cable.cableRunId, "from", { x: 300, y: 180 });
    const harness = project.harnesses[0];
    const copied = copyHarnessDrawing(
      harness,
      new Set(harness.components.map((component) => component.id)),
      new Set(harness.connections.map((connection) => connection.id)),
      new Set(harness.cableRuns.map((cableRun) => cableRun.id)),
    );
    const result = pasteHarnessDrawing(project, fixture.harnessId, copied, { x: 20, y: 20 });
    const pastedHarness = result.project.harnesses[0];

    expect(pastedHarness.components.map((component) => component.reference)).toEqual(["J1", "J2", "J3", "J4"]);
    expect(pastedHarness.connections.map((connection) => connection.reference)).toEqual(["W1", "CBL-001:1", "W2", "CBL-002:1"]);
    expect(pastedHarness.cableRuns.map((cableRun) => cableRun.reference)).toEqual(["CBL-001", "CBL-002"]);
    expect(pastedHarness.drawing.componentPlacements[result.componentIds[0]].position).toEqual({ x: 120, y: 120 });
    expect(pastedHarness.drawing.connectionRoutes?.[result.connectionIds[0]].point).toEqual({ x: 440, y: 280 });
    expect(pastedHarness.drawing.cableRunRoutes?.[result.cableRunIds[0]].point).toEqual({ x: 450, y: 340 });
    expect(pastedHarness.drawing.cableRunBreakouts?.[result.cableRunIds[0]].from).toEqual({ x: 320, y: 200 });
    expect(result.connectionIds.every((id) => !harness.connections.some((connection) => connection.id === id))).toBe(true);
    expect(pastedHarness.connections.slice(2).every((connection) => result.componentIds.includes(connection.from.componentId) && result.componentIds.includes(connection.to.componentId))).toBe(true);
  });

  it("하네스 전체를 독립된 새 하네스로 붙여넣는다", () => {
    const fixture = twoConnectors();
    const wire = connectPins(fixture.project, fixture.harnessId, fixture.from, fixture.to);
    const routed = setConnectionRoute(wire.project, fixture.harnessId, wire.connectionId, { x: 420, y: 260 });
    const source = routed.harnesses[0];

    const result = pasteHarness(routed, copyHarness(source));
    const pasted = result.project.harnesses.find((sheet) => sheet.id === result.harnessId)!;

    expect(harnessSheets(result.project)).toHaveLength(2);
    expect(pasted.id).toBe(result.harnessId);
    expect(pasted.partNumber).toBe("HNS-002");
    expect(pasted.name).toBe(source.name);
    expect(pasted.components.map((component) => component.reference)).toEqual(["J1", "J2"]);
    expect(pasted.connections.map((connection) => connection.reference)).toEqual(["W1"]);
    expect(pasted.drawing.componentPlacements[pasted.components[0].id].position).toEqual({ x: 100, y: 100 });
    expect(pasted.drawing.connectionRoutes?.[pasted.connections[0].id].point).toEqual({ x: 420, y: 260 });
    expect(pasted.components.every((component) => !source.components.some((original) => original.id === component.id))).toBe(true);
    expect(pasted.connections.every((connection) => !source.connections.some((original) => original.id === connection.id))).toBe(true);
    expect(pasted.connections[0].from.componentId).toBe(pasted.components[0].id);
    expect(pasted.connections[0].to.componentId).toBe(pasted.components[1].id);
  });

  it("선택한 멀티코어 케이블에 수축튜브를 추가하고 편집·삭제한다", () => {
    const fixture = twoConnectors();
    const cable = addCableRun(fixture.project, fixture.harnessId, {
      part: {
        name: "2C", partNumber: "CABLE-2", manufacturer: "Test", outerDiameterMm: 5,
        cores: [{ name: "CORE 1", color: "BK", gauge: "22 AWG" }],
        source: { libraryId: "L1", libraryRevision: "1", partId: "C1" },
      },
      lengthMm: 300,
      mappings: [{ coreIndex: 0, from: fixture.from, to: fixture.to }],
    });
    const added = addCableHeatShrink(cable.project, fixture.harnessId, cable.cableRunId);
    const heatShrink = added.project.harnesses[0].drawing.cableHeatShrinks?.[0];

    expect(heatShrink).toMatchObject({ reference: "HS-001", text: "HS-001", cableRunId: cable.cableRunId, startRatio: 0.4, endRatio: 0.6, textColor: "#ffffff" });
    const updated = updateCableHeatShrink(added.project, fixture.harnessId, added.heatShrinkId, { text: "SENSOR", startRatio: 0.2, endRatio: 0.5, color: "#334455", textColor: "#ffee00" });
    expect(updated.harnesses[0].drawing.cableHeatShrinks?.[0]).toMatchObject({ text: "SENSOR", startRatio: 0.2, endRatio: 0.5, color: "#334455", textColor: "#ffee00" });
    expect(deleteCableHeatShrink(updated, fixture.harnessId, added.heatShrinkId).harnesses[0].drawing.cableHeatShrinks).toEqual([]);
  });
});

function twoConnectors() {
  let project = createEmptyProject();
  const harnessId = project.harnesses[0].id;
  const first = addConnector(project, harnessId, { name: "A", partNumber: "A-4", manufacturer: "Test", pinCount: 4 }, { x: 100, y: 100 });
  project = first.project;
  const second = addConnector(project, harnessId, { name: "B", partNumber: "B-4", manufacturer: "Test", pinCount: 4 }, { x: 700, y: 100 });
  project = second.project;
  return {
    project,
    harnessId,
    from: { componentId: first.componentId, pinId: project.harnesses[0].components[0].pins[0].id },
    to: { componentId: second.componentId, pinId: project.harnesses[0].components[1].pins[0].id },
  };
}
