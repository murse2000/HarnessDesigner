import type { ModelAsset } from "../domain/types";

export const PROJECT_DOCUMENT_TYPE = "harness-designer-2d" as const;
export const PROJECT_SCHEMA_VERSION = 2 as const;

export type Point2D = {
  x: number;
  y: number;
};

export type PinAnchor2D = {
  xMm: number;
  yMm: number;
  directionX: number;
  directionY: number;
};

export type PartDrawingPath2D = {
  points: Point2D[];
  closed: boolean;
  layer: string;
  sourceType: string;
};

export type PartDrawing2D = {
  sourceName: string;
  widthMm: number;
  heightMm: number;
  paths: PartDrawingPath2D[];
  outlineStrength?: number;
  imageDataUrl?: string;
  unsupportedEntities: Array<{ type: string; count: number }>;
  editorState?: PartDrawingEditorState2D;
};

export type PartDrawingEditorState2D = {
  source: {
    sourceName: string;
    bounds: Point2D & { width: number; height: number };
    paths: PartDrawingPath2D[];
    unsupported: Array<{ type: string; count: number }>;
    imageDataUrl?: string;
    sourceType?: "image";
    pageNumber?: number;
    pageCount?: number;
  };
  selection: Point2D & { width: number; height: number };
  viewBox: Point2D & { width: number; height: number };
  pinPoints: Array<Point2D | null>;
  stepRotation?: { x: number; y: number; z: number };
  stepAsset?: ModelAsset;
  stepRenderMode?: "shaded" | "technical";
  stepSurfaceColors?: Record<string, string>;
};

export type Pin2D = {
  id: string;
  number: string;
  name: string;
  anchor?: PinAnchor2D;
};

export type Connector2D = {
  id: string;
  kind: "connector";
  reference: string;
  name: string;
  partNumber: string;
  manufacturer: string;
  pins: Pin2D[];
  drawing?: PartDrawing2D;
  source?: PartSource2D;
};

export type PartSource2D = {
  libraryId: string;
  libraryRevision: string;
  partId: string;
};

export type Component2D = Connector2D;

export type PinEndpoint2D = {
  componentId: string;
  pinId: string;
};

export type Connection2D = {
  id: string;
  kind: "wire" | "cableCore";
  reference: string;
  from: PinEndpoint2D;
  to: PinEndpoint2D;
  color: string;
  gauge: string;
  lengthMm: number;
  notes: string;
  part?: WirePartSnapshot2D;
  cableRunId?: string;
  cableCoreIndex?: number;
};

export type WirePartSnapshot2D = {
  name: string;
  partNumber: string;
  manufacturer: string;
  outerDiameterMm: number | null;
  source: PartSource2D;
};

export type CableCoreSnapshot2D = {
  name: string;
  color: string;
  gauge: string;
};

export type CableRun2D = {
  id: string;
  reference: string;
  name: string;
  partNumber: string;
  manufacturer: string;
  lengthMm: number;
  outerDiameterMm: number;
  cores: CableCoreSnapshot2D[];
  source: PartSource2D;
};

export type CableHeatShrink2D = {
  id: string;
  cableRunId: string;
  reference: string;
  text: string;
  startRatio: number;
  endRatio: number;
  color: string;
  textColor: string;
};

export type ComponentPlacement2D = {
  position: Point2D;
  pinSide: "left" | "right";
  rotation?: ComponentRotation2D;
  displayScale?: number;
  referenceLabel?: ConnectorLabelPlacement2D;
  nameLabel?: ConnectorLabelPlacement2D;
  pinMapOffset?: Point2D;
};

export type ComponentRotation2D = 0 | 90 | 180 | 270;

export type ConnectorLabelPlacement2D = {
  offset?: Point2D;
  rotation?: number;
};

export type DrawingTitleBlock2D = {
  drawingTitle: string;
  createdDate: string;
  createdBy: string;
  reviewedBy: string;
  approvedBy: string;
};

export type DrawingAnnotationKind2D = "label" | "text" | "rectangle" | "ellipse" | "image";

export type DrawingAnnotation2D = {
  id: string;
  kind: DrawingAnnotationKind2D;
  position: Point2D;
  width: number;
  height: number;
  text: string;
  fontSize: number;
  textColor: string;
  fillColor: string;
  strokeColor: string;
  imageDataUrl?: string;
};

export type DrawingLayout2D = {
  componentPlacements: Record<string, ComponentPlacement2D>;
  connectionRoutes?: Record<string, DrawingRoute2D>;
  cableRunRoutes?: Record<string, DrawingRoute2D>;
  cableRunBreakouts?: Record<string, CableRunBreakout2D>;
  cableRunLabelOffsets?: Record<string, Point2D>;
  cableHeatShrinks?: CableHeatShrink2D[];
  titleBlock?: DrawingTitleBlock2D;
  annotations?: DrawingAnnotation2D[];
};

export type DrawingRoute2D = {
  point: Point2D;
};

export type CableRunBreakout2D = {
  from?: Point2D;
  to?: Point2D;
};

export type Harness2D = {
  id: string;
  partNumber: string;
  name: string;
  revision: string;
  components: Component2D[];
  connections: Connection2D[];
  cableRuns: CableRun2D[];
  drawing: DrawingLayout2D;
};

export type Project2D = {
  documentType: typeof PROJECT_DOCUMENT_TYPE;
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  id: string;
  projectNumber: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  harnesses: Harness2D[];
};

export type ConnectorDraft = {
  name: string;
  partNumber: string;
  manufacturer: string;
  pinCount: number;
  pins?: Array<Pick<Pin2D, "number" | "name" | "anchor">>;
  drawing?: PartDrawing2D;
  source?: PartSource2D;
};

export type DrawingAnnotationDraft2D = Pick<DrawingAnnotation2D, "kind" | "position"> & Partial<Omit<DrawingAnnotation2D, "id" | "kind" | "position">>;

export type CopiedComponent2D = {
  component: Component2D;
  placement: ComponentPlacement2D;
};

export type CopiedHarnessDrawing2D = {
  components: CopiedComponent2D[];
  connections: Connection2D[];
  cableRuns: CableRun2D[];
  connectionRoutes: Record<string, DrawingRoute2D>;
  cableRunRoutes: Record<string, DrawingRoute2D>;
  cableRunBreakouts: Record<string, CableRunBreakout2D>;
  cableRunLabelOffsets: Record<string, Point2D>;
  cableHeatShrinks: CableHeatShrink2D[];
};

