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

function parseAwg(gauge: string) {
  const normalized = gauge.trim().toUpperCase().replace(/\s*AWG$/, "").replace(/\s/g, "");
  if (!normalized) return null;
  const aught = normalized.match(/^([1-4])\/0$/);
  if (aught) return 1 - Number(aught[1]);
  if (/^0{1,4}$/.test(normalized)) return 1 - normalized.length;
  const parsed = Number(normalized);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 40 ? parsed : null;
}

export function getWireRenderDiameterMm(part: PartSnapshot | undefined, gauge: string) {
  const registeredDiameter = part?.category === "wire"
    ? positiveNumber(part.attributes.outerDiameterMm ?? part.attributes.diameterMm)
    : null;
  if (registeredDiameter) return registeredDiameter;
  const awg = parseAwg(gauge || part?.gauge || "");
  if (awg === null) return 2.3;
  return 0.127 * Math.pow(92, (36 - awg) / 39);
}

export function getIndividualWireOffsets(diametersMm: number[]): CoreOffset[] {
  const diameters = diametersMm.map((diameter) => Number.isFinite(diameter) && diameter > 0 ? diameter : 0);
  if (!diameters.length) return [];
  const gapMm = Math.max(...diameters) * 0.25;
  const totalWidthMm = diameters.reduce((sum, diameter) => sum + diameter, 0) + gapMm * (diameters.length - 1);
  let cursorMm = -totalWidthMm / 2;
  return diameters.map((diameter) => {
    const offset = { x: cursorMm + diameter / 2, y: cursorMm + diameter / 2 };
    cursorMm += diameter + gapMm;
    return offset;
  });
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
