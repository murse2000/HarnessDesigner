import { Box, Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ModelAsset, PartSnapshot } from "../domain/types";
import { backendInvoke } from "../platform";
import { useProjectStore } from "../store/projectStore";
import { getModelPlacement, saveModelPlacement, type ModelPlacement } from "../three/modelPlacement";
import { IconButton } from "./common";
import { ModelPlacementControls } from "./ModelPlacementControls";
import { Part3DPreview } from "./ThreeDView";

export function ModelAlignmentDialog({ part, onClose, onSaved }: { part: PartSnapshot; onClose: () => void; onSaved: (part: PartSnapshot) => void }) {
  const { snapshot, updateProject } = useProjectStore();
  const [asset, setAsset] = useState<ModelAsset | null>(null);
  const [placement, setPlacement] = useState<ModelPlacement>(() => getModelPlacement(part));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!part.modelAssetId) return;
    void backendInvoke<ModelAsset | null>("get_library_model_asset", { assetId: part.modelAssetId })
      .then((loaded) => loaded ? setAsset(loaded) : setError("등록된 STEP 자산을 찾을 수 없습니다."))
      .catch((reason) => setError(String(reason)));
  }, [part.modelAssetId]);

  const saveAlignment = async () => {
    const updated: PartSnapshot = {
      ...part,
      attributes: saveModelPlacement(part.attributes, placement),
      sourceLibraryRevision: (part.sourceLibraryRevision ?? 0) + 1,
    };
    setSaving(true);
    setError(null);
    try {
      await backendInvoke("upsert_library_part", { part: updated });
      if (snapshot?.project.parts.some((item) => item.id === part.id)) {
        await updateProject((project) => {
          const index = project.parts.findIndex((item) => item.id === part.id);
          if (index >= 0) project.parts[index] = structuredClone(updated);
        });
      }
      onSaved(updated);
      onClose();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setSaving(false);
    }
  };

  return <div className="modal-backdrop"><section className="editor-dialog model-alignment-dialog" role="dialog" aria-modal="true"><header><div><Box size={15} /><strong>3D 하우징 정렬</strong><span>{part.partNumber} · STEP 축과 와이어 접속점을 맞춥니다.</span></div><IconButton title="닫기" onClick={onClose}><X size={14} /></IconButton></header><div className="model-alignment-body"><div className="model-alignment-preview"><Part3DPreview asset={asset} placement={placement} showCable /><p>빨간색 축: X · 초록색 축: Y · 파란색 축: Z · 검은 원통: 케이블 방향</p></div><ModelPlacementControls value={placement} onChange={setPlacement} /></div>{error && <div className="connector-library-error">{error}</div>}<footer><button onClick={onClose}>취소</button><button className="primary" disabled={!asset || saving} onClick={() => void saveAlignment()}><Save size={13} />{saving ? "저장 중…" : "정렬 저장"}</button></footer></section></div>;
}
