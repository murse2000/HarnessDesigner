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

export function closestPinConnectionCandidate<T>(candidates: Array<{ target: T; screenX: number; screenY: number; hitDistance: number }>, pointer: { x: number; y: number }) {
  return [...candidates].sort((left, right) => {
    const leftDistance = (left.screenX - pointer.x) ** 2 + (left.screenY - pointer.y) ** 2;
    const rightDistance = (right.screenX - pointer.x) ** 2 + (right.screenY - pointer.y) ** 2;
    return leftDistance - rightDistance || left.hitDistance - right.hitDistance;
  })[0]?.target ?? null;
}

export function connectorWorldDirection(localDirection: THREE.Vector3, rotation: THREE.Quaternion) {
  return localDirection.clone().applyQuaternion(rotation).normalize();
}

export function buildInletCurve(start: THREE.Vector3, end: THREE.Vector3, startDirection?: THREE.Vector3, endDirection?: THREE.Vector3, startLeadMm = 0, endLeadMm = 0, middlePoints: THREE.Vector3[] = []) {
  const distance = start.distanceTo(end);
  const fallbackStart = end.clone().sub(start).normalize();
  const fallbackEnd = start.clone().sub(end).normalize();
  const startOut = startDirection?.lengthSq() ? startDirection.clone().normalize() : fallbackStart;
  const endOut = endDirection?.lengthSq() ? endDirection.clone().normalize() : fallbackEnd;
  const startLead = Math.min(Math.max(startLeadMm, 0), distance * 0.45);
  const endLead = Math.min(Math.max(endLeadMm, 0), distance * 0.45);
  const startLeadEnd = start.clone().addScaledVector(startOut, startLead);
  const endLeadStart = end.clone().addScaledVector(endOut, endLead);
  const curve = new THREE.CurvePath<THREE.Vector3>();
  if (startLead > 0) curve.add(new THREE.LineCurve3(start, startLeadEnd));
  const bendLength = Math.max(startLeadEnd.distanceTo(endLeadStart) * 0.2, 0.001);
  if (middlePoints.length) {
    curve.add(new THREE.CatmullRomCurve3([
      startLeadEnd,
      startLeadEnd.clone().addScaledVector(startOut, bendLength),
      ...middlePoints,
      endLeadStart.clone().addScaledVector(endOut, bendLength),
      endLeadStart,
    ], false, "centripetal"));
  } else {
    curve.add(new THREE.CubicBezierCurve3(
      startLeadEnd,
      startLeadEnd.clone().addScaledVector(startOut, bendLength),
      endLeadStart.clone().addScaledVector(endOut, bendLength),
      endLeadStart,
    ));
  }
  if (endLead > 0) curve.add(new THREE.LineCurve3(endLeadStart, end));
  return curve;
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

export function buildCableCoreCurves(centerCurve: THREE.Curve<THREE.Vector3>, startPin: THREE.Vector3, endPin: THREE.Vector3, breakoutRatio: number, offset: { x: number; y: number }, startDirection?: THREE.Vector3, endDirection?: THREE.Vector3, startLeadMm = 0, endLeadMm = 0) {
  const ratio = Math.min(Math.max(breakoutRatio, 0), 0.5);
  const basis = cableOffsetBasis(centerCurve);
  const jacketStart = offsetCablePoint(centerCurve, ratio, offset, basis);
  const jacketEnd = offsetCablePoint(centerCurve, 1 - ratio, offset, basis);
  const middle = offsetCablePoint(centerCurve, 0.5, offset, basis);
  return {
    start: startDirection ? buildInletCurve(startPin, jacketStart, startDirection, undefined, startLeadMm) : fanoutCurve(startPin, jacketStart),
    end: endDirection ? buildInletCurve(jacketEnd, endPin, undefined, endDirection, 0, endLeadMm) : fanoutCurve(jacketEnd, endPin),
    full: buildInletCurve(startPin, endPin, startDirection, endDirection, startLeadMm, endLeadMm, [jacketStart, middle, jacketEnd]),
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
