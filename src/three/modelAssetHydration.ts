import type { ModelAsset } from "../domain/types";
import { backendInvoke, isTauri } from "../platform";
import { loadAppPreferences } from "../preferences";
import { importStepAsset } from "./stepImport";

export function decodeBase64Bytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function hydrateLibraryModelAsset(asset: ModelAsset): Promise<ModelAsset> {
  if (asset.meshes.length) return asset;
  if (!asset.sourceDataBase64) throw new Error(`${asset.sourceName} STEP 원본 데이터가 비어 있습니다.`);

  const imported = await importStepAsset(
    decodeBase64Bytes(asset.sourceDataBase64),
    asset.sourceName,
    loadAppPreferences().stepImportQuality,
  );
  const hydrated = { ...imported, id: asset.id, name: asset.name };
  if (isTauri()) await backendInvoke("upsert_library_model_asset", { asset: hydrated });
  return hydrated;
}
