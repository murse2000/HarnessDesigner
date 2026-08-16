import type { ProjectDocument } from "./domain/types";

export type AppFontFamily = "noto" | "system";
export type GridStyle = "dots" | "lines";
export type OutputLanguage = "ko-en" | "ko" | "en";
export type ValidationLevel = "error" | "warning" | "off";
export type ValidationCode = "PART_INCOMPLETE" | "SEGMENT_NODE_MISSING" | "SEGMENT_LENGTH" | "PART_MISSING" | "CABLE_CORE_CAPACITY" | "WIRE_PART_MISSING" | "PIN_MISSING" | "PIN_DUPLICATE" | "CONNECTION_INCOMPLETE" | "ROUTE_BROKEN" | "CABLE_CORE_INVALID" | "CABLE_CORE_DUPLICATE" | "TERMINATION_MISSING" | "HEAT_SHRINK_REQUIRED" | "TERMINAL_HOUSING_INCOMPATIBLE" | "TERMINAL_WIRE_INCOMPATIBLE";
export type ExportFormats = { dxf: boolean; pdf: boolean; jpg: boolean; xlsx: boolean; csv: boolean };

export interface ValidationProfile { id: string; name: string; rules: Record<ValidationCode, ValidationLevel> }
export interface DrawingTemplate {
  id: string; name: string; companyName: string; drawnBy: string; approvedBy: string; logoDataUrl: string;
  paper: "A3" | "A4"; outputLanguage: OutputLanguage; imageDpi: 150 | 300 | 600; fileNamePattern: string;
  showOnCanvas: boolean; canvasScalePercent: number;
}
export interface OutputJob { id: string; name: string; formats: ExportFormats }

export interface AppPreferences {
  fontFamily: AppFontFamily;
  fontSize: number;
  gridVisible: boolean;
  gridSnap: boolean;
  gridSize: number;
  gridStyle: GridStyle;
  mouseWheelZoom: "normal" | "inverted" | "disabled";
  shortcuts: { newProject: string; openProject: string; saveProject: string; undo: string; redo: string; settings: string };
  defaultImportDirectory: string;
  defaultExportDirectory: string;
  defaultPaper: "A3" | "A4";
  defaultOutputLanguage: OutputLanguage;
  defaultImageDpi: 150 | 300 | 600;
  exportFormats: ExportFormats;
  autosaveIntervalMinutes: number;
  recoveryRetention: number;
  validationProfiles: ValidationProfile[];
  activeValidationProfileId: string;
  drawingTemplates: DrawingTemplate[];
  activeDrawingTemplateId: string;
  outputJobs: OutputJob[];
  activeOutputJobId: string;
  lengthUnit: "mm" | "in";
  decimalPlaces: 0 | 1 | 2 | 3;
  cutLengthRoundingMm: number;
  bomWastePercent: number;
  bomLengthRoundingMm: number;
  threeDQuality: "low" | "medium" | "high";
  stepImportQuality: "coarse" | "standard" | "fine";
  libraryBackupRetention: number;
}

export const validationRuleLabels: Record<ValidationCode, string> = {
  PART_INCOMPLETE: "부품 필수 정보", SEGMENT_NODE_MISSING: "구간 연결 노드", SEGMENT_LENGTH: "구간 길이",
  PART_MISSING: "참조 부품", CABLE_CORE_CAPACITY: "케이블 심 수", WIRE_PART_MISSING: "전선 부품",
  PIN_MISSING: "핀 연결", PIN_DUPLICATE: "핀 중복", CONNECTION_INCOMPLETE: "양끝 핀 결선", ROUTE_BROKEN: "전선 경로",
  CABLE_CORE_INVALID: "케이블 코어 ID", CABLE_CORE_DUPLICATE: "케이블 코어 중복", TERMINATION_MISSING: "커넥터 종단 부품", HEAT_SHRINK_REQUIRED: "케이블 끝단 수축 튜브",
  TERMINAL_HOUSING_INCOMPATIBLE: "하우징-터미널 호환", TERMINAL_WIRE_INCOMPATIBLE: "터미널-전선 규격 호환",
};

const defaultValidationRules: Record<ValidationCode, ValidationLevel> = {
  PART_INCOMPLETE: "error", SEGMENT_NODE_MISSING: "error", SEGMENT_LENGTH: "error", PART_MISSING: "error",
  CABLE_CORE_CAPACITY: "warning", WIRE_PART_MISSING: "error", PIN_MISSING: "error", PIN_DUPLICATE: "error",
  CONNECTION_INCOMPLETE: "error", ROUTE_BROKEN: "error", CABLE_CORE_INVALID: "error", CABLE_CORE_DUPLICATE: "error",
  TERMINATION_MISSING: "error", HEAT_SHRINK_REQUIRED: "warning", TERMINAL_HOUSING_INCOMPATIBLE: "error", TERMINAL_WIRE_INCOMPATIBLE: "warning",
};
const defaultFormats: ExportFormats = { dxf: true, pdf: true, jpg: true, xlsx: true, csv: true };
const defaultTemplate: DrawingTemplate = {
  id: "default", name: "기본 제조 도면", companyName: "", drawnBy: "", approvedBy: "", logoDataUrl: "",
  paper: "A3", outputLanguage: "ko-en", imageDpi: 300, fileNamePattern: "{project}_{harness}_R{revision}",
  showOnCanvas: true, canvasScalePercent: 100,
};

