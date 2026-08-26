import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Canvas2D } from "./Canvas2D";
import { preparePaperDrawing, type PaperDrawing } from "./drawingOutput";
import type { Project2D } from "./model";
import type { Settings2D } from "./settings";

const emptySelection = { componentIds: [], connectionIds: [], cableRunIds: [] };
const noop = () => undefined;

export function prepareProjectPaperDrawings(project: Project2D, settings: Settings2D): PaperDrawing[] {
  const host = document.createElement("div");
  host.className = "hd2-output-render-host";
  host.style.cssText = "position:fixed;left:-100000px;top:0;width:1600px;height:1000px;pointer-events:none;";
  document.body.append(host);
  const root = createRoot(host);

  try {
    return project.harnesses.map((harness) => {
      flushSync(() => root.render(<Canvas2D
        key={harness.id}
        harness={harness}
        projectNumber={project.projectNumber}
        projectName={project.name}
        settings={settings}
        selection={emptySelection}
        selectedLabel={null}
        selectedAnnotationId={null}
        selectedHeatShrinkId={null}
        onSelectionChange={noop}
        onSelectComponentLabel={noop}
        onSelectAnnotation={noop}
        onSelectHeatShrink={noop}
        onMoveSelection={noop}
        onMoveConnectionRoute={noop}
        onMoveCableRunRoute={noop}
        onMoveCableRunBreakout={noop}
        onMoveCableRunLabel={noop}
        onMoveComponentLabel={noop}
        onMoveComponentPinMap={noop}
        onResizeComponent={noop}
        onRenameConnection={noop}
        onUpdateProjectMetadata={noop}
        onUpdateHarnessMetadata={noop}
        onUpdateTitleBlock={noop}
        onUpdateAnnotation={noop}
        onUpdateHeatShrink={noop}
        onConnect={noop}
        onMousePositionChange={noop}
      />));
      const canvas = host.querySelector<SVGSVGElement>(".hd2-canvas");
      if (!canvas) throw new Error(`${harness.partNumber} 2D 도면을 렌더링하지 못했습니다.`);
      return preparePaperDrawing(canvas, settings.drawingSheet);
    });
  } finally {
    root.unmount();
    host.remove();
  }
}
