import { FileImage } from "lucide-react";
import { useMemo } from "react";
import { buildHarnessSvg } from "../export/drawing";
import { translate } from "../i18n";
import { useProjectStore } from "../store/projectStore";
import { PanelHeader } from "./common";

export function PreviewView() {
  const { snapshot, activeHarnessId, locale } = useProjectStore();
  const harness = snapshot?.project.harnesses.find((item) => item.id === activeHarnessId);
  const svg = useMemo(() => snapshot && harness ? buildHarnessSvg(snapshot.project, harness) : "", [snapshot, harness]);
  if (!snapshot || !harness) return null;
  return <div className="preview-view"><PanelHeader title={translate(locale, "preview")} icon={<FileImage size={14} />} view="preview" sessionId={snapshot.sessionId} harnessId={harness.id} /><div className="paper-stage"><div className="paper" dangerouslySetInnerHTML={{ __html: svg }} /></div></div>;
}
