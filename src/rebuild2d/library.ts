import type { ConnectorDraft, PartDrawing2D, PartSource2D, PinAnchor2D } from "./model";

export type LibraryPin2D = {
  number: string;
  name: string;
  anchor?: PinAnchor2D;
};

export type LibraryCore2D = {
  name: string;
  color: string;
  gauge: string;
};

export type LibraryPartCategory2D = "housing" | "wire" | "cable";

export type LibraryPart2D = {
  id: string;
  category: LibraryPartCategory2D;
  name: string;
  partNumber: string;
  manufacturer: string;
  description: string;
  outerDiameterMm: number | null;
  pins: LibraryPin2D[];
  cores: LibraryCore2D[];
  drawing?: PartDrawing2D;
};

export type LibrarySummary2D = {
  path: string;
  id: string;
  name: string;
  revision: string;
  partCount: number;
};

export type LibraryPage2D = {
  summary: LibrarySummary2D;
  parts: LibraryPart2D[];
  total: number;
  offset: number;
  limit: number;
};

export type DefaultLibraryInstallation2D = {
  folder: string;
  library: LibrarySummary2D;
};

export type LibraryPartDraft2D = Omit<LibraryPart2D, "id"> & { id?: string };

export type WirePartSnapshot2D = {
  name: string;
  partNumber: string;
  manufacturer: string;
  outerDiameterMm: number | null;
  core: LibraryCore2D;
  source: PartSource2D;
};

export type CablePartSnapshot2D = {
  name: string;
  partNumber: string;
  manufacturer: string;
  outerDiameterMm: number;
  cores: LibraryCore2D[];
  source: PartSource2D;
};

export function partSource(part: LibraryPart2D, library: LibrarySummary2D): PartSource2D {
  return {
    libraryId: library.id,
    libraryRevision: library.revision,
    partId: part.id,
  };
}

export function libraryPartToConnectorDraft(part: LibraryPart2D, library: LibrarySummary2D): ConnectorDraft {
  return {
    name: part.name,
    partNumber: part.partNumber,
    manufacturer: part.manufacturer,
    pinCount: part.pins.length,
    pins: part.pins.map((pin) => ({ ...pin })),
    drawing: part.drawing ? {
      ...part.drawing,
      paths: part.drawing.paths.map((path) => ({ ...path, points: path.points.map((point) => ({ ...point })) })),
      unsupportedEntities: part.drawing.unsupportedEntities.map((item) => ({ ...item })),
    } : undefined,
    source: partSource(part, library),
  };
}

export function libraryPartToWireSnapshot(part: LibraryPart2D, library: LibrarySummary2D): WirePartSnapshot2D {
  if (part.category !== "wire" || part.cores.length !== 1) throw new Error("단선 부품이 아닙니다.");
  return {
    name: part.name,
    partNumber: part.partNumber,
    manufacturer: part.manufacturer,
    outerDiameterMm: part.outerDiameterMm,
    core: { ...part.cores[0] },
    source: partSource(part, library),
  };
}

export function libraryPartToCableSnapshot(part: LibraryPart2D, library: LibrarySummary2D): CablePartSnapshot2D {
  if (part.category !== "cable" || part.cores.length < 2 || !part.outerDiameterMm) throw new Error("멀티코어 케이블 부품이 아닙니다.");
  return {
    name: part.name,
    partNumber: part.partNumber,
    manufacturer: part.manufacturer,
    outerDiameterMm: part.outerDiameterMm,
    cores: part.cores.map((core) => ({ ...core })),
    source: partSource(part, library),
  };
}

export function createLibraryPartDraft(category: LibraryPartCategory2D = "housing", itemCount?: number): LibraryPartDraft2D {
  const count = itemCount ?? (category === "housing" ? 4 : category === "wire" ? 1 : 4);
  const colors = ["BK", "WH", "RD", "GN", "BU", "YE", "OR", "BN"];
  return {
    category,
    name: category === "housing" ? "새 커넥터 하우징" : category === "wire" ? "새 단선" : "새 멀티코어 케이블",
    partNumber: "",
    manufacturer: "",
    description: "",
    outerDiameterMm: category === "housing" ? null : category === "wire" ? 1.6 : 6,
    pins: category === "housing" ? Array.from({ length: count }, (_, index) => ({
      number: String(index + 1),
      name: "PIN",
    })) : [],
    cores: category === "housing" ? [] : Array.from({ length: count }, (_, index) => ({
      name: category === "wire" ? "WIRE" : `CORE ${index + 1}`,
      color: colors[index % colors.length],
      gauge: category === "wire" ? "20 AWG" : "22 AWG",
    })),
    drawing: undefined,
  };
}

export function resizeLibraryPins(pins: LibraryPin2D[], pinCount: number) {
  const count = Math.max(1, Math.min(256, Math.trunc(pinCount)));
  return Array.from({ length: count }, (_, index) => (
    pins[index] ? { ...pins[index] } : { number: String(index + 1), name: "PIN" }
  ));
}

export function resizeLibraryCores(cores: LibraryCore2D[], coreCount: number) {
  const count = Math.max(1, Math.min(256, Math.trunc(coreCount)));
  const colors = ["BK", "WH", "RD", "GN", "BU", "YE", "OR", "BN"];
  return Array.from({ length: count }, (_, index) => (
    cores[index] ? { ...cores[index] } : { name: `CORE ${index + 1}`, color: colors[index % colors.length], gauge: "22 AWG" }
  ));
}
