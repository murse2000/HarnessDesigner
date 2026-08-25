import type { PartSnapshot } from "../domain/types";
import * as THREE from "three";

export type ModelCableAxis = "+x" | "-x" | "+y" | "-y" | "+z" | "-z";

export interface ModelPinPort {
  pinNumber: string;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  directionX: number;
  directionY: number;
  directionZ: number;
  straightLeadMm: number;
}

export interface ModelPlacement {
  cableAxis: ModelCableAxis;
  rollDeg: number;
  rotationXDeg: number;
  rotationYDeg: number;
  rotationZDeg: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  inletDirectionX: number;
  inletDirectionY: number;
  inletDirectionZ: number;
  straightLeadMm: number;
  pinPorts: ModelPinPort[];
}

export const defaultModelPlacement: ModelPlacement = {
  cableAxis: "+z",
  rollDeg: 0,
  rotationXDeg: 0,
  rotationYDeg: 0,
  rotationZDeg: 0,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  offsetZ: 0,
  inletDirectionX: 0,
  inletDirectionY: 0,
  inletDirectionZ: 1,
  straightLeadMm: 10,
  pinPorts: [],
};

const axes = new Set<ModelCableAxis>(["+x", "-x", "+y", "-y", "+z", "-z"]);

export function modelCableAxisDirection(axis: ModelCableAxis) {
  if (axis === "+x") return { x: 1, y: 0, z: 0 };
  if (axis === "-x") return { x: -1, y: 0, z: 0 };
  if (axis === "+y") return { x: 0, y: 1, z: 0 };
  if (axis === "-y") return { x: 0, y: -1, z: 0 };
  if (axis === "-z") return { x: 0, y: 0, z: -1 };
  return { x: 0, y: 0, z: 1 };
}

export function modelInletDirection(placement: Pick<ModelPlacement, "cableAxis" | "inletDirectionX" | "inletDirectionY" | "inletDirectionZ">) {
  const length = Math.hypot(placement.inletDirectionX, placement.inletDirectionY, placement.inletDirectionZ);
  if (length < 0.000001) return modelCableAxisDirection(placement.cableAxis);
  return {
    x: placement.inletDirectionX / length,
    y: placement.inletDirectionY / length,
    z: placement.inletDirectionZ / length,
  };
}

export function modelPinPortDirection(port: Pick<ModelPinPort, "directionX" | "directionY" | "directionZ">, fallback: ReturnType<typeof modelInletDirection>) {
  const length = Math.hypot(port.directionX, port.directionY, port.directionZ);
  if (length < 0.000001) return fallback;
  return { x: port.directionX / length, y: port.directionY / length, z: port.directionZ / length };
}

export function getModelPinPort(placement: ModelPlacement, pinNumber: string): ModelPinPort {
  const saved = placement.pinPorts.find((port) => port.pinNumber === pinNumber);
  if (saved) return saved;
  const direction = modelInletDirection(placement);
  return {
    pinNumber,
    offsetX: 0,
    offsetY: 0,
    offsetZ: 0,
    directionX: direction.x,
    directionY: direction.y,
    directionZ: direction.z,
    straightLeadMm: placement.straightLeadMm,
  };
}

export function setModelPinPort(placement: ModelPlacement, port: ModelPinPort): ModelPlacement {
  return { ...placement, pinPorts: [...placement.pinPorts.filter((item) => item.pinNumber !== port.pinNumber), port] };
}

export function rotateModelPinPorts(placement: ModelPlacement, rotation: { x: number; y: number; z: number }): ModelPlacement {
  const previous = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(placement.rotationXDeg),
    THREE.MathUtils.degToRad(placement.rotationYDeg),
    THREE.MathUtils.degToRad(placement.rotationZDeg),
  ));
  const next = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(rotation.x),
    THREE.MathUtils.degToRad(rotation.y),
    THREE.MathUtils.degToRad(rotation.z),
  ));
  const delta = next.multiply(previous.invert());
  return {
    ...placement,
    rotationXDeg: rotation.x,
    rotationYDeg: rotation.y,
    rotationZDeg: rotation.z,
    pinPorts: placement.pinPorts.map((port) => {
      const position = new THREE.Vector3(port.offsetX, port.offsetY, port.offsetZ).applyQuaternion(delta);
      const direction = new THREE.Vector3(port.directionX, port.directionY, port.directionZ).applyQuaternion(delta).normalize();
      return {
        ...port,
        offsetX: position.x,
        offsetY: position.y,
        offsetZ: position.z,
        directionX: direction.x,
        directionY: direction.y,
        directionZ: direction.z,
      };
    }),
  };
}

