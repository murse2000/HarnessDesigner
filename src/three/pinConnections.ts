import * as THREE from "three";
import type { Conductor, HarnessNode } from "../domain/types";
import type { HarnessPoint3 } from "./harnessLayout";

export function pinConnectionKey(nodeId: string, pinId: string) {
  return `${nodeId}:${pinId}`;
}

export function getPinConnectionOffset(node: HarnessNode, pinId: string): HarnessPoint3 {
  const pin = node.pins.find((item) => item.id === pinId);
  if (!pin) return { x: 0, y: 0, z: 0 };
  if (pin.threeDConnectionOffset) return { ...pin.threeDConnectionOffset };
  const center = node.pins.reduce((sum, item) => ({ x: sum.x + item.position.x, y: sum.y + item.position.y }), { x: 0, y: 0 });
  center.x /= Math.max(node.pins.length, 1);
  center.y /= Math.max(node.pins.length, 1);
  return {
    x: 0,
    y: (center.y - pin.position.y) * 0.2,
    z: (pin.position.x - center.x) * 0.2,
  };
}

export function getPinConnectionPosition(node: HarnessNode, pinId: string, nodePosition: HarnessPoint3): HarnessPoint3 {
  const offset = getPinConnectionOffset(node, pinId);
  return { x: nodePosition.x + offset.x, y: nodePosition.y + offset.y, z: nodePosition.z + offset.z };
}

export function getConductorPinIdAtNode(conductor: Conductor, nodeId: string) {
  if (conductor.from.nodeId === nodeId) return conductor.from.pinId;
  if (conductor.to.nodeId === nodeId) return conductor.to.pinId;
  return undefined;
}

export function connectorWorldDirection(localDirection: THREE.Vector3, rotation: THREE.Quaternion) {
  return localDirection.clone().applyQuaternion(rotation).normalize();
}

function cableOffsetBasis(curve: THREE.Curve<THREE.Vector3>) {
  const axis = curve.getPointAt(1).sub(curve.getPointAt(0)).normalize();
  const reference = Math.abs(axis.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const x = new THREE.Vector3().crossVectors(axis, reference).normalize();
  return { x, y: new THREE.Vector3().crossVectors(axis, x).normalize() };
}

function offsetCablePoint(curve: THREE.Curve<THREE.Vector3>, ratio: number, offset: { x: number; y: number }, basis: ReturnType<typeof cableOffsetBasis>) {
  return curve.getPointAt(ratio).addScaledVector(basis.x, offset.x).addScaledVector(basis.y, offset.y);
}

function fanoutCurve(start: THREE.Vector3, end: THREE.Vector3) {
  return new THREE.CatmullRomCurve3([start, start.clone().lerp(end, 0.5), end], false, "centripetal");
}

export function buildCableCoreCurves(centerCurve: THREE.Curve<THREE.Vector3>, startPin: THREE.Vector3, endPin: THREE.Vector3, breakoutRatio: number, offset: { x: number; y: number }) {
  const ratio = Math.min(Math.max(breakoutRatio, 0), 0.5);
  const basis = cableOffsetBasis(centerCurve);
  const jacketStart = offsetCablePoint(centerCurve, ratio, offset, basis);
  const jacketEnd = offsetCablePoint(centerCurve, 1 - ratio, offset, basis);
  return {
    start: fanoutCurve(startPin, jacketStart),
    end: fanoutCurve(jacketEnd, endPin),
    full: new THREE.CatmullRomCurve3([
      startPin,
      jacketStart,
      offsetCablePoint(centerCurve, 0.5, offset, basis),
      jacketEnd,
      endPin,
    ], false, "centripetal"),
    jacketStart,
    jacketEnd,
  };
}

export function projectPinToConnectorSurface(nodeObject: THREE.Object3D, desiredPosition: THREE.Vector3, cableDirection: THREE.Vector3) {
  nodeObject.updateWorldMatrix(true, true);
  const direction = cableDirection.clone().normalize();
  const raycaster = new THREE.Raycaster(desiredPosition.clone().addScaledVector(direction, 1000), direction.clone().negate(), 0, 2000);
  const meshes: THREE.Mesh[] = [];
  nodeObject.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child);
  });
  return raycaster.intersectObjects(meshes, false)[0]?.point ?? desiredPosition;
}
