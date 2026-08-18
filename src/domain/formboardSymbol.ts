import type { PartSnapshot, ProjectDocument, SymbolAsset } from "./types";
import { getModelPlacement } from "../three/modelPlacement";
import { createStepProjectionSymbol, type StepProjectionView } from "../three/stepProjection";

function projectionView(part: PartSnapshot): StepProjectionView {
  const saved = part.attributes.stepProjectionView;
  const view = saved === "back" || saved === "left" || saved === "right" || saved === "top" || saved === "bottom" ? saved : "front";
  return view === "front" || view === "back" ? "left" : view;
}

export function resolveFormboardSymbol(project: Pick<ProjectDocument, "assets" | "modelAssets">, part?: PartSnapshot): SymbolAsset | null {
  if (!part) return null;
  const registered = project.assets.find((asset) => asset.id === part.symbolAssetId);
  const model = project.modelAssets.find((asset) => asset.id === part.modelAssetId);
  const stepProjection = registered?.svg.includes("data-step-view=");
  if (registered && !stepProjection) return registered;
  if (!model?.meshes.length) return registered ?? null;
  const view = projectionView(part);
  const placement = getModelPlacement(part);
  return createStepProjectionSymbol(model, view, placement.scale, registered?.id ?? `formboard-${model.id}-${view}`, placement);
}

export function resolveFormboardSymbolRotation(symbol: SymbolAsset | null | undefined, part?: PartSnapshot): number {
  if (!symbol || symbol.svg.includes("data-step-view=")) return 0;
  const rollDeg = getModelPlacement(part).rollDeg;
  const normalized = ((rollDeg % 360) + 360) % 360;
  return normalized > 180 ? normalized - 360 : normalized;
}

export function resolveFormboardSymbolRouteRotation(symbol: SymbolAsset | null | undefined, part: PartSnapshot | undefined, routeAngle: number): number {
  const view = symbol?.svg.match(/data-step-view="(front|back|left|right|top|bottom)"/)?.[1];
  const cableAngle = view === "right" ? 180 : view === "top" ? 90 : view === "bottom" ? -90 : 0;
  return resolveFormboardSymbolRotation(symbol, part) + routeAngle - cableAngle;
}
