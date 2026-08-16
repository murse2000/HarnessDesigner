import occtImportJs from "occt-import-js";
import occtWasmUrl from "occt-import-js/dist/occt-import-js.wasm?url";
import type { ModelAsset, ModelMesh } from "../domain/types";
import type { AppPreferences } from "../preferences";

interface OcctArray { array: unknown[] }
interface OcctMesh {
  name?: string;
  color?: number[];
  attributes: { position: OcctArray; normal?: OcctArray };
  index: OcctArray;
}
interface OcctResult { success: boolean; meshes?: OcctMesh[] }

let occtPromise: ReturnType<typeof occtImportJs> | null = null;

function flattenNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.flat(Infinity).map(Number).filter(Number.isFinite);
}

export function normalizeStepMeshes(result: OcctResult): ModelMesh[] {
  if (!result.success) throw new Error("STEP 형상을 읽지 못했습니다.");
  const meshes = (result.meshes ?? []).map((mesh, index): ModelMesh => {
    const positions = flattenNumbers(mesh.attributes.position.array);
    const normals = mesh.attributes.normal ? flattenNumbers(mesh.attributes.normal.array) : undefined;
    const indices = flattenNumbers(mesh.index.array).map((value) => Math.trunc(value));
    if (!positions.length || !indices.length) throw new Error(`STEP 메시 ${index + 1}의 형상 데이터가 비어 있습니다.`);
    const color = mesh.color?.length === 3 ? [mesh.color[0], mesh.color[1], mesh.color[2]] as [number, number, number] : undefined;
    return { name: mesh.name || `Mesh ${index + 1}`, color, positions, normals: normals?.length ? normals : undefined, indices };
  });
  if (!meshes.length) throw new Error("STEP 파일에 표시 가능한 솔리드 또는 면이 없습니다.");
  return meshes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function importStepAsset(bytes: Uint8Array, sourceName: string, quality: AppPreferences["stepImportQuality"] = "standard"): Promise<ModelAsset> {
  occtPromise ??= occtImportJs({ locateFile: () => occtWasmUrl });
  const occt = await occtPromise;
  const precision = quality === "fine" ? { linearDeflection: 0.0004, angularDeflection: 0.25 } : quality === "coarse" ? { linearDeflection: 0.004, angularDeflection: 0.8 } : { linearDeflection: 0.001, angularDeflection: 0.5 };
  const result = occt.ReadStepFile(bytes, {
    linearUnit: "millimeter",
    linearDeflectionType: "bounding_box_ratio",
    ...precision,
  }) as OcctResult;
  return {
    id: crypto.randomUUID(),
    name: sourceName.replace(/\.(step|stp)$/i, ""),
    sourceFormat: "step",
    sourceName,
    sourceDataBase64: bytesToBase64(bytes),
    meshes: normalizeStepMeshes(result),
  };
}
