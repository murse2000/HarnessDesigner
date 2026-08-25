import { describe, expect, it } from "vitest";
import { cableRunGeometry, CONNECTOR_HEADER_HEIGHT, CONNECTOR_INFO_HEIGHT, CONNECTOR_WIDTH, orthogonalPath, PIN_ROW_HEIGHT, pinPosition, routedPath } from "./geometry";
import type { Connector2D, Harness2D } from "./model";

const connector: Connector2D = {
  id: "J1",
  kind: "connector",
  reference: "J1",
  name: "4핀 커넥터",
  partNumber: "TEST-4",
  manufacturer: "Test",
  pins: [
    { id: "P1", number: "1", name: "PIN" },
    { id: "P2", number: "2", name: "PIN" },
  ],
};

describe("2D 도면 형상", () => {
  it("고밀도 도면용 커넥터 치수를 사용한다", () => {
    expect({ width: CONNECTOR_WIDTH, header: CONNECTOR_HEADER_HEIGHT, info: CONNECTOR_INFO_HEIGHT, pinRow: PIN_ROW_HEIGHT })
      .toEqual({ width: 220, header: 27, info: 40, pinRow: 22 });
  });

  it("핀 방향에 따라 커넥터 양쪽 접속점을 계산한다", () => {
    expect(pinPosition(connector, { position: { x: 100, y: 50 }, pinSide: "left" }, "P1").x).toBe(100);
    expect(pinPosition(connector, { position: { x: 100, y: 50 }, pinSide: "right" }, "P1").x).toBe(100 + CONNECTOR_WIDTH);
  });

  it("등록된 2D 심벌의 핀 앵커를 실제 연결점으로 사용한다", () => {
    const symbolConnector: Connector2D = {
      ...connector,
      drawing: {
        sourceName: "vendor.dxf", widthMm: 20, heightMm: 10, unsupportedEntities: [],
        paths: [{ points: [{ x: 0, y: 0 }, { x: 20, y: 10 }], closed: false, layer: "0", sourceType: "LINE" }],
      },
      pins: [{ ...connector.pins[0], anchor: { xMm: 18, yMm: 4, directionX: 1, directionY: 0 } }],
    };
    expect(pinPosition(symbolConnector, { position: { x: 100, y: 50 }, pinSide: "right" }, "P1"))
      .toEqual({ x: 190, y: 70 });
    expect(pinPosition(symbolConnector, { position: { x: 100, y: 50 }, pinSide: "left" }, "P1"))
      .toEqual({ x: 110, y: 70 });
    expect(pinPosition(symbolConnector, { position: { x: 100, y: 50 }, pinSide: "right", rotation: 90 }, "P1"))
      .toEqual({ x: 155, y: 115 });
  });

  it("화면 경로를 문서에 저장하지 않고 양 끝점에서 계산한다", () => {
    expect(orthogonalPath({ x: 10, y: 20 }, { x: 210, y: 120 })).toContain("M 10 20");
    expect(orthogonalPath({ x: 10, y: 20 }, { x: 210, y: 120 })).toContain("L 210 120");
  });

  it("수동 경로점이 있으면 그 점을 통과하는 곡선 경로를 계산한다", () => {
    expect(routedPath({ x: 10, y: 20 }, { x: 210, y: 120 }, { x: 140, y: 80 }))
      .toBe("M 10 20 Q 170 90 210 120");
  });

  it("멀티코어 연결의 양쪽 팬아웃과 중앙 외피 위치를 계산한다", () => {
    const second = { ...connector, id: "J2", reference: "J2", pins: connector.pins.map((pin) => ({ ...pin, id: `J2-${pin.id}` })) };
    const harness: Harness2D = {
      id: "H1", partNumber: "H1", name: "Harness", revision: "A", components: [connector, second],
      cableRuns: [{
        id: "C1", reference: "CBL-001", name: "4C", partNumber: "CABLE-4", manufacturer: "Test", lengthMm: 300,
        outerDiameterMm: 6, cores: [{ name: "CORE 1", color: "BK", gauge: "22 AWG" }],
        source: { libraryId: "L1", libraryRevision: "1", partId: "P1" },
      }],
      connections: [{
        id: "W1", kind: "cableCore", reference: "CBL-001:1", from: { componentId: "J1", pinId: "P1" },
        to: { componentId: "J2", pinId: "J2-P1" }, color: "BK", gauge: "22 AWG", lengthMm: 300, notes: "", cableRunId: "C1", cableCoreIndex: 0,
      }],
      drawing: { componentPlacements: { J1: { position: { x: 100, y: 100 }, pinSide: "right" }, J2: { position: { x: 700, y: 100 }, pinSide: "left" } } },
    };

    const geometry = cableRunGeometry(harness, "C1");
    expect(geometry.fromJunction.x).toBeGreaterThan(350);
    expect(geometry.toJunction.x).toBeLessThan(700);
    expect(geometry.connections).toHaveLength(1);
  });
});
