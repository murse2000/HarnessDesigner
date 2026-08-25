import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { sampleHarness } from "../test/sampleProject";
import { buildCableCoreCurves, buildInletCurve, closestPinConnectionCandidate, connectorWorldDirection, getConductorPinIdAtNode, getPinConnectionOffset, getPinConnectionPosition, pinConnectionKey, projectPinToConnectorSurface } from "./pinConnections";

describe("3D 핀 접속점", () => {
  it("2D 핀 배열을 기준으로 겹치지 않는 기본 3D 접속점을 만든다", () => {
    const node = sampleHarness.nodes[0];
    expect(getPinConnectionOffset(node, node.pins[0].id)).not.toEqual(getPinConnectionOffset(node, node.pins[1].id));
  });

  it("사용자가 저장한 핀별 오프셋을 우선한다", () => {
    const node = structuredClone(sampleHarness.nodes[0]);
    node.pins[0].threeDConnectionOffset = { x: 3, y: 4, z: 5 };
    expect(getPinConnectionPosition(node, node.pins[0].id, { x: 10, y: 20, z: 30 })).toEqual({ x: 13, y: 24, z: 35 });
  });

  it("전선 끝단의 노드에 해당하는 핀만 찾는다", () => {
    const wire = sampleHarness.conductors[0];
    expect(getConductorPinIdAtNode(wire, wire.from.nodeId)).toBe(wire.from.pinId);
    expect(getConductorPinIdAtNode(wire, wire.to.nodeId)).toBe(wire.to.pinId);
    expect(getConductorPinIdAtNode(wire, "unknown")).toBeUndefined();
    expect(pinConnectionKey(wire.from.nodeId, wire.from.pinId!)).toBe(`${wire.from.nodeId}:${wire.from.pinId}`);
  });

  it("겹친 클릭 영역에서는 마우스에 가장 가까운 핀 중심을 선택한다", () => {
    const overlapped = closestPinConnectionCandidate([
      { target: "앞쪽 핀", screenX: 100, screenY: 100, hitDistance: 5 },
      { target: "뒤쪽 핀", screenX: 100, screenY: 100, hitDistance: 8 },
    ], { x: 100, y: 100 });
    const separated = closestPinConnectionCandidate([
      { target: "앞쪽의 이동된 핀", screenX: 108, screenY: 100, hitDistance: 5 },
      { target: "원래 위치의 핀", screenX: 100, screenY: 100, hitDistance: 8 },
    ], { x: 100, y: 100 });

    expect(overlapped).toBe("앞쪽 핀");
    expect(separated).toBe("원래 위치의 핀");
  });

  it("기본 접속점을 커넥터 도형 표면에 투영한다", () => {
    const connector = new THREE.Group();
    connector.add(new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial()));
    connector.add(new THREE.Sprite(new THREE.SpriteMaterial()));
    const point = projectPinToConnectorSurface(connector, new THREE.Vector3(0, 1, 2), new THREE.Vector3(1, 0, 0));
    expect(point.x).toBeCloseTo(5);
    expect(point.y).toBeCloseTo(1);
    expect(point.z).toBeCloseTo(2);
  });

  it("투영 방향에 커넥터 표면이 없으면 기존 위치를 유지한다", () => {
    const connector = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial());
    const desired = new THREE.Vector3(0, 20, 20);
    expect(projectPinToConnectorSurface(connector, desired, new THREE.Vector3(1, 0, 0))).toBe(desired);
  });

  it("커넥터 회전을 핀 접속점의 표면 투영 방향에도 적용한다", () => {
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
    const direction = connectorWorldDirection(new THREE.Vector3(1, 0, 0), rotation);
    expect(direction.x).toBeCloseTo(0);
    expect(direction.y).toBeCloseTo(1);
  });

  it("부품에 저장한 양쪽 인입 방향을 케이블 곡선의 접선으로 사용한다", () => {
    const curve = buildInletCurve(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(100, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, -1, 0),
      10,
      10,
    );
    const startTangent = curve.getTangent(0).normalize();
    const cableAwayFromEnd = curve.getTangent(1).normalize().negate();

    expect(startTangent.x).toBeCloseTo(0);
    expect(startTangent.y).toBeCloseTo(1);
    expect(cableAwayFromEnd.x).toBeCloseTo(0);
    expect(cableAwayFromEnd.y).toBeCloseTo(-1);
  });

  it("지정한 직선 인출 길이까지 인입면의 수직 방향을 유지한다", () => {
    const curve = buildInletCurve(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(100, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, -1, 0),
      10,
      10,
    );
    const totalLength = curve.getLength();

    expect(curve.getPointAt(5 / totalLength).x).toBeCloseTo(0);
    expect(curve.getPointAt(5 / totalLength).y).toBeCloseTo(5);
    expect(curve.getPointAt(1 - 5 / totalLength).x).toBeCloseTo(100);
    expect(curve.getPointAt(1 - 5 / totalLength).y).toBeCloseTo(-5);
  });

  it("멀티코어 양끝이 핀에서 시작해 외피 입구에 정확히 수렴한다", () => {
    const jacket = new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(100, 0, 0));
    const paths = buildCableCoreCurves(jacket, new THREE.Vector3(0, 10, 0), new THREE.Vector3(100, -10, 0), 0.2, { x: 0, y: 2 });

    expect(paths.start.getPointAt(0)).toEqual(new THREE.Vector3(0, 10, 0));
    expect(paths.start.getPointAt(1).distanceTo(paths.jacketStart)).toBeLessThan(0.000001);
    expect(paths.end.getPointAt(0).distanceTo(paths.jacketEnd)).toBeLessThan(0.000001);
    expect(paths.end.getPointAt(1).distanceTo(new THREE.Vector3(100, -10, 0))).toBeLessThan(0.000001);
  });

  it("멀티코어 코어도 핀별 인입 포트 방향으로 출발한다", () => {
    const jacket = new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(100, 0, 0));
    const paths = buildCableCoreCurves(
      jacket,
      new THREE.Vector3(0, 10, 0),
      new THREE.Vector3(100, -10, 0),
      0.2,
      { x: 0, y: 2 },
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 1, 0),
      8,
      8,
    );

    expect(paths.start.getTangent(0).normalize().z).toBeCloseTo(1);
    expect(paths.end.getTangent(1).normalize().negate().y).toBeCloseTo(1);
  });
});