export type CopiedHarness2D = {
  name: string;
  revision: string;
  titleBlock?: DrawingTitleBlock2D;
  annotations: DrawingAnnotation2D[];
  drawing: CopiedHarnessDrawing2D;
};

const createId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

const now = () => new Date().toISOString();

export function createEmptyProject(): Project2D {
  const timestamp = now();
  return {
    documentType: PROJECT_DOCUMENT_TYPE,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: createId("project"),
    projectNumber: "PRJ-001",
    name: "새 하네스 프로젝트",
    createdAt: timestamp,
    updatedAt: timestamp,
    harnesses: [{
      id: createId("harness"),
      partNumber: "HNS-001",
      name: "새 하네스",
      revision: "A",
      components: [],
      connections: [],
      cableRuns: [],
      drawing: {
        componentPlacements: {},
        connectionRoutes: {},
        cableRunRoutes: {},
        cableRunBreakouts: {},
        cableRunLabelOffsets: {},
        cableHeatShrinks: [],
        titleBlock: { drawingTitle: "HARNESS ASSEMBLY DRAWING", createdDate: timestamp.slice(0, 10), createdBy: "", reviewedBy: "", approvedBy: "" },
        annotations: [],
      },
    }],
  };
}

export function addHarness(project: Project2D): { project: Project2D; harnessId: string } {
  const timestamp = now();
  const harnessId = createId("harness");
  const harness: Harness2D = {
    id: harnessId,
    partNumber: nextHarnessPartNumber(project.harnesses),
    name: "새 하네스",
    revision: "A",
    components: [],
    connections: [],
    cableRuns: [],
    drawing: {
      componentPlacements: {},
      connectionRoutes: {},
      cableRunRoutes: {},
      cableRunBreakouts: {},
      cableRunLabelOffsets: {},
      cableHeatShrinks: [],
      titleBlock: { drawingTitle: "HARNESS ASSEMBLY DRAWING", createdDate: timestamp.slice(0, 10), createdBy: "", reviewedBy: "", approvedBy: "" },
      annotations: [],
    },
  };
  return {
    harnessId,
    project: { ...project, updatedAt: timestamp, harnesses: [...project.harnesses, harness] },
  };
}

export function deleteHarness(project: Project2D, harnessId: string): Project2D {
  if (project.harnesses.length <= 1 || !project.harnesses.some((harness) => harness.id === harnessId)) return project;
  return touch({ ...project, harnesses: project.harnesses.filter((harness) => harness.id !== harnessId) });
}

export function reorderHarness(
  project: Project2D,
  sourceHarnessId: string,
  targetHarnessId: string,
  placement: "before" | "after",
): Project2D {
  if (sourceHarnessId === targetHarnessId) return project;
  const sourceIndex = project.harnesses.findIndex((harness) => harness.id === sourceHarnessId);
  if (sourceIndex < 0 || !project.harnesses.some((harness) => harness.id === targetHarnessId)) return project;

  const harnesses = [...project.harnesses];
  const [source] = harnesses.splice(sourceIndex, 1);
  const targetIndex = harnesses.findIndex((harness) => harness.id === targetHarnessId);
  harnesses.splice(placement === "before" ? targetIndex : targetIndex + 1, 0, source);
  if (harnesses.every((harness, index) => harness.id === project.harnesses[index].id)) return project;
  return touch({ ...project, harnesses });
}

export function assertProject2D(value: unknown): asserts value is Project2D {
  if (!value || typeof value !== "object") throw new Error("프로젝트 데이터가 비어 있습니다.");
  const project = value as Partial<Project2D>;
  if (project.documentType !== PROJECT_DOCUMENT_TYPE || project.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    throw new Error("새 2D 프로젝트 형식이 아닙니다.");
  }
  if (!Array.isArray(project.harnesses) || project.harnesses.length === 0) {
    throw new Error("프로젝트에 하네스가 없습니다.");
  }
}

export function nextReference(prefix: string, references: string[]) {
  const used = new Set(references);
  let index = 1;
  while (used.has(`${prefix}${index}`)) index += 1;
  return `${prefix}${index}`;
}

export function addConnector(
  project: Project2D,
  harnessId: string,
  draft: ConnectorDraft,
  position: Point2D,
): { project: Project2D; componentId: string } {
  const harness = project.harnesses.find((item) => item.id === harnessId);
  if (!harness) throw new Error("하네스를 찾을 수 없습니다.");
  if (!Number.isInteger(draft.pinCount) || draft.pinCount < 1 || draft.pinCount > 256) {
    throw new Error("핀 수는 1~256 사이의 정수여야 합니다.");
  }

  const componentId = createId("connector");
  const reference = nextReference("J", harness.components.map((item) => item.reference));
  const connector: Connector2D = {
    id: componentId,
    kind: "connector",
    reference,
    name: draft.name.trim() || "커넥터",
    partNumber: draft.partNumber.trim(),
    manufacturer: draft.manufacturer.trim(),
    pins: Array.from({ length: draft.pinCount }, (_, index) => ({
      id: createId("pin"),
      number: draft.pins?.[index]?.number ?? String(index + 1),
      name: draft.pins?.[index]?.name ?? "PIN",
      anchor: draft.pins?.[index]?.anchor ? { ...draft.pins[index].anchor } : undefined,
    })),
    drawing: draft.drawing ? clonePartDrawing(draft.drawing) : undefined,
    source: draft.source ? { ...draft.source } : undefined,
  };
  const pinSide = harness.components.length % 2 === 0 ? "right" : "left";

  return {
    componentId,
    project: updateHarness(project, harnessId, (current) => ({
      ...current,
      components: [...current.components, connector],
      drawing: {
        ...current.drawing,
        componentPlacements: {
          ...current.drawing.componentPlacements,
          [componentId]: { position, pinSide, rotation: 0 },
        },
      },
    })),
  };
}

