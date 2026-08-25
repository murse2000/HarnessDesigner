import { describe, expect, it } from "vitest";
import { createLibraryPartDraft, libraryPartToCableSnapshot, libraryPartToConnectorDraft, libraryPartToWireSnapshot, resizeLibraryCores, resizeLibraryPins, type LibraryPart2D, type LibrarySummary2D } from "./library";

describe("외부 2D 부품 라이브러리 모델", () => {
  it("부품을 프로젝트 커넥터 스냅샷으로 복사한다", () => {
    const part: LibraryPart2D = {
      id: "part-1",
      category: "housing",
      name: "4핀 하우징",
      partNumber: "TEST-04",
      manufacturer: "Test",
      description: "",
      outerDiameterMm: null,
      pins: [{ number: "1", name: "VCC" }, { number: "2", name: "GND" }],
      cores: [],
    };
    const library: LibrarySummary2D = { path: "/tmp/test.hlib2d", id: "library-1", name: "Test", revision: "1", partCount: 1 };

    const draft = libraryPartToConnectorDraft(part, library);
    part.pins[0].name = "CHANGED";

    expect(draft.pins?.[0].name).toBe("VCC");
    expect(draft.source).toEqual({ libraryId: "library-1", libraryRevision: "1", partId: "part-1" });
  });

  it("핀 수를 바꾸면 기존 핀 정의를 유지하고 필요한 핀만 추가한다", () => {
    const draft = createLibraryPartDraft("housing", 2);
    draft.pins[0].name = "POWER";

    const pins = resizeLibraryPins(draft.pins, 4);

    expect(pins).toEqual([
      { number: "1", name: "POWER" },
      { number: "2", name: "PIN" },
      { number: "3", name: "PIN" },
      { number: "4", name: "PIN" },
    ]);
  });

  it("단선과 멀티코어 부품을 프로젝트 스냅샷으로 복사한다", () => {
    const library: LibrarySummary2D = { path: "/tmp/test.hlib2d", id: "library-1", name: "Test", revision: "7", partCount: 2 };
    const wire: LibraryPart2D = {
      id: "wire-1", category: "wire", name: "20 AWG 단선", partNumber: "WIRE-20", manufacturer: "Test",
      description: "", outerDiameterMm: 1.6, pins: [], cores: [{ name: "WIRE", color: "RD", gauge: "20 AWG" }],
    };
    const cable: LibraryPart2D = {
      id: "cable-1", category: "cable", name: "4C 케이블", partNumber: "CABLE-4", manufacturer: "Test",
      description: "", outerDiameterMm: 6.2, pins: [], cores: [
        { name: "CORE 1", color: "BK", gauge: "22 AWG" },
        { name: "CORE 2", color: "WH", gauge: "22 AWG" },
      ],
    };

    expect(libraryPartToWireSnapshot(wire, library)).toMatchObject({ partNumber: "WIRE-20", core: { color: "RD" } });
    const snapshot = libraryPartToCableSnapshot(cable, library);
    cable.cores[0].color = "GN";
    expect(snapshot).toMatchObject({ partNumber: "CABLE-4", outerDiameterMm: 6.2, cores: [{ color: "BK" }, { color: "WH" }] });
  });

  it("케이블 코어 수를 바꾸면 기존 정의를 유지한다", () => {
    const draft = createLibraryPartDraft("cable", 2);
    draft.cores[0].name = "POWER";
    expect(resizeLibraryCores(draft.cores, 3)).toEqual([
      { name: "POWER", color: "BK", gauge: "22 AWG" },
      { name: "CORE 2", color: "WH", gauge: "22 AWG" },
      { name: "CORE 3", color: "RD", gauge: "22 AWG" },
    ]);
  });
});
