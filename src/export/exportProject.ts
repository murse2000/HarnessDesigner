import { open } from "@tauri-apps/plugin-dialog";
import { join } from "@tauri-apps/api/path";
import { jsPDF } from "jspdf";
import { buildBom, buildCutList, buildHarnessBom } from "../domain/calculations";
import { buildContinuityTest, buildTestResultExport, testRunStatus } from "../domain/manufacturing";
import type { BomRow, ContinuityTestResultExportRow, ContinuityTestRow, CutListRow, ProjectDocument } from "../domain/types";
import { validateProject } from "../domain/validation";
import { backendInvoke, isTauri } from "../platform";
import { activeDrawingTemplate, activeOutputFormats, activeValidationRules, loadAppPreferences } from "../preferences";
import { latestHarnessRelease } from "../domain/release";
import { buildCostRows, buildCostSummary, buildEquipmentRows, buildSystemNetlist, projectForVariant, rowsToDelimited } from "../domain/production";
import { buildBomSvgPages, buildFormboardDxf, buildFormboardSvgPages, buildHarnessDxf, buildHarnessSvg, buildWorkInstructionSvgPages, svgToCanvas } from "./drawing";

const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

function bomCsv(rows: BomRow[]): string {
  return [
    ["Part Number", "Manufacturer", "Description", "Category", "Specification", "Unit", "Quantity", "Harnesses"],
    ...rows.map((row) => [row.partNumber, row.manufacturer, row.description, row.category, row.specification, row.unit, row.quantity, row.harnesses.join(", ")]),
  ].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function cutCsv(rows: CutListRow[]): string {
  return [
    ["Harness", "Wire", "From", "To", "Part Number", "Color", "Gauge", "Length (mm)", "From Strip (mm)", "To Strip (mm)", "Notes"],
    ...rows.map((row) => [row.harnessNumber, row.reference, row.from, row.to, row.partNumber, row.color, row.gauge, row.lengthMm, row.startStripLengthMm, row.endStripLengthMm, row.notes]),
  ].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function continuityCsv(rows: ContinuityTestRow[]): string {
  return [
    ["Harness", "Circuit", "From Connector", "From Pin", "To Connector", "To Pin", "Color", "Gauge", "Cable Core", "Expected", "Result"],
    ...rows.map((row) => [row.harnessNumber, row.reference, row.fromConnector, row.fromPin, row.toConnector, row.toPin, row.color, row.gauge, row.cableCore, row.expected, ""]),
  ].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function continuityResultCsv(rows: ContinuityTestResultExportRow[]): string {
  return [
    ["Harness", "Revision", "Serial Number", "Operator", "Started At", "Completed At", "Circuit", "From Connector", "From Pin", "To Connector", "To Pin", "Expected", "Result", "Note"],
    ...rows.map((row) => [row.harnessNumber, row.revision, row.serialNumber, row.operator, row.startedAt, row.completedAt, row.reference, row.fromConnector, row.fromPin, row.toConnector, row.toPin, row.expected, row.result.toUpperCase(), row.note]),
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
  const tests = buildContinuityTest(outputProject);
  const testResults = buildTestResultExport(outputProject);
  await document.fonts.ready;
  const [paperWidthMm, paperHeightMm] = outputProject.settings.paper === "A4" ? [297, 210] : [420, 297];
  const canvasWidth = Math.round((paperWidthMm / 25.4) * outputProject.settings.imageDpi);
  const canvasHeight = Math.round((paperHeightMm / 25.4) * outputProject.settings.imageDpi);

  for (const harness of outputProject.harnesses) {
    const pattern = template?.fileNamePattern || "{project}_{harness}_R{revision}";
    const base = pattern.replaceAll("{project}", outputProject.projectNumber).replaceAll("{harness}", harness.number).replaceAll("{revision}", harness.revision).replaceAll(/[^a-zA-Z0-9_.-]/g, "_");
    const tasks: Promise<unknown>[] = [];
    if (formats.dxf) {
      tasks.push(backendInvoke("write_text_file", { path: await join(directory, `${base}.dxf`), content: buildHarnessDxf(outputProject, harness) }));
      tasks.push(backendInvoke("write_text_file", { path: await join(directory, `${base}_FORMBOARD_1TO1.dxf`), content: buildFormboardDxf(outputProject, harness) }));
    }
    if (formats.jpg || formats.pdf) {
      const canvas = await svgToCanvas(applyDrawingTemplate(buildHarnessSvg(outputProject, harness, template), template), canvasWidth, canvasHeight);
      const jpeg = canvas.toDataURL("image/jpeg", 0.94);
      if (formats.jpg) tasks.push(backendInvoke("write_binary_file", { path: await join(directory, `${base}.jpg`), content: await dataUrlBytes(jpeg) }));
      if (formats.pdf) {
        const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: outputProject.settings.paper.toLowerCase(), compress: true });
        pdf.addImage(jpeg, "JPEG", 0, 0, paperWidthMm, paperHeightMm, undefined, "FAST");
        tasks.push(backendInvoke("write_binary_file", { path: await join(directory, `${base}.pdf`), content: [...new Uint8Array(pdf.output("arraybuffer"))] }));
        const formboardPdf = new jsPDF({ orientation: "landscape", unit: "mm", format: outputProject.settings.paper.toLowerCase(), compress: true });
        const formboardPages = buildFormboardSvgPages(outputProject, harness, outputProject.settings.paper, { overlapMm: template?.formboardOverlapMm, calibrationLengthMm: template?.formboardCalibrationLengthMm, connectorTables: template?.formboardConnectorTables });
        for (let index = 0; index < formboardPages.length; index += 1) {
          if (index > 0) formboardPdf.addPage(outputProject.settings.paper.toLowerCase(), "landscape");
          const pageCanvas = await svgToCanvas(formboardPages[index], canvasWidth, canvasHeight);
          formboardPdf.addImage(pageCanvas.toDataURL("image/jpeg", 0.94), "JPEG", 0, 0, paperWidthMm, paperHeightMm, undefined, "FAST");
        }
        tasks.push(backendInvoke("write_binary_file", { path: await join(directory, `${base}_FORMBOARD_1TO1.pdf`), content: [...new Uint8Array(formboardPdf.output("arraybuffer"))] }));
      }
    }
    await Promise.all(tasks);
  }

  const projectTasks: Promise<unknown>[] = [];
  if (formats.csv) {
    projectTasks.push(backendInvoke("write_text_file", { path: await join(directory, `${project.projectNumber}_BOM.csv`), content: bomCsv(bom) }));
    projectTasks.push(backendInvoke("write_text_file", { path: await join(directory, `${project.projectNumber}_CUTLIST.csv`), content: cutCsv(cuts) }));
    projectTasks.push(backendInvoke("write_text_file", { path: await join(directory, `${project.projectNumber}_CONTINUITY_TEST.csv`), content: continuityCsv(tests) }));
    if (testResults.length) projectTasks.push(backendInvoke("write_text_file", { path: await join(directory, `${project.projectNumber}_CONTINUITY_RESULTS.csv`), content: continuityResultCsv(testResults) }));
    projectTasks.push(backendInvoke("write_text_file", { path: await join(directory, `${project.projectNumber}_WORK_INSTRUCTIONS.csv`), content: rowsToDelimited(outputProject.workInstructions.map((instruction) => ({ sequence: instruction.sequence, harness: outputProject.harnesses.find((item) => item.id === instruction.harnessId)?.number ?? "", kind: instruction.kind, title: instruction.title, estimatedMinutes: instruction.estimatedMinutes, description: instruction.description })), ",") }));
    projectTasks.push(backendInvoke("write_text_file", { path: await join(directory, `${project.projectNumber}_COST_ESTIMATE.csv`), content: rowsToDelimited(buildCostRows(outputProject).map((row) => ({ partNumber: row.partNumber, description: row.description, quantity: row.quantity, unit: row.unit, unitCost: row.unitCost, extendedCost: row.extendedCost, supplier: row.supplier, leadTimeDays: row.leadTimeDays ?? "" })), ",") }));
    for (const profile of outputProject.equipmentProfiles.filter((item) => item.enabled)) {
      projectTasks.push(backendInvoke("write_text_file", { path: await join(directory, `${project.projectNumber}_EQUIPMENT_${profile.name.replaceAll(/[^a-zA-Z0-9가-힣_.-]/g, "_")}.csv`), content: rowsToDelimited(buildEquipmentRows(outputProject, profile), profile.delimiter, profile.includeHeader) }));
    }
    for (const system of outputProject.systems) {
      const variants = outputProject.variants.length ? outputProject.variants : [undefined];
      for (const variant of variants) {
        const suffix = variant ? `_VARIANT_${variant.name.replaceAll(/[^a-zA-Z0-9가-힣_.-]/g, "_")}` : "";
        projectTasks.push(backendInvoke("write_text_file", { path: await join(directory, `${project.projectNumber}_SYSTEM_${system.reference}${suffix}_NETLIST.csv`), content: rowsToDelimited(buildSystemNetlist(outputProject, system, variant), ",") }));
      }
    }
    for (const variant of outputProject.variants) {
      const variantProject = projectForVariant(outputProject, variant);
      projectTasks.push(backendInvoke("write_text_file", { path: await join(directory, `${project.projectNumber}_VARIANT_${variant.name.replaceAll(/[^a-zA-Z0-9가-힣_.-]/g, "_")}_BOM.csv`), content: bomCsv(buildBom(variantProject, manufacturing)) }));
    }
  }
  if (formats.xlsx) projectTasks.push(backendInvoke("export_xlsx", { path: await join(directory, `${project.projectNumber}_MANUFACTURING.xlsx`), bom, harnessBom, cuts, tests, testResults }));
  if (formats.pdf) {
    const bomPdf = new jsPDF({ orientation: "landscape", unit: "mm", format: outputProject.settings.paper.toLowerCase(), compress: true });
    const bomPages = buildBomSvgPages(outputProject, bom, template).map((page) => applyDrawingTemplate(page, template));
    for (let index = 0; index < bomPages.length; index += 1) {
      if (index > 0) bomPdf.addPage(outputProject.settings.paper.toLowerCase(), "landscape");
      const canvas = await svgToCanvas(bomPages[index], canvasWidth, canvasHeight);
      bomPdf.addImage(canvas.toDataURL("image/jpeg", 0.94), "JPEG", 0, 0, paperWidthMm, paperHeightMm, undefined, "FAST");
    }
    projectTasks.push(backendInvoke("write_binary_file", { path: await join(directory, `${project.projectNumber}_BOM.pdf`), content: [...new Uint8Array(bomPdf.output("arraybuffer"))] }));
    const instructionPdf = new jsPDF({ orientation: "landscape", unit: "mm", format: outputProject.settings.paper.toLowerCase(), compress: true });
    const instructionPages = buildWorkInstructionSvgPages(outputProject);
    for (let index = 0; index < instructionPages.length; index += 1) {
      if (index > 0) instructionPdf.addPage(outputProject.settings.paper.toLowerCase(), "landscape");
      const canvas = await svgToCanvas(instructionPages[index], canvasWidth, canvasHeight);
      instructionPdf.addImage(canvas.toDataURL("image/jpeg", 0.94), "JPEG", 0, 0, paperWidthMm, paperHeightMm, undefined, "FAST");
    }
    projectTasks.push(backendInvoke("write_binary_file", { path: await join(directory, `${project.projectNumber}_WORK_INSTRUCTIONS.pdf`), content: [...new Uint8Array(instructionPdf.output("arraybuffer"))] }));
  }
  const releaseManifest = {
    projectNumber: outputProject.projectNumber,
    projectName: outputProject.name,
    generatedAt: new Date().toISOString(),
    schemaVersion: outputProject.schemaVersion,
    systems: outputProject.systems.map((system) => ({ reference: system.reference, name: system.name, harnessInstances: system.harnessInstances.length })),
    variants: outputProject.variants.map((variant) => ({ name: variant.name, disabledConductors: variant.disabledConductorIds.length, disabledAccessories: variant.disabledAccessoryIds.length })),
    estimatedCost: buildCostSummary(outputProject),
    harnesses: outputProject.harnesses.map((harness) => {
      const release = latestHarnessRelease(outputProject, harness.id);
      return { harnessNumber: harness.number, harnessName: harness.name, revision: harness.revision, status: harness.releaseStatus ?? "draft", fingerprint: release?.revision === harness.revision ? release.fingerprint : null, releasedAt: release?.revision === harness.revision ? release.releasedAt : null, releasedBy: release?.revision === harness.revision ? release.releasedBy : null };
    }),
    testRuns: (outputProject.testRuns ?? []).map((run) => ({ harnessNumber: run.harnessNumber, revision: run.revision, serialNumber: run.serialNumber, operator: run.operator, startedAt: run.startedAt, completedAt: run.completedAt ?? null, status: testRunStatus(run) })),
  };
  projectTasks.push(backendInvoke("write_text_file", { path: await join(directory, `${project.projectNumber}_RELEASE_MANIFEST.json`), content: JSON.stringify(releaseManifest, null, 2) }));
  await Promise.all(projectTasks);
  return directory;
}