export function copyHarnessDrawing(
  harness: Harness2D,
  selectedComponentIds: Set<string>,
  selectedConnectionIds: Set<string>,
  selectedCableRunIds: Set<string>,
): CopiedHarnessDrawing2D {
  const componentIds = new Set(selectedComponentIds);
  const connectionIds = new Set(selectedConnectionIds);
  const cableRunIds = new Set(selectedCableRunIds);

  harness.connections.forEach((connection) => {
    if (!selectedConnectionIds.has(connection.id) && !cableRunIds.has(connection.cableRunId ?? "")) return;
    connectionIds.add(connection.id);
    componentIds.add(connection.from.componentId);
    componentIds.add(connection.to.componentId);
    if (connection.cableRunId) cableRunIds.add(connection.cableRunId);
  });

  harness.connections.forEach((connection) => {
    if (!selectedComponentIds.has(connection.from.componentId) || !selectedComponentIds.has(connection.to.componentId)) return;
    connectionIds.add(connection.id);
    if (connection.cableRunId) cableRunIds.add(connection.cableRunId);
  });

  harness.connections.forEach((connection) => {
    if (!cableRunIds.has(connection.cableRunId ?? "")) return;
    connectionIds.add(connection.id);
    componentIds.add(connection.from.componentId);
    componentIds.add(connection.to.componentId);
  });

  const components = harness.components.flatMap((component) => {
    if (!componentIds.has(component.id)) return [];
    const placement = harness.drawing.componentPlacements[component.id];
    if (!placement) return [];
    return [{
      component: {
        ...component,
        pins: component.pins.map((pin) => ({ ...pin, anchor: pin.anchor ? { ...pin.anchor } : undefined })),
        drawing: component.drawing ? clonePartDrawing(component.drawing) : undefined,
        source: component.source ? { ...component.source } : undefined,
      },
      placement: {
        ...placement,
        position: { ...placement.position },
        referenceLabel: cloneLabelPlacement(placement.referenceLabel),
        nameLabel: cloneLabelPlacement(placement.nameLabel),
        pinMapOffset: placement.pinMapOffset ? { ...placement.pinMapOffset } : undefined,
      },
    }];
  });

  return {
    components,
    connections: harness.connections.filter((connection) => connectionIds.has(connection.id)).map(cloneConnection),
    cableRuns: harness.cableRuns.filter((cableRun) => cableRunIds.has(cableRun.id)).map(cloneCableRun),
    connectionRoutes: Object.fromEntries(Object.entries(harness.drawing.connectionRoutes ?? {})
      .filter(([connectionId]) => connectionIds.has(connectionId))
      .map(([connectionId, route]) => [connectionId, { point: { ...route.point } }])),
    cableRunRoutes: Object.fromEntries(Object.entries(harness.drawing.cableRunRoutes ?? {})
      .filter(([cableRunId]) => cableRunIds.has(cableRunId))
      .map(([cableRunId, route]) => [cableRunId, { point: { ...route.point } }])),
    cableRunBreakouts: Object.fromEntries(Object.entries(harness.drawing.cableRunBreakouts ?? {})
      .filter(([cableRunId]) => cableRunIds.has(cableRunId))
      .map(([cableRunId, breakout]) => [cableRunId, {
        from: breakout.from ? { ...breakout.from } : undefined,
        to: breakout.to ? { ...breakout.to } : undefined,
      }])),
    cableRunLabelOffsets: Object.fromEntries(Object.entries(harness.drawing.cableRunLabelOffsets ?? {})
      .filter(([cableRunId]) => cableRunIds.has(cableRunId))
      .map(([cableRunId, offset]) => [cableRunId, { ...offset }])),
    cableHeatShrinks: (harness.drawing.cableHeatShrinks ?? [])
      .filter((heatShrink) => cableRunIds.has(heatShrink.cableRunId))
      .map((heatShrink) => ({ ...heatShrink })),
  };
}

export function copyHarness(harness: Harness2D): CopiedHarness2D {
  return {
    name: harness.name,
    revision: harness.revision,
    titleBlock: harness.drawing.titleBlock ? { ...harness.drawing.titleBlock } : undefined,
    annotations: (harness.drawing.annotations ?? []).map(cloneAnnotation),
    drawing: copyHarnessDrawing(
      harness,
      new Set(harness.components.map((component) => component.id)),
      new Set(harness.connections.map((connection) => connection.id)),
      new Set(harness.cableRuns.map((cableRun) => cableRun.id)),
    ),
  };
}

export function pasteHarness(
  project: Project2D,
  copied: CopiedHarness2D,
): { project: Project2D; harnessId: string } {
  const harnessId = createId("harness");
  const harness: Harness2D = {
    id: harnessId,
    partNumber: nextHarnessPartNumber(project.harnesses),
    name: copied.name,
    revision: copied.revision,
    components: [],
    connections: [],
    cableRuns: [],
    drawing: {
      componentPlacements: {},
      connectionRoutes: {},
      cableRunRoutes: {},
      cableRunBreakouts: {},
      cableRunLabelOffsets: {},
      cableHeatShrinks: [],
      titleBlock: copied.titleBlock ? { ...copied.titleBlock } : undefined,
      annotations: copied.annotations.map((annotation) => ({ ...cloneAnnotation(annotation), id: createId("annotation") })),
    },
  };
  const appended = touch({ ...project, harnesses: [...project.harnesses, harness] });
  return {
    harnessId,
    project: pasteHarnessDrawing(appended, harnessId, copied.drawing, { x: 0, y: 0 }).project,
  };
}

