export type Id = string;
export type LengthUnit = "mm";
export type QuantityUnit = "ea" | "m";
export type CableConstruction = "multiCore" | "shieldedMultiCore";

export interface CableCoreDefinition {
  id: string;
  number: string;
  name: string;
  color: string;
  gauge: string;
}
export type PartCategory =
  | "housing"
  | "terminal"
  | "seal"
  | "wire"
  | "cable"
  | "heatShrink"
  | "sleeve"
  | "shield"
  | "tape"
  | "label"
  | "clip"
  | "lug"
  | "splice";

export interface Point {
  x: number;
  y: number;
}

export interface PartSnapshot {
  id: Id;
  name?: string;
  partNumber: string;
  manufacturer: string;
  description: string;
  revision: string;
  category: PartCategory;
  unit: QuantityUnit;
  color?: string;
  gauge?: string;
  attributes: Record<string, string>;
  preview?: PartPreview;
  symbolAssetId?: Id;
  modelAssetId?: Id;
  sourceLibraryRevision?: number;
}

export interface PartPreview {
  kind: "photo" | "model" | "drawing";
  dataUrl: string;
  sourceName?: string;
}

export interface SymbolAsset {
  id: Id;
  name: string;
  sourceFormat: "dxf" | "svg";
  sourceName: string;
  viewBox: string;
  svg: string;
}

export interface ModelMesh {
  name: string;
  color?: [number, number, number];
  positions: number[];
  normals?: number[];
  indices: number[];
}

export interface ModelAsset {
  id: Id;
  name: string;
  sourceFormat: "step";
  sourceName: string;
  sourceDataBase64: string;
  meshes: ModelMesh[];
}

export interface PinDefinition {
  id: Id;
  number: string;
  name: string;
  position: Point;
  terminalPartId?: Id;
  sealPartId?: Id;
}

export type HarnessNodeKind = "connector" | "splice" | "junction" | "lug" | "termination";

export interface HarnessNode {
  id: Id;
  kind: HarnessNodeKind;
  reference: string;
  label: string;
  partId?: Id;
  position: Point;
  pins: PinDefinition[];
}

export interface HarnessSegment {
  id: Id;
  fromNodeId: Id;
  toNodeId: Id;
  lengthMm: number;
  label: string;
  cablePartId?: Id;
  startHeatShrinkPartId?: Id;
  endHeatShrinkPartId?: Id;
  sleevePartId?: Id;
  shieldPartId?: Id;
  tapePartId?: Id;
  drawingRoute?: {
    offsetX: number;
    offsetY: number;
    sourceBreakoutLength?: number;
    targetBreakoutLength?: number;
  };
}

export interface Endpoint {
  nodeId: Id;
  pinId?: Id;
}

export interface Termination {
  terminalPartId?: Id;
  sealPartId?: Id;
  lugPartId?: Id;
  allowanceMm: number;
}

export interface Conductor {
  id: Id;
  reference: string;
  from: Endpoint;
  to: Endpoint;
  wirePartId: Id;
  color: string;
  gauge: string;
  routeSegmentIds: Id[];
  startTermination: Termination;
  endTermination: Termination;
  adjustmentMm: number;
  twistGroup?: string;
  shieldGroup?: string;
  cableRunId?: Id;
  cableCoreId?: string;
  drawingRoute?: {
    bendX: number;
  };
}

export interface AccessoryPlacement {
  id: Id;
  partId: Id;
  quantity: number;
  segmentId?: Id;
  note: string;
}

export interface HarnessAssembly {
  id: Id;
  number: string;
  name: string;
  revision: string;
  nodes: HarnessNode[];
  segments: HarnessSegment[];
  conductors: Conductor[];
  accessories: AccessoryPlacement[];
}

export interface DocumentSettings {
  unit: LengthUnit;
  paper: "A3" | "A4";
  orientation: "landscape";
  outputLocales: string[];
  imageDpi: 150 | 300 | 600;
}

export interface ProjectDocument {
  schemaVersion: 1;
  id: Id;
  name: string;
  projectNumber: string;
  revision: string;
  createdAt: string;
  updatedAt: string;
  settings: DocumentSettings;
  assets: SymbolAsset[];
  modelAssets: ModelAsset[];
  parts: PartSnapshot[];
  harnesses: HarnessAssembly[];
}

export type ViewKind =
  | "workspace"
  | "canvas"
  | "navigator"
  | "inspector"
  | "pinmap"
  | "cutlist"
  | "bom"
  | "bottom"
  | "library"
  | "preview"
  | "threeD";

export interface SessionSnapshot {
  sessionId: Id;
  revision: number;
  dirty: boolean;
  readOnly: boolean;
  path?: string;
  project: ProjectDocument;
}

export interface ValidationIssue {
  id: string;
  severity: "error" | "warning";
  code: string;
  messageKey: string;
  entityId?: Id;
  harnessId?: Id;
  details?: string;
}

export interface BomRow {
  partId: Id;
  partNumber: string;
  manufacturer: string;
  description: string;
  category: PartCategory;
  specification: string;
  unit: QuantityUnit;
  quantity: number;
  harnesses: string[];
}

export interface CutListRow {
  harnessNumber: string;
  conductorId: Id;
  reference: string;
  from: string;
  to: string;
  partNumber: string;
  color: string;
  gauge: string;
  lengthMm: number;
}
