import type { ComponentPlacement2D, Connector2D, Harness2D, PinEndpoint2D, Point2D } from "./model";

export const CONNECTOR_WIDTH = 220;
export const CONNECTOR_HEADER_HEIGHT = 27;
export const CONNECTOR_INFO_HEIGHT = 40;
export const PIN_ROW_HEIGHT = 22;
export const PART_DRAWING_SCALE = 5;

export function connectorSize(connector: Connector2D, placement?: ComponentPlacement2D) {
  const scale = placement?.displayScale ?? 1;
  if (connector.drawing) {
    return {
      width: connector.drawing.widthMm * PART_DRAWING_SCALE * scale,
      height: connector.drawing.heightMm * PART_DRAWING_SCALE * scale,
    };
  }
  return {
    width: CONNECTOR_WIDTH * scale,
    height: (CONNECTOR_HEADER_HEIGHT + CONNECTOR_INFO_HEIGHT + connector.pins.length * PIN_ROW_HEIGHT) * scale,
  };
}

export function connectorHeight(connector: Connector2D, placement?: ComponentPlacement2D) {
  return connectorSize(connector, placement).height;
}

export function connectorBounds(connector: Connector2D, placement: ComponentPlacement2D) {
  const size = connectorSize(connector, placement);
  const rotation = placement.rotation ?? 0;
  const width = rotation === 90 || rotation === 270 ? size.height : size.width;
  const height = rotation === 90 || rotation === 270 ? size.width : size.height;
  return {
    x: placement.position.x + (size.width - width) / 2,
    y: placement.position.y + (size.height - height) / 2,
    width,
    height,
  };
}

export function pinPosition(
  connector: Connector2D,
  placement: ComponentPlacement2D,
  pinId: string,
): Point2D {
  const pinIndex = connector.pins.findIndex((pin) => pin.id === pinId);
  if (pinIndex < 0) throw new Error("핀 위치를 계산할 수 없습니다.");
  const pin = connector.pins[pinIndex];
  let local: Point2D;
  if (connector.drawing && pin.anchor) {
    const scale = placement.displayScale ?? 1;
    const width = connector.drawing.widthMm * PART_DRAWING_SCALE * scale;
    const sourceX = pin.anchor.xMm * PART_DRAWING_SCALE * scale;
    local = {
      x: placement.pinSide === "left" ? width - sourceX : sourceX,
      y: pin.anchor.yMm * PART_DRAWING_SCALE * scale,
    };
  } else {
    const scale = placement.displayScale ?? 1;
    local = {
      x: placement.pinSide === "right" ? CONNECTOR_WIDTH * scale : 0,
      y: (CONNECTOR_HEADER_HEIGHT + CONNECTOR_INFO_HEIGHT + (pinIndex + 0.5) * PIN_ROW_HEIGHT) * scale,
    };
  }
  const size = connectorSize(connector, placement);
  const rotated = rotatePoint(local, { x: size.width / 2, y: size.height / 2 }, placement.rotation ?? 0);
  return {
    x: placement.position.x + rotated.x,
    y: placement.position.y + rotated.y,
  };
}

function rotatePoint(point: Point2D, center: Point2D, angle: number): Point2D {
  if (angle === 0) return point;
  const radians = angle * Math.PI / 180;
  const x = point.x - center.x;
  const y = point.y - center.y;
  return {
    x: center.x + x * Math.cos(radians) - y * Math.sin(radians),
    y: center.y + x * Math.sin(radians) + y * Math.cos(radians),
  };
}

export function endpointPosition(harness: Harness2D, endpoint: PinEndpoint2D): Point2D {
  if (endpoint.freeEnd) return { ...endpoint.freeEnd.position };
  const connector = harness.components.find((component) => component.id === endpoint.componentId);
  const placement = harness.drawing.componentPlacements[endpoint.componentId];
  if (!connector || !placement) throw new Error("연결점 위치를 계산할 수 없습니다.");
  return pinPosition(connector, placement, endpoint.pinId);
}

export function orthogonalPath(from: Point2D, to: Point2D) {
  const direction = to.x >= from.x ? 1 : -1;
  const lead = Math.min(48, Math.max(20, Math.abs(to.x - from.x) / 4));
  const firstX = from.x + lead * direction;
  const lastX = to.x - lead * direction;
  const middleX = (firstX + lastX) / 2;
  return `M ${from.x} ${from.y} L ${firstX} ${from.y} C ${middleX} ${from.y}, ${middleX} ${to.y}, ${lastX} ${to.y} L ${to.x} ${to.y}`;
}

export function defaultRoutePoint(from: Point2D, to: Point2D): Point2D {
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
}

export function routedPath(from: Point2D, to: Point2D, point?: Point2D) {
  if (!point) return orthogonalPath(from, to);
  const control = {
    x: point.x * 2 - (from.x + to.x) / 2,
    y: point.y * 2 - (from.y + to.y) / 2,
  };
  return `M ${from.x} ${from.y} Q ${control.x} ${control.y} ${to.x} ${to.y}`;
}

