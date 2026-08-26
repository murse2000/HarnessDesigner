import DxfParser, { type IBlock, type IDxf, type IEntity, type IPoint } from "dxf-parser";
import type { PartDrawing2D, PartDrawingPath2D, Point2D } from "./model";

export type Rectangle2D = Point2D & { width: number; height: number };

export type ParsedDxf2D = {
  sourceName: string;
  bounds: Rectangle2D;
  paths: PartDrawingPath2D[];
  unsupported: Array<{ type: string; count: number }>;
};

type Matrix2D = [number, number, number, number, number, number];

type EntityWithGeometry = IEntity & Record<string, unknown>;

const IDENTITY: Matrix2D = [1, 0, 0, 1, 0, 0];

export function parseDxfDrawing(text: string, sourceName: string): ParsedDxf2D {
  const parsed = new DxfParser().parseSync(text);
  if (!parsed) throw new Error("DXF 파일을 해석할 수 없습니다.");

  const paths: PartDrawingPath2D[] = [];
  const unsupported = new Map<string, number>();
  visitEntities(parsed.entities, parsed, IDENTITY, paths, unsupported, new Set(), 0);
  if (paths.length === 0) throw new Error("표시할 수 있는 2D 형상이 DXF에 없습니다.");

  return {
    sourceName,
    paths,
    bounds: boundsOfPaths(paths),
    unsupported: [...unsupported.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((left, right) => right.count - left.count || left.type.localeCompare(right.type)),
  };
}

export function extractPartDrawing(
  parsed: ParsedDxf2D,
  selection: Rectangle2D,
  symbolScale: number,
): PartDrawing2D {
  if (!Number.isFinite(symbolScale) || symbolScale <= 0) {
    throw new Error("심벌 크기를 계산할 수 없습니다.");
  }
  const normalized = normalizeRectangle(selection);
  if (normalized.width <= 0 || normalized.height <= 0) throw new Error("추출할 도면 영역을 선택하세요.");
  const paths = parsed.paths
    .filter((path) => rectanglesIntersect(boundsOfPaths([path]), normalized))
    .map((path) => ({
      ...path,
      points: path.points.map((point) => ({
        x: (point.x - normalized.x) * symbolScale,
        y: (point.y - normalized.y) * symbolScale,
      })),
    }));
  if (paths.length === 0) throw new Error("선택 영역에 표시 가능한 도형이 없습니다.");
  return {
    sourceName: parsed.sourceName,
    widthMm: normalized.width * symbolScale,
    heightMm: normalized.height * symbolScale,
    paths,
    unsupportedEntities: parsed.unsupported,
  };
}

export function normalizeRectangle(rectangle: Rectangle2D): Rectangle2D {
  return {
    x: rectangle.width >= 0 ? rectangle.x : rectangle.x + rectangle.width,
    y: rectangle.height >= 0 ? rectangle.y : rectangle.y + rectangle.height,
    width: Math.abs(rectangle.width),
    height: Math.abs(rectangle.height),
  };
}

export function drawingPathData(path: PartDrawingPath2D) {
  if (path.points.length === 0) return "";
  const data = path.points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  return path.closed ? `${data} Z` : data;
}

export function partDrawingStrokeWidth(outlineStrength?: number) {
  const strength = Number.isFinite(outlineStrength) && outlineStrength! > 0 ? outlineStrength! : 1;
  return 1.15 * strength;
}

function visitEntities(
  entities: IEntity[],
  parsed: IDxf,
  matrix: Matrix2D,
  paths: PartDrawingPath2D[],
  unsupported: Map<string, number>,
  blockStack: Set<string>,
  depth: number,
) {
  if (depth > 12) throw new Error("DXF 블록 참조가 너무 깊습니다.");
  for (const baseEntity of entities) {
    const entity = baseEntity as EntityWithGeometry;
    if (entity.visible === false) continue;
    if (entity.type === "INSERT") {
      const name = String(entity.name ?? "");
      const block = parsed.blocks[name] as IBlock | undefined;
      if (!block?.entities || blockStack.has(name)) {
        countUnsupported(unsupported, block ? "INSERT_CYCLE" : "INSERT_MISSING_BLOCK");
        continue;
      }
      const position = point(entity.position);
      const blockPosition = point(block.position);
      const scaleX = finite(entity.xScale, 1);
      const scaleY = finite(entity.yScale, 1);
      const angle = finite(entity.rotation, 0) * Math.PI / 180;
      const insertMatrix = multiply(
        translation(position.x, position.y),
        multiply(rotation(angle), multiply(scale(scaleX, scaleY), translation(-blockPosition.x, -blockPosition.y))),
      );
      const nextStack = new Set(blockStack).add(name);
      visitEntities(block.entities, parsed, multiply(matrix, insertMatrix), paths, unsupported, nextStack, depth + 1);
      continue;
    }

    const path = entityToPath(entity, matrix, unsupported);
    if (path) paths.push(path);
  }
}

function entityToPath(entity: EntityWithGeometry, matrix: Matrix2D, unsupported: Map<string, number>): PartDrawingPath2D | null {
  switch (entity.type) {
    case "LINE":
      return makePath((entity.vertices as IPoint[] | undefined) ?? [], false, entity, matrix);
    case "LWPOLYLINE":
    case "POLYLINE": {
      const vertices = (entity.vertices as Array<IPoint & { bulge?: number }> | undefined) ?? [];
      const points = expandBulges(vertices, Boolean(entity.shape));
      return makePath(points, Boolean(entity.shape), entity, matrix);
    }
    case "CIRCLE": {
      const center = point(entity.center);
      const radius = finite(entity.radius, 0);
      return makePath(sampleEllipse(center, { x: radius, y: 0 }, 1, 0, Math.PI * 2, 64), true, entity, matrix);
    }
    case "ARC": {
      const center = point(entity.center);
      const radius = finite(entity.radius, 0);
      const start = finite(entity.startAngle, 0);
      let end = finite(entity.endAngle, Math.PI * 2);
      while (end <= start) end += Math.PI * 2;
      return makePath(sampleEllipse(center, { x: radius, y: 0 }, 1, start, end, 48), false, entity, matrix);
    }
    case "ELLIPSE": {
      const center = point(entity.center);
      const axis = point(entity.majorAxisEndPoint);
      const start = finite(entity.startAngle, 0);
      let end = finite(entity.endAngle, Math.PI * 2);
      while (end <= start) end += Math.PI * 2;
      const closed = Math.abs(end - start - Math.PI * 2) < 0.0001;
      return makePath(sampleEllipse(center, axis, finite(entity.axisRatio, 1), start, end, 64), closed, entity, matrix);
    }
    case "SPLINE": {
      const points = (entity.fitPoints as IPoint[] | undefined) ?? (entity.controlPoints as IPoint[] | undefined) ?? [];
      countUnsupported(unsupported, "SPLINE_APPROXIMATED");
      return makePath(points, Boolean(entity.closed), entity, matrix);
    }
    case "SOLID":
      return makePath((entity.points as IPoint[] | undefined) ?? [], true, entity, matrix);
    default:
      countUnsupported(unsupported, entity.type || "UNKNOWN");
      return null;
  }
}

function makePath(
  rawPoints: Array<Pick<IPoint, "x" | "y">>,
  closed: boolean,
  entity: EntityWithGeometry,
  matrix: Matrix2D,
): PartDrawingPath2D | null {
  if (rawPoints.length < 2) return null;
  return {
    points: rawPoints.map((rawPoint) => {
      const transformed = apply(matrix, point(rawPoint));
      return { x: transformed.x, y: -transformed.y };
    }),
    closed,
    layer: String(entity.layer ?? "0"),
    sourceType: entity.type,
  };
}

function expandBulges(vertices: Array<IPoint & { bulge?: number }>, closed: boolean): IPoint[] {
  if (vertices.length < 2) return vertices;
  const result: IPoint[] = [];
  const segmentCount = closed ? vertices.length : vertices.length - 1;
  for (let index = 0; index < segmentCount; index += 1) {
    const start = vertices[index];
    const end = vertices[(index + 1) % vertices.length];
    result.push(start);
    const bulge = start.bulge ?? 0;
    if (Math.abs(bulge) < 0.000001) continue;
    const chord = Math.hypot(end.x - start.x, end.y - start.y);
    const angle = 4 * Math.atan(bulge);
    const radius = chord / (2 * Math.sin(Math.abs(angle) / 2));
    const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const offset = Math.sqrt(Math.max(0, radius * radius - chord * chord / 4));
    const normal = { x: -(end.y - start.y) / chord, y: (end.x - start.x) / chord };
    const center = {
      x: middle.x + normal.x * offset * Math.sign(bulge),
      y: middle.y + normal.y * offset * Math.sign(bulge),
    };
    const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
    for (let step = 1; step < 12; step += 1) {
      const current = startAngle + angle * step / 12;
      result.push({ x: center.x + radius * Math.cos(current), y: center.y + radius * Math.sin(current), z: 0 });
    }
  }
  if (!closed) result.push(vertices.at(-1)!);
  return result;
}

function sampleEllipse(center: Point2D, majorAxis: Point2D, ratio: number, start: number, end: number, maximumSteps: number): IPoint[] {
  const majorLength = Math.hypot(majorAxis.x, majorAxis.y);
  const unitMajor = majorLength > 0 ? { x: majorAxis.x / majorLength, y: majorAxis.y / majorLength } : { x: 1, y: 0 };
  const unitMinor = { x: -unitMajor.y, y: unitMajor.x };
  const steps = Math.max(8, Math.ceil(maximumSteps * (end - start) / (Math.PI * 2)));
  return Array.from({ length: steps + 1 }, (_, index) => {
    const angle = start + (end - start) * index / steps;
    return {
      x: center.x + unitMajor.x * majorLength * Math.cos(angle) + unitMinor.x * majorLength * ratio * Math.sin(angle),
      y: center.y + unitMajor.y * majorLength * Math.cos(angle) + unitMinor.y * majorLength * ratio * Math.sin(angle),
      z: 0,
    };
  });
}

function boundsOfPaths(paths: PartDrawingPath2D[]): Rectangle2D {
  const points = paths.flatMap((path) => path.points);
  const minX = Math.min(...points.map((item) => item.x));
  const minY = Math.min(...points.map((item) => item.y));
  const maxX = Math.max(...points.map((item) => item.x));
  const maxY = Math.max(...points.map((item) => item.y));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function rectanglesIntersect(left: Rectangle2D, right: Rectangle2D) {
  return left.x <= right.x + right.width
    && left.x + left.width >= right.x
    && left.y <= right.y + right.height
    && left.y + left.height >= right.y;
}

function countUnsupported(counts: Map<string, number>, type: string) {
  counts.set(type, (counts.get(type) ?? 0) + 1);
}

function point(value: unknown): Point2D {
  const candidate = value as Partial<Point2D> | undefined;
  return { x: finite(candidate?.x, 0), y: finite(candidate?.y, 0) };
}

function finite(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function apply(matrix: Matrix2D, value: Point2D): Point2D {
  return {
    x: matrix[0] * value.x + matrix[2] * value.y + matrix[4],
    y: matrix[1] * value.x + matrix[3] * value.y + matrix[5],
  };
}

function multiply(left: Matrix2D, right: Matrix2D): Matrix2D {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}

const translation = (x: number, y: number): Matrix2D => [1, 0, 0, 1, x, y];
const scale = (x: number, y: number): Matrix2D => [x, 0, 0, y, 0, 0];
const rotation = (angle: number): Matrix2D => [Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0];
