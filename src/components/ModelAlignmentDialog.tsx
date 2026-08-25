import { Box, Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ModelAsset, PartSnapshot } from "../domain/types";
import { getPartPinNumbers } from "../domain/parts";
import { backendInvoke } from "../platform";
import { useProjectStore } from "../store/projectStore";
import { hydrateLibraryModelAsset } from "../three/modelAssetHydration";
import { getModelPlacement, saveModelPlacement, type ModelPlacement } from "../three/modelPlacement";
import { IconButton } from "./common";
import { ModelPlacementControls } from "./ModelPlacementControls";
import { Part3DPreview } from "./ThreeDView";

export function ModelAlignmentDialog({ part, onClose, onSaved }: { part: PartSnapshot; onClose: () => void; onSaved: (part: PartSnapshot) => void }) {
  const { snapshot, updateProject } = useProjectStore();
  const [asset, setAsset] = useState<ModelAsset | null>(null);
  const [placement, setPlacement] = useState<ModelPlacement>(() => getModelPlacement(part));
  const pinNumbers = getPartPinNumbers(part);
  const [selectedPinNumber, setSelectedPinNumber] = useState(pinNumbers[0] ?? "");
  const [placingPinPort, setPlacingPinPort] = useState(false);
  const [rotatingConnector, setRotatingConnector] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!part.modelAssetId) return;
    void backendInvoke<ModelAsset | null>("get_library_model_asset", { assetId: part.modelAssetId })
      .then(async (loaded) => loaded ? setAsset(await hydrateLibraryModelAsset(loaded)) : setError("등록된 STEP 자산을 찾을 수 없습니다."))
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
      if (snapshot?.project.parts.some((item) => item.id === part.id || (item.manufacturer === part.manufacturer && item.partNumber.replace(/[-\s]/g, "").toUpperCase() === part.partNumber.replace(/[-\s]/g, "").toUpperCase()))) {
        await updateProject((project) => {
          for (const projectPart of project.parts) {
            const matches = projectPart.id === part.id || (projectPart.manufacturer === part.manufacturer && projectPart.partNumber.replace(/[-\s]/g, "").toUpperCase() === part.partNumber.replace(/[-\s]/g, "").toUpperCase());
            if (!matches) continue;
            projectPart.modelAssetId = updated.modelAssetId;
            projectPart.attributes = saveModelPlacement(projectPart.attributes, placement);
          }
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

  return <div className="modal-backdrop"><section className="editor-dialog model-alignment-dialog" role="dialog" aria-modal="true"><header><div><Box size={15} /><strong>3D 하우징 정렬</strong><span>{part.partNumber} · 외피 중심과 핀별 인입 포트를 지정합니다.</span></div><IconButton title="닫기" onClick={onClose}><X size={14} /></IconButton></header><div className="model-alignment-body"><div className="model-alignment-preview"><Part3DPreview asset={asset} placement={placement} showCable onPlacementChange={setPlacement} pinNumbers={pinNumbers} selectedPinNumber={selectedPinNumber} placingPinPort={placingPinPort} rotatingConnector={rotatingConnector} onPinPortPlaced={() => setPlacingPinPort(false)} /><p>{rotatingConnector ? "빨강(X)·초록(Y)·파랑(Z) 회전 링을 드래그하세요." : "작은 청록색 포트점을 STEP 표면 위로 드래그하면 선택한 인입면의 수직 방향으로 정렬됩니다."}</p></div><ModelPlacementControls value={placement} onChange={setPlacement} pinNumbers={pinNumbers} selectedPinNumber={selectedPinNumber} onSelectedPinNumberChange={setSelectedPinNumber} placingPinPort={placingPinPort} onPlacingPinPortChange={(placing) => { setPlacingPinPort(placing); if (placing) setRotatingConnector(false); }} rotatingConnector={rotatingConnector} onRotatingConnectorChange={(rotating) => { setRotatingConnector(rotating); if (rotating) setPlacingPinPort(false); }} /></div>{error && <div className="connector-library-error">{error}</div>}<footer><button onClick={onClose}>취소</button><button className="primary" disabled={!asset || saving} onClick={() => void saveAlignment()}><Save size={13} />{saving ? "저장 중…" : "정렬 저장"}</button></footer></section></div>;
}
