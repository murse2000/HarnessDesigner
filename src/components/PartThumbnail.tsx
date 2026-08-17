import { Boxes, Cable, Circle, CircleDot, Component, GitFork, Layers3, Minus, Paperclip, Plug, Shield, Tag, Waves } from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import { createDrawingPreview, createModelPreview, selectStoredPreview } from "../domain/partPreview";
import type { PartCategory, PartPreview, PartSnapshot, ProjectDocument, SymbolAsset, ModelAsset } from "../domain/types";
import { backendInvoke, isTauri } from "../platform";

const categoryIcons: Record<PartCategory, ComponentType<{ size?: number }>> = {
  housing: Boxes,
  terminal: Plug,
  seal: CircleDot,
  wire: Minus,
  cable: Cable,
  heatShrink: Circle,
  sleeve: Layers3,
  shield: Shield,
  tape: Waves,
  label: Tag,
  clip: Paperclip,
  lug: Component,
  splice: GitFork,
};

function getOfficialImagePreview(part: PartSnapshot): PartPreview | undefined {
  const dataUrl = part.attributes.officialImageUrl;
  return dataUrl ? { kind: "photo", dataUrl, sourceName: "제조사 공식 제품 이미지" } : undefined;
}

export function PartThumbnail({ part, project, large = false }: { part: PartSnapshot; project?: ProjectDocument; large?: boolean }) {
  const [preview, setPreview] = useState<PartPreview | undefined>(() => selectStoredPreview(part) ?? getOfficialImagePreview(part));

  useEffect(() => {
    let cancelled = false;
    const stored = selectStoredPreview(part);
    if (stored) {
      setPreview(stored);
      return;
    }
    const officialImage = getOfficialImagePreview(part);
    if (officialImage) {
      setPreview(officialImage);
      return;
    }
    setPreview(undefined);
    void (async () => {
      if (part.modelAssetId) {
        const asset = project?.modelAssets.find((item) => item.id === part.modelAssetId)
          ?? (isTauri() ? await backendInvoke<ModelAsset | null>("get_library_model_asset", { assetId: part.modelAssetId }) : null);
        const resolved = asset ? createModelPreview(asset) : undefined;
        if (!cancelled) setPreview(resolved);
        return;
      }
      if (part.symbolAssetId) {
        const asset = project?.assets.find((item) => item.id === part.symbolAssetId)
          ?? (isTauri() ? await backendInvoke<SymbolAsset | null>("get_library_symbol_asset", { assetId: part.symbolAssetId }) : null);
        if (!cancelled) setPreview(asset ? createDrawingPreview(asset) : undefined);
      }
    })().catch(() => { if (!cancelled) setPreview(undefined); });
    return () => { cancelled = true; };
  }, [part, project]);

  const Icon = categoryIcons[part.category];
  const label = preview?.kind === "photo" ? "사진" : preview?.kind === "model" ? "3D" : preview?.kind === "drawing" ? "도면" : "기본 이미지";
  return <div className={`part-thumbnail${large ? " part-thumbnail--large" : ""}`} title={preview?.sourceName ?? label}>
    {preview ? <img src={preview.dataUrl} alt={`${part.partNumber} ${label}`} onError={() => setPreview(undefined)} /> : <Icon size={large ? 40 : 24} />}
    <span>{label}</span>
  </div>;
}