export const defaultAppPreferences: AppPreferences = {
  fontFamily: "noto", fontSize: 12,
  gridVisible: true, gridSnap: true, gridSize: 10, gridStyle: "dots", mouseWheelZoom: "normal",
  shortcuts: { newProject: "CmdOrCtrl+N", openProject: "CmdOrCtrl+O", saveProject: "CmdOrCtrl+S", undo: "CmdOrCtrl+Z", redo: "CmdOrCtrl+Shift+Z", settings: "CmdOrCtrl+," },
  defaultImportDirectory: "", defaultExportDirectory: "", defaultPaper: "A3", defaultOutputLanguage: "ko-en", defaultImageDpi: 300,
  exportFormats: structuredClone(defaultFormats),
  autosaveIntervalMinutes: 5, recoveryRetention: 10,
  validationProfiles: [{ id: "default", name: "기본 제조 검증", rules: structuredClone(defaultValidationRules) }], activeValidationProfileId: "default",
  drawingTemplates: [structuredClone(defaultTemplate)], activeDrawingTemplateId: "default",
  outputJobs: [{ id: "default", name: "전체 제조 출력", formats: structuredClone(defaultFormats) }], activeOutputJobId: "default",
  lengthUnit: "mm", decimalPlaces: 1, cutLengthRoundingMm: 1, bomWastePercent: 0, bomLengthRoundingMm: 1,
  threeDQuality: "medium", stepImportQuality: "standard", libraryBackupRetention: 5,
};

const storageKey = "hd.preferences.v1";

export function normalizeAppPreferences(saved: Partial<AppPreferences>): AppPreferences {
  const preferences: AppPreferences = {
    ...structuredClone(defaultAppPreferences), ...saved,
    exportFormats: { ...defaultFormats, ...saved.exportFormats },
    shortcuts: { ...defaultAppPreferences.shortcuts, ...saved.shortcuts },
    validationProfiles: saved.validationProfiles?.length ? saved.validationProfiles.map((profile) => ({ ...profile, rules: { ...defaultValidationRules, ...profile.rules } })) : structuredClone(defaultAppPreferences.validationProfiles),
    drawingTemplates: saved.drawingTemplates?.length ? saved.drawingTemplates.map((template) => ({ ...defaultTemplate, ...template, canvasScalePercent: Math.min(200, Math.max(50, template.canvasScalePercent ?? defaultTemplate.canvasScalePercent)) })) : structuredClone(defaultAppPreferences.drawingTemplates),
    outputJobs: saved.outputJobs?.length ? saved.outputJobs.map((job) => ({ ...job, formats: { ...defaultFormats, ...job.formats } })) : structuredClone(defaultAppPreferences.outputJobs),
  };
  if (!preferences.validationProfiles.some((item) => item.id === preferences.activeValidationProfileId)) preferences.activeValidationProfileId = preferences.validationProfiles[0].id;
  if (!preferences.drawingTemplates.some((item) => item.id === preferences.activeDrawingTemplateId)) preferences.activeDrawingTemplateId = preferences.drawingTemplates[0].id;
  if (!preferences.outputJobs.some((item) => item.id === preferences.activeOutputJobId)) preferences.activeOutputJobId = preferences.outputJobs[0].id;
  return preferences;
}

export function loadAppPreferences(): AppPreferences {
  try { return normalizeAppPreferences(JSON.parse(window.localStorage.getItem(storageKey) ?? "{}")); }
  catch { return structuredClone(defaultAppPreferences); }
}

export function saveAppPreferences(preferences: AppPreferences): void { window.localStorage.setItem(storageKey, JSON.stringify(preferences)); }
export function activeValidationRules(preferences: AppPreferences) { return preferences.validationProfiles.find((item) => item.id === preferences.activeValidationProfileId)?.rules ?? defaultValidationRules; }
export function activeDrawingTemplate(preferences: AppPreferences) { return preferences.drawingTemplates.find((item) => item.id === preferences.activeDrawingTemplateId) ?? preferences.drawingTemplates[0]; }
export function activeOutputFormats(preferences: AppPreferences) { return preferences.outputJobs.find((item) => item.id === preferences.activeOutputJobId)?.formats ?? preferences.exportFormats; }

export function applyNewProjectDefaults(project: ProjectDocument, preferences: AppPreferences): void {
  project.settings.paper = preferences.defaultPaper;
  project.settings.outputLocales = preferences.defaultOutputLanguage === "ko-en" ? ["ko", "en"] : [preferences.defaultOutputLanguage];
  project.settings.imageDpi = preferences.defaultImageDpi;
}

export function formatLength(mm: number, preferences: AppPreferences): string {
  const value = preferences.lengthUnit === "in" ? mm / 25.4 : mm;
  return value.toLocaleString(undefined, { minimumFractionDigits: preferences.decimalPlaces, maximumFractionDigits: preferences.decimalPlaces });
}

export function shortcutMatches(event: KeyboardEvent, binding: string): boolean {
  const parts = binding.toLowerCase().split("+");
  const key = parts.at(-1);
  const command = navigator.platform.toLowerCase().includes("mac") ? event.metaKey : event.ctrlKey;
  return key === event.key.toLowerCase() && (!parts.includes("cmdorctrl") || command) && event.shiftKey === parts.includes("shift") && event.altKey === parts.includes("alt");
}

export function appFontStack(font: AppFontFamily): string {
  return font === "system" ? 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' : '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif';
}
