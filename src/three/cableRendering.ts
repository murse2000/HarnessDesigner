import type { CableConstruction, PartSnapshot } from "../domain/types";

export interface CableRenderSpec {
  construction: CableConstruction;
  coreCount: number;
  outerDiameterMm: number;
  coreDiameterMm: number;
  breakoutLengthMm: number;
  jacketColor: string;
  shieldConstruction?: string;
}

export interface HeatShrinkRenderSpec {
  finishedDiameterMm: number;
  lengthMm: number;
  color: string;
}

export interface CableDisplayPolicy {
  showFullLengthCores: boolean;
  jacketOpacity: number;
  shieldOpacity: number;
}

export function getCableDisplayPolicy(xray: boolean, jacketsVisible: boolean): CableDisplayPolicy {
  return {
    showFullLengthCores: xray || !jacketsVisible,
    jacketOpacity: xray ? 0.22 : 1,
    shieldOpacity: xray ? 0.16 : 1,
  };
}

function positiveNumber(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function getCableRenderSpec(part: PartSnapshot | undefined): CableRenderSpec | null {
  if (!part || part.category !== "cable" || !part.color?.trim()) return null;
  const coreCount = positiveNumber(part.attributes.coreCount);
  const outerDiameterMm = positiveNumber(part.attributes.outerDiameterMm);
  const coreDiameterMm = positiveNumber(part.attributes.coreDiameterMm);
  const breakoutLengthMm = positiveNumber(part.attributes.breakoutLengthMm);
  if (!coreCount || !Number.isInteger(coreCount) || !outerDiameterMm || !coreDiameterMm || !breakoutLengthMm || coreDiameterMm > outerDiameterMm) return null;
  const construction = part.attributes.construction === "shieldedMultiCore" ? "shieldedMultiCore" : "multiCore";
  return { construction, coreCount, outerDiameterMm, coreDiameterMm, breakoutLengthMm, jacketColor: part.color.trim(), shieldConstruction: part.attributes.shieldConstruction };
}

export function getHeatShrinkRenderSpec(part: PartSnapshot | undefined): HeatShrinkRenderSpec | null {
  if (!part || part.category !== "heatShrink" || !part.color?.trim()) return null;
  const finishedDiameterMm = positiveNumber(part.attributes.finishedDiameterMm);
  const lengthMm = positiveNumber(part.attributes.lengthMm);
  if (!finishedDiameterMm || !lengthMm) return null;
  return { finishedDiameterMm, lengthMm, color: part.color.trim() };
}

export function getCableSpans(lengthMm: number, breakoutLengthMm: number) {
  const breakoutMm = Math.min(Math.max(breakoutLengthMm, 0), Math.max(lengthMm, 0) / 2);
  return { breakoutMm, jacketLengthMm: Math.max(lengthMm - breakoutMm * 2, 0) };
}

export function getHeatShrinkSpan(segmentLengthMm: number, centerMm: number, heatShrinkLengthMm: number) {
  const segmentLength = Math.max(segmentLengthMm, 0);
  const center = Math.min(Math.max(centerMm, 0), segmentLength);
  const halfLength = Math.max(heatShrinkLengthMm, 0) / 2;
  return { startMm: Math.max(center - halfLength, 0), endMm: Math.min(center + halfLength, segmentLength) };
}

export interface CoreOffset {
  x: number;
  y: number;
}

export function getCoreOffsets(count: number, outerDiameterMm: number, coreDiameterMm: number): CoreOffset[] {
  const safeCount = Math.max(0, Math.floor(count));
  if (!safeCount) return [];
  if (safeCount === 1) return [{ x: 0, y: 0 }];
  const radius = Math.max(0, Math.min(outerDiameterMm / 2 - coreDiameterMm / 2, outerDiameterMm * 0.25));
  return Array.from({ length: safeCount }, (_, index) => {
    const angle = index / safeCount * Math.PI * 2;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
}