export function pasteHarnessDrawing(
  project: Project2D,
  harnessId: string,
  copied: CopiedHarnessDrawing2D,
  offset: Point2D,
): { project: Project2D; componentIds: string[]; connectionIds: string[]; cableRunIds: string[] } {
  const harness = project.harnesses.find((item) => item.id === harnessId);
  if (!harness) throw new Error("하네스를 찾을 수 없습니다.");

  const references = harness.components.map((component) => component.reference);
  const componentPlacements = { ...harness.drawing.componentPlacements };
  const componentIdMap = new Map<string, string>();
  const pinIdMap = new Map<string, string>();
  const components = copied.components.map(({ component, placement }) => {
    const id = createId("connector");
    const reference = nextReference("J", references);
    references.push(reference);
    componentIdMap.set(component.id, id);
    componentPlacements[id] = {
      ...placement,
      position: {
        x: placement.position.x + offset.x,
        y: placement.position.y + offset.y,
      },
      referenceLabel: cloneLabelPlacement(placement.referenceLabel),
      nameLabel: cloneLabelPlacement(placement.nameLabel),
      pinMapOffset: placement.pinMapOffset ? { ...placement.pinMapOffset } : undefined,
    };
    return {
      ...component,
      id,
      reference,
      pins: component.pins.map((pin) => {
        const pinId = createId("pin");
        pinIdMap.set(pin.id, pinId);
        return { ...pin, id: pinId, anchor: pin.anchor ? { ...pin.anchor } : undefined };
      }),
      drawing: component.drawing ? clonePartDrawing(component.drawing) : undefined,
      source: component.source ? { ...component.source } : undefined,
    };
  });

  const cableReferences = harness.cableRuns.map((cableRun) => cableRun.reference);
  const cableRunIdMap = new Map<string, string>();
  const cableRuns = copied.cableRuns.map((cableRun) => {
    const id = createId("cable-run");
    const reference = nextCableReference(cableReferences);
    cableReferences.push(reference);
    cableRunIdMap.set(cableRun.id, id);
    return { ...cloneCableRun(cableRun), id, reference };
  });

  const wireReferences = harness.connections.filter((connection) => connection.kind === "wire").map((connection) => connection.reference);
  const connectionIdMap = new Map<string, string>();
  const connections = copied.connections.map((connection) => {
    const id = createId(connection.kind === "cableCore" ? "cable-core" : "wire");
    connectionIdMap.set(connection.id, id);
    const cableRunId = connection.cableRunId ? cableRunIdMap.get(connection.cableRunId) : undefined;
    const reference = cableRunId
      ? `${cableRuns.find((cableRun) => cableRun.id === cableRunId)?.reference}:${(connection.cableCoreIndex ?? 0) + 1}`
      : nextReference("W", wireReferences);
    if (!cableRunId) wireReferences.push(reference);
    return {
      ...cloneConnection(connection),
      id,
      reference,
      from: {
        componentId: componentIdMap.get(connection.from.componentId)!,
        pinId: pinIdMap.get(connection.from.pinId)!,
      },
      to: {
        componentId: componentIdMap.get(connection.to.componentId)!,
        pinId: pinIdMap.get(connection.to.pinId)!,
      },
      cableRunId,
    };
  });

  const connectionRoutes = { ...harness.drawing.connectionRoutes };
  Object.entries(copied.connectionRoutes).forEach(([oldId, route]) => {
    const id = connectionIdMap.get(oldId);
    if (id) connectionRoutes[id] = { point: { x: route.point.x + offset.x, y: route.point.y + offset.y } };
  });
  const cableRunRoutes = { ...harness.drawing.cableRunRoutes };
  Object.entries(copied.cableRunRoutes).forEach(([oldId, route]) => {
    const id = cableRunIdMap.get(oldId);
    if (id) cableRunRoutes[id] = { point: { x: route.point.x + offset.x, y: route.point.y + offset.y } };
  });
  const cableRunBreakouts = { ...harness.drawing.cableRunBreakouts };
  Object.entries(copied.cableRunBreakouts).forEach(([oldId, breakout]) => {
    const id = cableRunIdMap.get(oldId);
    if (id) cableRunBreakouts[id] = {
      from: breakout.from ? { x: breakout.from.x + offset.x, y: breakout.from.y + offset.y } : undefined,
      to: breakout.to ? { x: breakout.to.x + offset.x, y: breakout.to.y + offset.y } : undefined,
    };
  });
  const cableRunLabelOffsets = { ...harness.drawing.cableRunLabelOffsets };
  Object.entries(copied.cableRunLabelOffsets).forEach(([oldId, labelOffset]) => {
    const id = cableRunIdMap.get(oldId);
    if (id) cableRunLabelOffsets[id] = { ...labelOffset };
  });
  const cableHeatShrinks = [
    ...(harness.drawing.cableHeatShrinks ?? []),
    ...copied.cableHeatShrinks.flatMap((heatShrink) => {
      const cableRunId = cableRunIdMap.get(heatShrink.cableRunId);
      return cableRunId ? [{ ...heatShrink, id: createId("heat-shrink"), cableRunId }] : [];
    }),
  ];

  return {
    componentIds: components.map((component) => component.id),
    connectionIds: connections.map((connection) => connection.id),
    cableRunIds: cableRuns.map((cableRun) => cableRun.id),
    project: updateHarness(project, harnessId, (current) => ({
      ...current,
      components: [...current.components, ...components],
      connections: [...current.connections, ...connections],
      cableRuns: [...current.cableRuns, ...cableRuns],
      drawing: {
        ...current.drawing,
        componentPlacements,
        connectionRoutes,
        cableRunRoutes,
        cableRunBreakouts,
        cableRunLabelOffsets,
        cableHeatShrinks,
      },
    })),
  };
}

function cloneConnection(connection: Connection2D): Connection2D {
  return {
    ...connection,
    from: { ...connection.from },
    to: { ...connection.to },
    part: connection.part ? { ...connection.part, source: { ...connection.part.source } } : undefined,
  };
}

function cloneCableRun(cableRun: CableRun2D): CableRun2D {
  return {
    ...cableRun,
    cores: cableRun.cores.map((core) => ({ ...core })),
    source: { ...cableRun.source },
  };
}

function cloneAnnotation(annotation: DrawingAnnotation2D): DrawingAnnotation2D {
  return { ...annotation, position: { ...annotation.position } };
}

function clonePartDrawing(drawing: PartDrawing2D): PartDrawing2D {
  return {
    ...drawing,
    paths: drawing.paths.map((path) => ({ ...path, points: path.points.map((point) => ({ ...point })) })),
    unsupportedEntities: drawing.unsupportedEntities.map((item) => ({ ...item })),
  };
}

function cloneLabelPlacement(placement?: ConnectorLabelPlacement2D) {
  return placement ? {
    ...placement,
    offset: placement.offset ? { ...placement.offset } : undefined,
  } : undefined;
}

function nextHarnessPartNumber(harnesses: Harness2D[]) {
  const used = new Set(harnesses.map((harness) => harness.partNumber));
  let index = 1;
  while (used.has(`HNS-${String(index).padStart(3, "0")}`)) index += 1;
  return `HNS-${String(index).padStart(3, "0")}`;
}

