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
  threeDConnectionOffset?: { x: number; y: number; z: number };
  terminalPartId?: Id;
  sealPartId?: Id;
}

export type HarnessReleaseStatus = "draft" | "inReview" | "released";

export type HarnessNodeKind = "connector" | "splice" | "junction" | "lug" | "termination";

export interface HarnessNode {
  id: Id;
  kind: HarnessNodeKind;
  reference: string;
  label: string;
  partId?: Id;
  position: Point;
  threeDPosition?: { x: number; y: number; z: number };
  threeDRotation?: { x: number; y: number; z: number };
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
  bendRadiusMm?: number;
  drawingRoute?: {
    offsetX: number;
    offsetY: number;
    sourceBreakoutLength?: number;
    targetBreakoutLength?: number;
  };
  threeDRoute?: {
    controlPoints: Array<{
      t: number;
      offsetX: number;
      offsetY: number;
    }>;
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
  stripLengthMm?: number;
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
  notes?: string;
  currentA?: number;
  voltageV?: number;
  overrideLengthMm?: number;
  drawingRoute?: {
    bendX: number;
  };
}

export interface ManufacturingRules {
  bundlePackingFactor: number;
  maxBundleFillPercent: number;
  minBendRadiusMultiplier: number;
  maxVoltageDropPercent: number;
  requireUnusedCavitySeal: boolean;
  currency: string;
  laborRatePerHour: number;
  overheadPercent: number;
}

export type WorkInstructionKind = "preparation" | "assembly" | "inspection" | "packaging";

export interface WorkInstruction {
  id: Id;
  harnessId: Id;
  sequence: number;
  kind: WorkInstructionKind;
  title: string;
  description: string;
  estimatedMinutes: number;
  partId?: Id;
  imageDataUrl?: string;
}

export type EquipmentProfileKind = "wireProcessor" | "labelPrinter" | "tester";

export interface EquipmentProfile {
  id: Id;
  name: string;
  kind: EquipmentProfileKind;
  delimiter: "," | ";" | "\t";
  includeHeader: boolean;
  enabled: boolean;
}

export interface HarnessVariant {
  id: Id;
  name: string;
  description: string;
  disabledConductorIds: Id[];
  disabledAccessoryIds: Id[];
}

export interface SystemHarnessInstance {
  id: Id;
  harnessId: Id;
  reference: string;
  quantity: number;
}

export interface SystemAssembly {
  id: Id;
  name: string;
  reference: string;
  harnessInstances: SystemHarnessInstance[];
}

export type ProjectRole = "owner" | "editor" | "reviewer" | "viewer";

export interface ProjectMember {
  id: Id;
  name: string;
  role: ProjectRole;
}

export interface ReviewComment {
  id: Id;
  harnessId?: Id;
  entityId?: Id;
  author: string;
  message: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface AccessoryPlacement {
  id: Id;
  partId: Id;
  quantity: number;
  segmentId?: Id;
  nodeId?: Id;
  drawingPosition?: Point;
  drawingWidth?: number;
  drawingHeight?: number;
  threeDOffset?: { x: number; y: number; z: number };
  threeDRotation?: { x: number; y: number; z: number };
  note: string;
}

export type DrawingTableKind = "notes" | "materials" | "lengths";

export type DrawingTableOffsets = Partial<Record<DrawingTableKind, Point>>;

export type DrawingAnnotationKind = "label" | "text" | "image" | "rectangle" | "ellipse" | "arrow";

export interface DrawingAnnotation {
  id: Id;
  kind: DrawingAnnotationKind;
  text: string;
  position: Point;
  width: number;
  height: number;
  imageDataUrl?: string;
  zIndex?: number;
  flippedX?: boolean;
  flippedY?: boolean;
  fillColor?: string;
  strokeColor?: string;
}

export type FormboardFixtureKind = "peg" | "clamp";

export interface FormboardFixture {
  id: Id;
  kind: FormboardFixtureKind;
  position: Point;
  label: string;
}

export interface FormboardLayoutState {
  nodePositions: Record<Id, Point>;
  segmentRoutes: Record<Id, Point[]>;
  fixtures: FormboardFixture[];
}

export interface HarnessAssembly {
  id: Id;
  number: string;
  name: string;
  revision: string;
  releaseStatus?: HarnessReleaseStatus;
  nodes: HarnessNode[];
  segments: HarnessSegment[];
  conductors: Conductor[];
  accessories: AccessoryPlacement[];
  drawingNotes?: string;
  drawingTableOffsets?: DrawingTableOffsets;
  drawingAnnotations?: DrawingAnnotation[];
  formboard?: FormboardLayoutState;
}

export interface HarnessReleaseRecord {
  id: Id;
  harnessId: Id;
  revision: string;
  releasedAt: string;
  releasedBy: string;
  note: string;
  fingerprint: string;
  snapshot: HarnessAssembly;
}

export interface DocumentSettings {
  unit: LengthUnit;
  paper: "A3" | "A4";
  orientation: "landscape";
  outputLocales: string[];
  imageDpi: 150 | 300 | 600;
}

export interface ProjectDocument {
  schemaVersion: 2;
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
  releaseHistory?: HarnessReleaseRecord[];
  testRuns?: HarnessTestRun[];
  manufacturingRules: ManufacturingRules;
  workInstructions: WorkInstruction[];
  equipmentProfiles: EquipmentProfile[];
  variants: HarnessVariant[];
  systems: SystemAssembly[];
  members: ProjectMember[];
  reviewComments: ReviewComment[];
}

export type ViewKind =
  | "workspace"
  | "canvas"
  | "navigator"
  | "inspector"
  | "pinmap"
  | "cutlist"
  | "bom"
  | "test"
  | "bottom"
  | "library"
  | "preview"
  | "formboard"
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
  startStripLengthMm?: number;
  endStripLengthMm?: number;
  notes?: string;
}

export interface ContinuityTestRow {
  conductorId: Id;
  harnessId: Id;
  harnessNumber: string;
  reference: string;
  fromConnector: string;
  fromPin: string;
  toConnector: string;
  toPin: string;
  color: string;
  gauge: string;
  cableCore: string;
  expected: "CONTINUITY";
}

export type ContinuityTestResult = "untested" | "pass" | "fail";

export interface ContinuityTestExecutionRow extends ContinuityTestRow {
  result: ContinuityTestResult;
  note: string;
}

export interface HarnessTestRun {
  id: Id;
  harnessId: Id;
  harnessNumber: string;
  revision: string;
  serialNumber: string;
  operator: string;
  startedAt: string;
  completedAt?: string;
  rows: ContinuityTestExecutionRow[];
}

export interface ContinuityTestResultExportRow {
  harnessNumber: string;
  revision: string;
  serialNumber: string;
  operator: string;
  startedAt: string;
  completedAt: string;
  reference: string;
  fromConnector: string;
  fromPin: string;
  toConnector: string;
  toPin: string;
  expected: string;
  result: ContinuityTestResult;
  note: string;
}
