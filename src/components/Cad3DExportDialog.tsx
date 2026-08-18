import { join } from "@tauri-apps/api/path";
import { save } from "@tauri-apps/plugin-dialog";
import { Box, Cable, CheckCircle2, FileArchive, Save, X } from "lucide-react";
import { useMemo, useState } from "react";
import { buildHarnessStep } from "../export/step3d";
import { buildSolidWorksRoutingPackage } from "../export/solidWorksRouting";
import { backendInvoke, isTauri } from "../platform";
import { useProjectStore } from "../store/projectStore";
import { IconButton } from "./common";

type CadExportMode = "step" | "solidworks";

export function Cad3DExportDialog({ onClose, onComplete }: { onClose: () => void; onComplete?: (path: string) => void }) {
  const { snapshot, activeHarnessId, preferences } = useProjectStore();
  const [harnessId, setHarnessId] = useState(activeHarnessId ?? snapshot?.project.harnesses[0]?.id ?? "");
  const [mode, setMode] = useState<CadExportMode>("step");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedPath, setCompletedPath] = useState<string | null>(null);
  const harness = snapshot?.project.harnesses.find((item) => item.id === harnessId);
  const modelCoverage = useMemo(() => {
    if (!snapshot || !harness) return { registered: 0, total: 0 };
    const connectors = harness.nodes.filter((node) => node.kind === "connector");
    return {
      total: connectors.length,
      registered: connectors.filter((node) => {
        const part = snapshot.project.parts.find((item) => item.id === node.partId);
        return snapshot.project.modelAssets.some((asset) => asset.id === part?.modelAssetId && asset.sourceDataBase64);
      }).length,
    };
  }, [harness, snapshot]);

  const exportCad = async () => {
    if (!snapshot || !harness) return;
    if (!isTauri()) { setError("3D CAD 출력은 데스크톱 앱에서 사용할 수 있습니다."); return; }
    setWorking(true);
    setError(null);
    setCompletedPath(null);
    try {
      const extension = mode === "step" ? "step" : "zip";
      const fileName = `${snapshot.project.projectNumber}_${harness.number}_${mode === "step" ? "3D_STATIC" : "SOLIDWORKS_ROUTING"}.${extension}`;
      const defaultPath = preferences.defaultExportDirectory ? await join(preferences.defaultExportDirectory, fileName) : fileName;
      const path = await save({
        defaultPath,
        title: mode === "step" ? "3D STEP 저장" : "SolidWorks Routing 패키지 저장",
        filters: [{ name: mode === "step" ? "STEP AP242" : "SolidWorks Routing package", extensions: [extension] }],
      });
      if (!path) return;
      if (mode === "step") {
        await backendInvoke("write_text_file", { path, content: buildHarnessStep(snapshot.project, harness) });
      } else {
        const output = buildSolidWorksRoutingPackage(snapshot.project, harness);
        await backendInvoke("export_solidworks_routing_package", { path, entries: output.entries, fromToRows: output.fromToRows, cableLibraryRows: output.cableLibraryRows });
      }
      setCompletedPath(path);
      onComplete?.(path);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setWorking(false);
    }
  };

  if (!snapshot) return null;
  return <div className="modal-backdrop"><section className="cad-3d-export-dialog" role="dialog" aria-modal="true" aria-label="3D CAD 출력">
    <header><div><Box size={15} /><strong>3D CAD 출력</strong><span>STEP AP242 · SOLIDWORKS ROUTING</span></div><IconButton title="닫기" onClick={onClose}><X size={14} /></IconButton></header>
    <main>
      <label className="cad-export-harness"><span>출력 하네스</span><select value={harnessId} onChange={(event) => { setHarnessId(event.target.value); setCompletedPath(null); setError(null); }}>{snapshot.project.harnesses.map((item) => <option key={item.id} value={item.id}>{item.number} · {item.name} · REV {item.revision}</option>)}</select></label>
      <div className="cad-export-modes">
        <button className={mode === "step" ? "active" : ""} onClick={() => { setMode("step"); setCompletedPath(null); setError(null); }}><Box size={24} /><strong>3D STEP</strong><span>간섭 검토와 형상 공유용 정적 AP242 파일</span><small>커넥터 · 전선 · 외피 · 수축튜브 · 부자재</small></button>
        <button className={mode === "solidworks" ? "active" : ""} onClick={() => { setMode("solidworks"); setCompletedPath(null); setError(null); }}><FileArchive size={24} /><strong>SolidWorks Routing</strong><span>커넥터 이동 후 케이블 재배치를 위한 교환 패키지</span><small>From-To XLSX · Cable Library · CPoint · Route · STEP</small></button>
      </div>
      {harness ? <section className="cad-export-summary"><div><Cable size={14} /><span><strong>{harness.nodes.length}</strong> 노드</span><span><strong>{harness.conductors.length}</strong> 연결</span><span><strong>{harness.segments.length}</strong> 경로</span></div><p>원본 커넥터 STEP <strong>{modelCoverage.registered} / {modelCoverage.total}</strong>{modelCoverage.registered < modelCoverage.total && <em> · STEP이 없는 커넥터는 정적 출력에서 치수 대체 형상으로 표시됩니다.</em>}</p></section> : <p className="cad-export-error">출력할 하네스를 선택하세요.</p>}
      {mode === "solidworks" && <p className="cad-export-note">Routing 패키지는 네이티브 SLDASM이 아닙니다. 처음 사용하는 커넥터 STEP은 패키지의 CPoint 좌표와 방향을 Routing Library Manager에 한 번 등록해야 하며, 이후 생성한 Routing 조립품에서는 커넥터 이동 시 케이블이 갱신됩니다.</p>}
      {error && <p className="cad-export-error">{error}</p>}
      {completedPath && <div className="cad-export-success"><CheckCircle2 size={15} /><span>출력 완료</span><code>{completedPath}</code></div>}
    </main>
    <footer><span>{working ? "3D CAD 산출물 생성 중…" : completedPath ? "파일 생성이 완료되었습니다." : "내부 길이 단위 mm · 오른손 좌표계 · +Y Up"}</span><button onClick={onClose}>닫기</button><button className="primary" disabled={working || !harness} onClick={() => void exportCad()}><Save size={13} />{working ? "생성 중…" : mode === "step" ? "STEP 저장" : "Routing ZIP 저장"}</button></footer>
  </section></div>;
}