export function moveComponent(
  project: Project2D,
  harnessId: string,
  componentId: string,
  position: Point2D,
) {
  return updateHarness(project, harnessId, (harness) => {
    const placement = harness.drawing.componentPlacements[componentId];
    if (!placement) return harness;
    return {
      ...harness,
      drawing: {
        ...harness.drawing,
        componentPlacements: {
          ...harness.drawing.componentPlacements,
          [componentId]: { ...placement, position },
        },
      },
    };
  });
}

export function moveItems(
  project: Project2D,
  harnessId: string,
  componentIds: Set<string>,
  connectionIds: Set<string>,
  cableRunIds: Set<string>,
  delta: Point2D,
) {
  return updateHarness(project, harnessId, (harness) => {
    const componentPlacements = { ...harness.drawing.componentPlacements };
    componentIds.forEach((componentId) => {
      const placement = componentPlacements[componentId];
      if (placement) componentPlacements[componentId] = {
        ...placement,
        position: { x: placement.position.x + delta.x, y: placement.position.y + delta.y },
      };
    });
    const connectionRoutes = { ...harness.drawing.connectionRoutes };
    connectionIds.forEach((connectionId) => {
      const route = connectionRoutes[connectionId];
      if (route) connectionRoutes[connectionId] = {
        point: { x: route.point.x + delta.x, y: route.point.y + delta.y },
      };
    });
    const cableRunRoutes = { ...harness.drawing.cableRunRoutes };
    const cableRunBreakouts = { ...harness.drawing.cableRunBreakouts };
    cableRunIds.forEach((cableRunId) => {
      const route = cableRunRoutes[cableRunId];
      if (route) cableRunRoutes[cableRunId] = {
        point: { x: route.point.x + delta.x, y: route.point.y + delta.y },
      };
      const breakout = cableRunBreakouts[cableRunId];
      if (breakout) cableRunBreakouts[cableRunId] = {
        from: breakout.from ? { x: breakout.from.x + delta.x, y: breakout.from.y + delta.y } : undefined,
        to: breakout.to ? { x: breakout.to.x + delta.x, y: breakout.to.y + delta.y } : undefined,
      };
    });
    return {
      ...harness,
      drawing: { ...harness.drawing, componentPlacements, connectionRoutes, cableRunRoutes, cableRunBreakouts },
    };
  });
}

export function connectPins(
  project: Project2D,
  harnessId: string,
  from: PinEndpoint2D,
  to: PinEndpoint2D,
): { project: Project2D; connectionId: string } {
  const harness = project.harnesses.find((item) => item.id === harnessId);
  if (!harness) throw new Error("하네스를 찾을 수 없습니다.");
  assertEndpoint(harness, from);
  assertEndpoint(harness, to);
  if (from.componentId === to.componentId && from.pinId === to.pinId) {
    throw new Error("같은 핀끼리는 연결할 수 없습니다.");
  }
  const duplicate = harness.connections.some((connection) => {
    const forward = sameEndpoint(connection.from, from) && sameEndpoint(connection.to, to);
    const reverse = sameEndpoint(connection.from, to) && sameEndpoint(connection.to, from);
    return forward || reverse;
  });
  if (duplicate) throw new Error("이미 존재하는 핀 연결입니다.");

  const connectionId = createId("wire");
  const reference = nextReference("W", harness.connections.map((item) => item.reference));
  const connection: Connection2D = {
    id: connectionId,
    kind: "wire",
    reference,
    from,
    to,
    color: "BK",
    gauge: "20 AWG",
    lengthMm: 100,
    notes: "",
  };
  return {
    connectionId,
    project: updateHarness(project, harnessId, (current) => ({
      ...current,
      connections: [...current.connections, connection],
    })),
  };
}

export type WireRunDraft2D = {
  part: {
    name: string;
    partNumber: string;
    manufacturer: string;
    outerDiameterMm: number | null;
    color: string;
    gauge: string;
    source: PartSource2D;
  };
  from: PinEndpoint2D;
  to: PinEndpoint2D;
  lengthMm: number;
};

export function addWireRun(project: Project2D, harnessId: string, draft: WireRunDraft2D) {
  const harness = project.harnesses.find((item) => item.id === harnessId);
  if (!harness) throw new Error("하네스를 찾을 수 없습니다.");
  assertEndpoint(harness, draft.from);
  assertEndpoint(harness, draft.to);
  if (sameEndpoint(draft.from, draft.to)) throw new Error("같은 핀끼리는 연결할 수 없습니다.");
  if (!Number.isFinite(draft.lengthMm) || draft.lengthMm <= 0) throw new Error("전선 길이는 0보다 커야 합니다.");

  const connection: Connection2D = {
    id: createId("wire"),
    kind: "wire",
    reference: nextReference("W", harness.connections.filter((item) => item.kind === "wire").map((item) => item.reference)),
    from: { ...draft.from },
    to: { ...draft.to },
    color: draft.part.color,
    gauge: draft.part.gauge,
    lengthMm: draft.lengthMm,
    notes: "",
    part: {
      name: draft.part.name,
      partNumber: draft.part.partNumber,
      manufacturer: draft.part.manufacturer,
      outerDiameterMm: draft.part.outerDiameterMm,
      source: { ...draft.part.source },
    },
  };
  return {
    connectionId: connection.id,
    project: updateHarness(project, harnessId, (current) => ({ ...current, connections: [...current.connections, connection] })),
  };
}

export type CableCoreMapping2D = {
  coreIndex: number;
  from: PinEndpoint2D;
  to: PinEndpoint2D;
};

export type CableRunDraft2D = {
  part: {
    name: string;
    partNumber: string;
    manufacturer: string;
    outerDiameterMm: number;
    cores: CableCoreSnapshot2D[];
    source: PartSource2D;
  };
  lengthMm: number;
  mappings: CableCoreMapping2D[];
};