export function getModelPlacement(part?: PartSnapshot): ModelPlacement {
  const saved = part?.attributes.modelPlacement;
  if (!saved) return { ...defaultModelPlacement };
  try {
    const value = JSON.parse(saved) as Partial<ModelPlacement>;
    const cableAxis = axes.has(value.cableAxis as ModelCableAxis) ? value.cableAxis as ModelCableAxis : defaultModelPlacement.cableAxis;
    const axisDirection = modelCableAxisDirection(cableAxis);
    const inletDirection = modelInletDirection({
      cableAxis,
      inletDirectionX: Number.isFinite(value.inletDirectionX) ? value.inletDirectionX! : axisDirection.x,
      inletDirectionY: Number.isFinite(value.inletDirectionY) ? value.inletDirectionY! : axisDirection.y,
      inletDirectionZ: Number.isFinite(value.inletDirectionZ) ? value.inletDirectionZ! : axisDirection.z,
    });
    const placement = {
      cableAxis,
      rollDeg: Number.isFinite(value.rollDeg) ? value.rollDeg! : 0,
      rotationXDeg: Number.isFinite(value.rotationXDeg) ? value.rotationXDeg! : 0,
      rotationYDeg: Number.isFinite(value.rotationYDeg) ? value.rotationYDeg! : 0,
      rotationZDeg: Number.isFinite(value.rotationZDeg) ? value.rotationZDeg! : 0,
      scale: Number.isFinite(value.scale) && value.scale! > 0 ? value.scale! : 1,
      offsetX: Number.isFinite(value.offsetX) ? value.offsetX! : 0,
      offsetY: Number.isFinite(value.offsetY) ? value.offsetY! : 0,
      offsetZ: Number.isFinite(value.offsetZ) ? value.offsetZ! : 0,
      inletDirectionX: inletDirection.x,
      inletDirectionY: inletDirection.y,
      inletDirectionZ: inletDirection.z,
      straightLeadMm: Number.isFinite(value.straightLeadMm) ? Math.max(value.straightLeadMm!, 0) : defaultModelPlacement.straightLeadMm,
      pinPorts: Array.isArray(value.pinPorts) ? value.pinPorts.flatMap((port) => {
        if (!port || typeof port.pinNumber !== "string") return [];
        const direction = modelPinPortDirection({
          directionX: Number.isFinite(port.directionX) ? port.directionX : inletDirection.x,
          directionY: Number.isFinite(port.directionY) ? port.directionY : inletDirection.y,
          directionZ: Number.isFinite(port.directionZ) ? port.directionZ : inletDirection.z,
        }, inletDirection);
        return [{
          pinNumber: port.pinNumber,
          offsetX: Number.isFinite(port.offsetX) ? port.offsetX : 0,
          offsetY: Number.isFinite(port.offsetY) ? port.offsetY : 0,
          offsetZ: Number.isFinite(port.offsetZ) ? port.offsetZ : 0,
          directionX: direction.x,
          directionY: direction.y,
          directionZ: direction.z,
          straightLeadMm: Number.isFinite(port.straightLeadMm) ? Math.max(port.straightLeadMm, 0) : defaultModelPlacement.straightLeadMm,
        }];
      }) : [],
    };
    return placement;
  } catch {
    return { ...defaultModelPlacement };
  }
}

export function saveModelPlacement(attributes: Record<string, string>, placement: ModelPlacement): Record<string, string> {
  return { ...attributes, modelPlacement: JSON.stringify(placement) };
}

export function resolveLibraryModelPlacement(part: PartSnapshot, libraryParts: PartSnapshot[]): PartSnapshot {
  const normalizedPartNumber = part.partNumber.replace(/[-\s]/g, "").toUpperCase();
  const libraryPart = libraryParts.find((candidate) => candidate.id === part.id)
    ?? libraryParts.find((candidate) => candidate.category === part.category
      && candidate.manufacturer === part.manufacturer
      && candidate.partNumber.replace(/[-\s]/g, "").toUpperCase() === normalizedPartNumber);
  const placement = libraryPart?.attributes.modelPlacement;
  if (!placement) return part;
  return {
    ...part,
    modelAssetId: libraryPart.modelAssetId ?? part.modelAssetId,
    attributes: { ...part.attributes, modelPlacement: placement },
  };
}