export function sampleRoutedPath(from: Point2D, to: Point2D, point?: Point2D, steps = 80): Point2D[] {
  if (point) {
    const control = {
      x: point.x * 2 - (from.x + to.x) / 2,
      y: point.y * 2 - (from.y + to.y) / 2,
    };
    return Array.from({ length: steps + 1 }, (_, index) => {
      const ratio = index / steps;
      const inverse = 1 - ratio;
      return {
        x: inverse * inverse * from.x + 2 * inverse * ratio * control.x + ratio * ratio * to.x,
        y: inverse * inverse * from.y + 2 * inverse * ratio * control.y + ratio * ratio * to.y,
      };
    });
  }

  const direction = to.x >= from.x ? 1 : -1;
  const lead = Math.min(48, Math.max(20, Math.abs(to.x - from.x) / 4));
  const first = { x: from.x + lead * direction, y: from.y };
  const last = { x: to.x - lead * direction, y: to.y };
  const middleX = (first.x + last.x) / 2;
  const points: Point2D[] = [from, first];
  for (let index = 1; index <= steps; index += 1) {
    const ratio = index / steps;
    const inverse = 1 - ratio;
    points.push({
      x: inverse ** 3 * first.x + 3 * inverse ** 2 * ratio * middleX + 3 * inverse * ratio ** 2 * middleX + ratio ** 3 * last.x,
      y: inverse ** 3 * first.y + 3 * inverse ** 2 * ratio * first.y + 3 * inverse * ratio ** 2 * last.y + ratio ** 3 * last.y,
    });
  }
  points.push(to);
  return points;
}

export function routedPointAtRatio(points: Point2D[], ratio: number): Point2D {
  const lengths = routeLengths(points);
  const target = lengths.total * Math.min(1, Math.max(0, ratio));
  for (let index = 1; index < points.length; index += 1) {
    if (lengths.cumulative[index] < target) continue;
    const segmentStart = lengths.cumulative[index - 1];
    const segmentLength = lengths.cumulative[index] - segmentStart;
    const local = segmentLength === 0 ? 0 : (target - segmentStart) / segmentLength;
    return {
      x: points[index - 1].x + (points[index].x - points[index - 1].x) * local,
      y: points[index - 1].y + (points[index].y - points[index - 1].y) * local,
    };
  }
  return points.at(-1) ?? { x: 0, y: 0 };
}

export function routedRatioAtPoint(points: Point2D[], point: Point2D): number {
  const lengths = routeLengths(points);
  let nearest = { distance: Number.POSITIVE_INFINITY, length: 0 };
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const squared = dx * dx + dy * dy;
    const local = squared === 0 ? 0 : Math.min(1, Math.max(0, ((point.x - from.x) * dx + (point.y - from.y) * dy) / squared));
    const projected = { x: from.x + dx * local, y: from.y + dy * local };
    const distance = Math.hypot(point.x - projected.x, point.y - projected.y);
    if (distance < nearest.distance) nearest = {
      distance,
      length: lengths.cumulative[index - 1] + Math.sqrt(squared) * local,
    };
  }
  return lengths.total === 0 ? 0 : nearest.length / lengths.total;
}

export function routedSlicePath(points: Point2D[], startRatio: number, endRatio: number): string {
  const start = Math.min(startRatio, endRatio);
  const end = Math.max(startRatio, endRatio);
  const slice = [routedPointAtRatio(points, start)];
  const lengths = routeLengths(points);
  points.forEach((point, index) => {
    const ratio = lengths.total === 0 ? 0 : lengths.cumulative[index] / lengths.total;
    if (ratio > start && ratio < end) slice.push(point);
  });
  slice.push(routedPointAtRatio(points, end));
  return slice.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function routeLengths(points: Point2D[]) {
  const cumulative = [0];
  for (let index = 1; index < points.length; index += 1) {
    cumulative.push(cumulative[index - 1] + Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y));
  }
  return { cumulative, total: cumulative.at(-1) ?? 0 };
}

export type CableRunGeometry2D = {
  fromJunction: Point2D;
  toJunction: Point2D;
  connections: Array<{
    connectionId: string;
    from: Point2D;
    to: Point2D;
  }>;
};

export function cableRunGeometry(harness: Harness2D, cableRunId: string): CableRunGeometry2D {
  const connections = harness.connections.filter((connection) => connection.cableRunId === cableRunId);
  if (connections.length === 0) throw new Error("케이블에 매핑된 코어가 없습니다.");
  const positioned = connections.map((connection) => ({
    connectionId: connection.id,
    from: endpointPosition(harness, connection.from),
    to: endpointPosition(harness, connection.to),
  }));
  const fromCenter = average(positioned.map((item) => item.from));
  const toCenter = average(positioned.map((item) => item.to));
  const direction = toCenter.x >= fromCenter.x ? 1 : -1;
  const lead = Math.min(90, Math.max(50, Math.abs(toCenter.x - fromCenter.x) / 4));
  const savedBreakout = harness.drawing.cableRunBreakouts?.[cableRunId];
  return {
    fromJunction: savedBreakout?.from
      ? { ...savedBreakout.from }
      : { x: fromCenter.x + lead * direction, y: fromCenter.y },
    toJunction: savedBreakout?.to
      ? { ...savedBreakout.to }
      : { x: toCenter.x - lead * direction, y: toCenter.y },
    connections: positioned,
  };
}

function average(points: Point2D[]): Point2D {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}