export function addCableRun(project: Project2D, harnessId: string, draft: CableRunDraft2D) {
  const harness = project.harnesses.find((item) => item.id === harnessId);
  if (!harness) throw new Error("하네스를 찾을 수 없습니다.");
  if (!Number.isFinite(draft.lengthMm) || draft.lengthMm <= 0) throw new Error("케이블 길이는 0보다 커야 합니다.");
  if (!Number.isFinite(draft.part.outerDiameterMm) || draft.part.outerDiameterMm <= 0) throw new Error("케이블 외경은 0보다 커야 합니다.");
  if (draft.mappings.length === 0) throw new Error("사용할 코어를 한 개 이상 매핑하세요.");
  const mappedCoreIndexes = new Set<number>();
  for (const mapping of draft.mappings) {
    if (!draft.part.cores[mapping.coreIndex]) throw new Error("케이블 코어를 찾을 수 없습니다.");
    if (mappedCoreIndexes.has(mapping.coreIndex)) throw new Error("같은 코어를 두 번 매핑할 수 없습니다.");
    mappedCoreIndexes.add(mapping.coreIndex);
    assertEndpoint(harness, mapping.from);
    assertEndpoint(harness, mapping.to);
    if (sameEndpoint(mapping.from, mapping.to)) throw new Error("같은 핀끼리는 연결할 수 없습니다.");
  }

  const reference = nextCableReference(harness.cableRuns.map((item) => item.reference));
  const cableRun: CableRun2D = {
    id: createId("cable-run"),
    reference,
    name: draft.part.name,
    partNumber: draft.part.partNumber,
    manufacturer: draft.part.manufacturer,
    lengthMm: draft.lengthMm,
    outerDiameterMm: draft.part.outerDiameterMm,
    cores: draft.part.cores.map((core) => ({ ...core })),
    source: { ...draft.part.source },
  };
  const connections = draft.mappings.map((mapping) => {
    const core = draft.part.cores[mapping.coreIndex];
    return {
      id: createId("cable-core"),
      kind: "cableCore" as const,
      reference: `${reference}:${mapping.coreIndex + 1}`,
      from: { ...mapping.from },
      to: { ...mapping.to },
      color: core.color,
      gauge: core.gauge,
      lengthMm: draft.lengthMm,
      notes: "",
      cableRunId: cableRun.id,
      cableCoreIndex: mapping.coreIndex,
    };
  });

  return {
    cableRunId: cableRun.id,
    project: updateHarness(project, harnessId, (current) => ({
      ...current,
      cableRuns: [...current.cableRuns, cableRun],
      connections: [...current.connections, ...connections],
    })),
  };
}

export function deleteItems(
  project: Project2D,
  harnessId: string,
  componentIds: Set<string>,
  connectionIds: Set<string>,
  cableRunIds = new Set<string>(),
) {
  return updateHarness(project, harnessId, (harness) => {
    const placements = { ...harness.drawing.componentPlacements };
    componentIds.forEach((id) => delete placements[id]);
    const connections = harness.connections.filter((connection) => (
      !connectionIds.has(connection.id)
      && !cableRunIds.has(connection.cableRunId ?? "")
      && !componentIds.has(connection.from.componentId)
      && !componentIds.has(connection.to.componentId)
    ));
    const retainedCableRunIds = new Set(connections.flatMap((connection) => connection.cableRunId ? [connection.cableRunId] : []));
    const retainedConnectionIds = new Set(connections.map((connection) => connection.id));
    return {
      ...harness,
      components: harness.components.filter((component) => !componentIds.has(component.id)),
      connections,
      cableRuns: harness.cableRuns.filter((cableRun) => retainedCableRunIds.has(cableRun.id)),
      drawing: {
        ...harness.drawing,
        componentPlacements: placements,
        connectionRoutes: Object.fromEntries(Object.entries(harness.drawing.connectionRoutes ?? {}).filter(([id]) => retainedConnectionIds.has(id))),
        cableRunRoutes: Object.fromEntries(Object.entries(harness.drawing.cableRunRoutes ?? {}).filter(([id]) => retainedCableRunIds.has(id))),
        cableRunBreakouts: Object.fromEntries(Object.entries(harness.drawing.cableRunBreakouts ?? {}).filter(([id]) => retainedCableRunIds.has(id))),
        cableRunLabelOffsets: Object.fromEntries(Object.entries(harness.drawing.cableRunLabelOffsets ?? {}).filter(([id]) => retainedCableRunIds.has(id))),
        cableHeatShrinks: (harness.drawing.cableHeatShrinks ?? []).filter((heatShrink) => retainedCableRunIds.has(heatShrink.cableRunId)),
      },
    };
  });
}

export function setConnectionRoute(
  project: Project2D,
  harnessId: string,
  connectionId: string,
  point: Point2D,
) {
  return updateHarness(project, harnessId, (harness) => {
    if (!harness.connections.some((connection) => connection.id === connectionId)) return harness;
    return {
      ...harness,
      drawing: {
        ...harness.drawing,
        connectionRoutes: { ...harness.drawing.connectionRoutes, [connectionId]: { point } },
      },
    };
  });
}

export function setCableRunRoute(
  project: Project2D,
  harnessId: string,
  cableRunId: string,
  point: Point2D,
) {
  return updateHarness(project, harnessId, (harness) => {
    if (!harness.cableRuns.some((cableRun) => cableRun.id === cableRunId)) return harness;
    return {
      ...harness,
      drawing: {
        ...harness.drawing,
        cableRunRoutes: { ...harness.drawing.cableRunRoutes, [cableRunId]: { point } },
      },
    };
  });
}

export function setCableRunBreakout(
  project: Project2D,
  harnessId: string,
  cableRunId: string,
  end: keyof CableRunBreakout2D,
  point: Point2D,
) {
  return updateHarness(project, harnessId, (harness) => {
    if (!harness.cableRuns.some((cableRun) => cableRun.id === cableRunId)) return harness;
    const current = harness.drawing.cableRunBreakouts?.[cableRunId] ?? {};
    return {
      ...harness,
      drawing: {
        ...harness.drawing,
        cableRunBreakouts: {
          ...harness.drawing.cableRunBreakouts,
          [cableRunId]: { ...current, [end]: { ...point } },
        },
      },
    };
  });
}

export function setCableRunLabelOffset(
  project: Project2D,
  harnessId: string,
  cableRunId: string,
  offset: Point2D,
) {
  return updateHarness(project, harnessId, (harness) => {
    if (!harness.cableRuns.some((cableRun) => cableRun.id === cableRunId)) return harness;
    return {
      ...harness,
      drawing: {
        ...harness.drawing,
        cableRunLabelOffsets: { ...harness.drawing.cableRunLabelOffsets, [cableRunId]: { ...offset } },
      },
    };
  });
}

