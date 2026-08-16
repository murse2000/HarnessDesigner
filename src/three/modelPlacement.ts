import type { PartSnapshot } from "../domain/types";

export type ModelCableAxis = "+x" | "-x" | "+y" | "-y" | "+z" | "-z";

export interface ModelPlacement {
  cableAxis: ModelCableAxis;
  rollDeg: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
}

export const defaultModelPlacement: ModelPlacement = {
  cableAxis: "+z",
  rollDeg: 0,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  offsetZ: 0,
};

const axes = new Set<ModelCableAxis>(["+x", "-x", "+y", "-y", "+z", "-z"]);

export function getModelPlacement(part?: PartSnapshot): ModelPlacement {
  const saved = part?.attributes.modelPlacement;
  if (!saved) return { ...defaultModelPlacement };
  try {
    const value = JSON.parse(saved) as Partial<ModelPlacement>;
    return {
      cableAxis: axes.has(value.cableAxis as ModelCableAxis) ? value.cableAxis as ModelCableAxis : defaultModelPlacement.cableAxis,
      rollDeg: Number.isFinite(value.rollDeg) ? value.rollDeg! : 0,
      scale: Number.isFinite(value.scale) && value.scale! > 0 ? value.scale! : 1,
      offsetX: Number.isFinite(value.offsetX) ? value.offsetX! : 0,
      offsetY: Number.isFinite(value.offsetY) ? value.offsetY! : 0,
      offsetZ: Number.isFinite(value.offsetZ) ? value.offsetZ! : 0,
    };
  } catch {
    return { ...defaultModelPlacement };
  }
}

export function saveModelPlacement(attributes: Record<string, string>, placement: ModelPlacement): Record<string, string> {
  return { ...attributes, modelPlacement: JSON.stringify(placement) };
}
