import { open } from "@tauri-apps/plugin-dialog";
import { join } from "@tauri-apps/api/path";
import { jsPDF } from "jspdf";
import { buildBom, buildCutList, buildHarnessBom } from "../domain/calculations";
import type { BomRow, CutListRow, ProjectDocument } from "../domain/types";
import { validateProject } from "../domain/validation";
import { backendInvoke, isTauri } from "../platform";
import { activeDrawingTemplate, activeOutputFormats, activeValidationRules, loadAppPreferences } from "../preferences";
import { buildBomSvgPages, buildHarnessDxf, buildHarnessSvg, svgToCanvas } from "./drawing";

const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

function bomCsv(rows: BomRow[]): string {
  return [
    ["Part Number", "Manufacturer", "Description", "Category", "Specification", "Unit", "Quantity", "Harnesses"],
    ...rows.map((row) => [row.partNumber, row.manufacturer, row.description, row.category, row.specification, row.unit, row.quantity, row.harnesses.join(", ")]),
  ].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function cutCsv(rows: CutListRow[]): string {
  return [
    ["Harness", "Wire", "From", "To", "Part Number", "Color", "Gauge", "Length (mm)"],
    ...rows.map((row) => [row.harnessNumber, row.reference, row.from, row.to, row.partNumber, row.color, row.gauge, row.lengthMm]),
  ].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

async function dataUrlBytes(dataUrl: string): Promise<number[]> {
  const buffer = await fetch(dataUrl).then((response) => response.arrayBuffer());
  return [...new Uint8Array(buffer)];
}

const xmlText = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
function applyDrawingTemplate(svg: string, template: ReturnType<typeof activeDrawingTemplate>): string {
  if (!template) return svg;
  let result = template.companyName ? svg.replace("HARNESS DESIGNER</text>", `${xmlText(template.companyName)}</text>`) : svg;
  const titleMeta = `<text x="830" y="718" style="font-family:'Noto Sans KR',sans-serif;font-size:8px;fill:#18334c">DRAWN ${xmlText(template.drawnBy || "-")} · APPROVED ${xmlText(template.approvedBy || "-")}</text>`;
  const logo = template.logoDataUrl.startsWith("data:image/") ? `<image href="${template.logoDataUrl.replaceAll('"', "&quot;")}" x="1018" y="674" width="52" height="32" preserveAspectRatio="xMidYMid meet"/>` : "";
  result = result.replace("</svg>", `${titleMeta}${logo}</svg>`);
  return result;
}

export async function exportProject(project: ProjectDocument): Promise<string> {
  const preferences = loadAppPreferences();
  const template = activeDrawingTemplate(preferences);
  const formats = activeOutputFormats(preferences);
  const outputProject = structuredClone(project);
  if (template) {
    outputProject.settings.paper = template.paper;
    outputProject.settings.outputLocales = template.outputLanguage === "ko-en" ? ["ko", "en"] : [template.outputLanguage];
    outputProject.settings.imageDpi = template.imageDpi;
  }
  const blockingIssues = validateProject(outputProject, activeValidationRules(preferences)).filter((issue) => issue.severity === "error");
  if (blockingIssues.length) throw new Error(`출력을 차단하는 검증 오류가 ${blockingIssues.length}개 있습니다.`);
  if (!isTauri()) throw new Error("일괄 출력은 데스크톱 앱에서 사용할 수 있습니다.");
  if (!Object.values(formats).some(Boolean)) throw new Error("환경설정에서 하나 이상의 출력 형식을 선택하세요.");
  const directory = await open({ directory: true, multiple: false, defaultPath: preferences.defaultExportDirectory || undefined, title: "출력 폴더 선택" });
  if (!directory) return "취소됨";
  const manufacturing = { cutLengthRoundingMm: preferences.cutLengthRoundingMm, bomWastePercent: preferences.bomWastePercent, bomLengthRoundingMm: preferences.bomLengthRoundingMm };
  const bom = buildBom(outputProject, manufacturing);
  const harnessBom = buildHarnessBom(outputProject, manufacturing);
  const cuts = buildCutList(outputProject, manufacturing);
  await document.fonts.ready;
  const [paperWidthMm, paperHeightMm] = outputProject.settings.paper === "A4" ? [297, 210] : [420, 297];
  const canvasWidth = Math.round((paperWidthMm / 25.4) * outputProject.settings.imageDpi);
  const canvasHeight = Math.round((paperHeightMm / 25.4) * outputProject.settings.imageDpi);

  for (const harness of outputProject.harnesses) {
    const pattern = template?.fileNamePattern || "{project}_{harness}_R{revision}";
    const base = pattern.replaceAll("{project}", outputProject.projectNumber).replaceAll("{harness}", harness.number).replaceAll("{revision}", harness.revision).replaceAll(/[^a-zA-Z0-9_.-]/g, "_");
    const tasks: Promise<unknown>[] = [];
    if (formats.dxf) tasks.push(backendInvoke("write_text_file", { path: await join(directory, `${base}.dxf`), content: buildHarnessDxf(outputProject, harness) }));
    if (formats.jpg || formats.pdf) {
      const canvas = await svgToCanvas(applyDrawingTemplate(buildHarnessSvg(outputProject, harness, template), template), canvasWidth, canvasHeight);
      const jpeg = canvas.toDataURL("image/jpeg", 0.94);
      if (formats.jpg) tasks.push(backendInvoke("write_binary_file", { path: await join(directory, `${base}.jpg`), content: await dataUrlBytes(jpeg) }));
      if (formats.pdf) {
        const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: outputProject.settings.paper.toLowerCase(), compress: true });
        pdf.addImage(jpeg, "JPEG", 0, 0, paperWidthMm, paperHeightMm, undefined, "FAST");
        tasks.push(backendInvoke("write_binary_file", { path: await join(directory, `${base}.pdf`), content: [...new Uint8Array(pdf.output("arraybuffer"))] }));
      }
    }
    await Promise.all(tasks);
  }

  const projectTasks: Promise<unknown>[] = [];
  if (formats.csv) {
    projectTasks.push(backendInvoke("write_text_file", { path: await join(directory, `${project.projectNumber}_BOM.csv`), content: bomCsv(bom) }));
    projectTasks.push(backendInvoke("write_text_file", { path: await join(directory, `${project.projectNumber}_CUTLIST.csv`), content: cutCsv(cuts) }));
  }
  if (formats.xlsx) projectTasks.push(backendInvoke("export_xlsx", { path: await join(directory, `${project.projectNumber}_MANUFACTURING.xlsx`), bom, harnessBom, cuts }));
  if (formats.pdf) {
    const bomPdf = new jsPDF({ orientation: "landscape", unit: "mm", format: outputProject.settings.paper.toLowerCase(), compress: true });
    const bomPages = buildBomSvgPages(outputProject, bom, template).map((page) => applyDrawingTemplate(page, template));
    for (let index = 0; index < bomPages.length; index += 1) {
      if (index > 0) bomPdf.addPage(outputProject.settings.paper.toLowerCase(), "landscape");
      const canvas = await svgToCanvas(bomPages[index], canvasWidth, canvasHeight);
      bomPdf.addImage(canvas.toDataURL("image/jpeg", 0.94), "JPEG", 0, 0, paperWidthMm, paperHeightMm, undefined, "FAST");
    }
    projectTasks.push(backendInvoke("write_binary_file", { path: await join(directory, `${project.projectNumber}_BOM.pdf`), content: [...new Uint8Array(bomPdf.output("arraybuffer"))] }));
  }
  await Promise.all(projectTasks);
  return directory;
}