export function updateComponent(
  project: Project2D,
  harnessId: string,
  componentId: string,
  changes: Partial<Pick<Connector2D, "reference" | "name" | "partNumber" | "manufacturer">>,
) {
  return updateHarness(project, harnessId, (harness) => ({
    ...harness,
    components: harness.components.map((component) => (
      component.id === componentId ? { ...component, ...changes } : component
    )),
  }));
}

export function updatePin(
  project: Project2D,
  harnessId: string,
  componentId: string,
  pinId: string,
  changes: Partial<Pick<Pin2D, "number" | "name">>,
) {
  return updateHarness(project, harnessId, (harness) => ({
    ...harness,
    components: harness.components.map((component) => component.id === componentId ? {
      ...component,
      pins: component.pins.map((pin) => pin.id === pinId ? { ...pin, ...changes } : pin),
    } : component),
  }));
}

export function setComponentPinSide(
  project: Project2D,
  harnessId: string,
  componentId: string,
  pinSide: ComponentPlacement2D["pinSide"],
) {
  return updateHarness(project, harnessId, (harness) => {
    const placement = harness.drawing.componentPlacements[componentId];
    if (!placement) return harness;
    return {
      ...harness,
      drawing: {
        ...harness.drawing,
        componentPlacements: {
          ...harness.drawing.componentPlacements,
          [componentId]: { ...placement, pinSide },
        },
      },
    };
  });
}

export function setComponentRotation(
  project: Project2D,
  harnessId: string,
  componentId: string,
  rotation: ComponentRotation2D,
) {
  return updateHarness(project, harnessId, (harness) => {
    const placement = harness.drawing.componentPlacements[componentId];
    if (!placement) return harness;
    return {
      ...harness,
      drawing: {
        ...harness.drawing,
        componentPlacements: {
          ...harness.drawing.componentPlacements,
          [componentId]: { ...placement, rotation },
        },
      },
    };
  });
}

export function setComponentDisplayScale(
  project: Project2D,
  harnessId: string,
  componentId: string,
  displayScale: number,
) {
  return updateHarness(project, harnessId, (harness) => {
    const placement = harness.drawing.componentPlacements[componentId];
    if (!placement || !Number.isFinite(displayScale)) return harness;
    return {
      ...harness,
      drawing: {
        ...harness.drawing,
        componentPlacements: {
          ...harness.drawing.componentPlacements,
          [componentId]: { ...placement, displayScale: Math.min(5, Math.max(0.2, displayScale)) },
        },
      },
    };
  });
}

export function setComponentLabelPlacement(
  project: Project2D,
  harnessId: string,
  componentId: string,
  label: "referenceLabel" | "nameLabel",
  changes: ConnectorLabelPlacement2D,
) {
  return updateHarness(project, harnessId, (harness) => {
    const placement = harness.drawing.componentPlacements[componentId];
    if (!placement) return harness;
    return {
      ...harness,
      drawing: {
        ...harness.drawing,
        componentPlacements: {
          ...harness.drawing.componentPlacements,
          [componentId]: {
            ...placement,
            [label]: { ...placement[label], ...changes },
          },
        },
      },
    };
  });
}

export function setComponentPinMapOffset(
  project: Project2D,
  harnessId: string,
  componentId: string,
  offset: Point2D,
) {
  return updateHarness(project, harnessId, (harness) => {
    const placement = harness.drawing.componentPlacements[componentId];
    if (!placement) return harness;
    return {
      ...harness,
      drawing: {
        ...harness.drawing,
        componentPlacements: {
          ...harness.drawing.componentPlacements,
          [componentId]: { ...placement, pinMapOffset: { ...offset } },
        },
      },
    };
  });
}

export function updateConnection(
  project: Project2D,
  harnessId: string,
  connectionId: string,
  changes: Partial<Pick<Connection2D, "reference" | "color" | "gauge" | "lengthMm" | "notes">>,
) {
  return updateHarness(project, harnessId, (harness) => ({
    ...harness,
    connections: harness.connections.map((connection) => (
      connection.id === connectionId ? { ...connection, ...changes } : connection
    )),
  }));
}

export function updateCableRun(
  project: Project2D,
  harnessId: string,
  cableRunId: string,
  changes: Partial<Pick<CableRun2D, "reference" | "lengthMm">>,
) {
  return updateHarness(project, harnessId, (harness) => {
    const current = harness.cableRuns.find((item) => item.id === cableRunId);
    if (!current) return harness;
    const reference = changes.reference ?? current.reference;
    return {
      ...harness,
      cableRuns: harness.cableRuns.map((item) => item.id === cableRunId ? { ...item, ...changes } : item),
      connections: harness.connections.map((connection) => connection.cableRunId === cableRunId ? {
        ...connection,
        reference: `${reference}:${(connection.cableCoreIndex ?? 0) + 1}`,
        lengthMm: changes.lengthMm ?? connection.lengthMm,
      } : connection),
    };
  });
}

export function addCableHeatShrink(
  project: Project2D,
  harnessId: string,
  cableRunId: string,
): { project: Project2D; heatShrinkId: string } {
  const harness = project.harnesses.find((item) => item.id === harnessId);
  if (!harness?.cableRuns.some((cableRun) => cableRun.id === cableRunId)) {
    throw new Error("수축튜브를 추가할 케이블을 찾을 수 없습니다.");
  }
  const heatShrinkId = createId("heat-shrink");
  const reference = nextHeatShrinkReference((harness.drawing.cableHeatShrinks ?? []).map((item) => item.reference));
  return {
    heatShrinkId,
    project: updateHarness(project, harnessId, (current) => ({
      ...current,
      drawing: {
        ...current.drawing,
        cableHeatShrinks: [...(current.drawing.cableHeatShrinks ?? []), {
          id: heatShrinkId,
          cableRunId,
          reference,
          text: reference,
          startRatio: 0.4,
          endRatio: 0.6,
          color: "#202a32",
          textColor: "#ffffff",
        }],
      },
    })),
  };
}

