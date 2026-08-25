import type { ComponentPlacement2D, Connector2D, Harness2D, PinEndpoint2D, Point2D } from "./model";

export const CONNECTOR_WIDTH = 220;
export const CONNECTOR_HEADER_HEIGHT = 27;
export const CONNECTOR_INFO_HEIGHT = 40;
export const PIN_ROW_HEIGHT = 22;
export const PART_DRAWING_SCALE = 5;

export function connectorSize(connector: Connector2D) {
  if (connector.drawing) {
    return {
      width: connector.drawing.widthMm * PART_DRAWING_SCALE,
      height: connector.drawing.heightMm * PART_DRAWING_SCALE,
    };
  }
  return { width: CONNECTOR_WIDTH, height: CONNECTOR_HEADER_HEIGHT + CONNECTOR_INFO_HEIGHT + connector.pins.length * PIN_ROW_HEIGHT };
}

export function connectorHeight(connector: Connector2D) {
  return connectorSize(connector).height;
}

export function connectorBounds(connector: Connector2D, placement: ComponentPlacement2D) {
  const size = connectorSize(connector);
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
    const width = connector.drawing.widthMm * PART_DRAWING_SCALE;
    const sourceX = pin.anchor.xMm * PART_DRAWING_SCALE;
    local = {
      x: placement.pinSide === "left" ? width - sourceX : sourceX,
      y: pin.anchor.yMm * PART_DRAWING_SCALE,
    };
  } else {
    local = {
      x: placement.pinSide === "right" ? CONNECTOR_WIDTH : 0,
      y: CONNECTOR_HEADER_HEIGHT + CONNECTOR_INFO_HEIGHT + (pinIndex + 0.5) * PIN_ROW_HEIGHT,
    };
  }
  const size = connectorSize(connector);
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
  return {
    fromJunction: { x: fromCenter.x + lead * direction, y: fromCenter.y },
    toJunction: { x: toCenter.x - lead * direction, y: toCenter.y },
    connections: positioned,
  };
}

function average(points: Point2D[]): Point2D {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}