export function updateCableHeatShrink(
  project: Project2D,
  harnessId: string,
  heatShrinkId: string,
  changes: Partial<Pick<CableHeatShrink2D, "reference" | "text" | "startRatio" | "endRatio" | "color" | "textColor">>,
) {
  return updateHarness(project, harnessId, (harness) => ({
    ...harness,
    drawing: {
      ...harness.drawing,
      cableHeatShrinks: (harness.drawing.cableHeatShrinks ?? []).map((heatShrink) => heatShrink.id === heatShrinkId ? {
        ...heatShrink,
        ...changes,
        startRatio: clampRatio(changes.startRatio ?? heatShrink.startRatio),
        endRatio: clampRatio(changes.endRatio ?? heatShrink.endRatio),
      } : heatShrink),
    },
  }));
}

export function deleteCableHeatShrink(project: Project2D, harnessId: string, heatShrinkId: string) {
  return updateHarness(project, harnessId, (harness) => ({
    ...harness,
    drawing: {
      ...harness.drawing,
      cableHeatShrinks: (harness.drawing.cableHeatShrinks ?? []).filter((heatShrink) => heatShrink.id !== heatShrinkId),
    },
  }));
}

export function updateProjectMetadata(
  project: Project2D,
  changes: Partial<Pick<Project2D, "projectNumber" | "name">>,
) {
  return touch({ ...project, ...changes });
}

export function updateHarnessMetadata(
  project: Project2D,
  harnessId: string,
  changes: Partial<Pick<Harness2D, "partNumber" | "name" | "revision">>,
) {
  return updateHarness(project, harnessId, (harness) => ({ ...harness, ...changes }));
}

export function updateDrawingTitleBlock(
  project: Project2D,
  harnessId: string,
  changes: Partial<DrawingTitleBlock2D>,
) {
  return updateHarness(project, harnessId, (harness) => ({
    ...harness,
    drawing: {
      ...harness.drawing,
      titleBlock: {
        drawingTitle: harness.drawing.titleBlock?.drawingTitle ?? "HARNESS ASSEMBLY DRAWING",
        createdDate: harness.drawing.titleBlock?.createdDate ?? "",
        createdBy: harness.drawing.titleBlock?.createdBy ?? "",
        reviewedBy: harness.drawing.titleBlock?.reviewedBy ?? "",
        approvedBy: harness.drawing.titleBlock?.approvedBy ?? "",
        ...changes,
      },
    },
  }));
}

export function addDrawingAnnotation(
  project: Project2D,
  harnessId: string,
  draft: DrawingAnnotationDraft2D,
): { project: Project2D; annotationId: string } {
  const annotationId = createId("annotation");
  const defaults = annotationDefaults(draft.kind);
  const annotation: DrawingAnnotation2D = {
    ...defaults,
    ...draft,
    id: annotationId,
    position: { ...draft.position },
    width: Math.max(10, draft.width ?? defaults.width),
    height: Math.max(10, draft.height ?? defaults.height),
  };
  return {
    annotationId,
    project: updateHarness(project, harnessId, (harness) => ({
      ...harness,
      drawing: { ...harness.drawing, annotations: [...(harness.drawing.annotations ?? []), annotation] },
    })),
  };
}

export function updateDrawingAnnotation(
  project: Project2D,
  harnessId: string,
  annotationId: string,
  changes: Partial<Omit<DrawingAnnotation2D, "id" | "kind">>,
) {
  return updateHarness(project, harnessId, (harness) => ({
    ...harness,
    drawing: {
      ...harness.drawing,
      annotations: (harness.drawing.annotations ?? []).map((annotation) => annotation.id === annotationId ? {
        ...annotation,
        ...changes,
        position: changes.position ? { ...changes.position } : annotation.position,
        width: Math.max(10, changes.width ?? annotation.width),
        height: Math.max(10, changes.height ?? annotation.height),
      } : annotation),
    },
  }));
}

export function deleteDrawingAnnotation(project: Project2D, harnessId: string, annotationId: string) {
  return updateHarness(project, harnessId, (harness) => ({
    ...harness,
    drawing: {
      ...harness.drawing,
      annotations: (harness.drawing.annotations ?? []).filter((annotation) => annotation.id !== annotationId),
    },
  }));
}

function annotationDefaults(kind: DrawingAnnotationKind2D): Omit<DrawingAnnotation2D, "id" | "kind" | "position"> {
  const common = { fontSize: 12, textColor: "#173f59", strokeColor: "#0e6f9f" };
  if (kind === "label") return { ...common, width: 120, height: 30, text: "LABEL", fillColor: "#d9ebf5" };
  if (kind === "text") return { ...common, width: 160, height: 28, text: "TEXT", fillColor: "#ffffff" };
  if (kind === "image") return { ...common, width: 160, height: 100, text: "", fillColor: "#ffffff" };
  return { ...common, width: 100, height: 60, text: "", fillColor: "#ffffff" };
}

function assertEndpoint(harness: Harness2D, endpoint: PinEndpoint2D) {
  const component = harness.components.find((item) => item.id === endpoint.componentId);
  if (!component?.pins.some((pin) => pin.id === endpoint.pinId)) {
    throw new Error("연결할 핀을 찾을 수 없습니다.");
  }
}

function sameEndpoint(left: PinEndpoint2D, right: PinEndpoint2D) {
  return left.componentId === right.componentId && left.pinId === right.pinId;
}

function nextCableReference(references: string[]) {
  const used = new Set(references);
  let index = 1;
  while (used.has(`CBL-${String(index).padStart(3, "0")}`)) index += 1;
  return `CBL-${String(index).padStart(3, "0")}`;
}

function nextHeatShrinkReference(references: string[]) {
  const used = new Set(references);
  let index = 1;
  while (used.has(`HS-${String(index).padStart(3, "0")}`)) index += 1;
  return `HS-${String(index).padStart(3, "0")}`;
}

function clampRatio(value: number) {
  return Math.min(1, Math.max(0, value));
}

function updateHarness(project: Project2D, harnessId: string, update: (harness: Harness2D) => Harness2D) {
  return touch({
    ...project,
    harnesses: project.harnesses.map((harness) => harness.id === harnessId ? update(harness) : harness),
  });
}

function touch(project: Project2D): Project2D {
  return { ...project, updatedAt: now() };
}
