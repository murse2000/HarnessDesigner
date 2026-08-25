export type Theme2D = "light" | "dark";
export type Density2D = "compact" | "comfortable";
export type LengthUnit2D = "mm" | "in";
export type AutosaveMinutes2D = 0 | 1 | 5 | 10 | 30;
export type DrawingSheet2D = "A3" | "A2" | "A1";

export type Settings2D = {
  theme: Theme2D;
  density: Density2D;
  fontSize: number;
  rulersVisible: boolean;
  gridVisible: boolean;
  gridSnap: boolean;
  gridSize: number;
  drawingTemplateVisible: boolean;
  drawingSheet: DrawingSheet2D;
  lengthUnit: LengthUnit2D;
  autosaveMinutes: AutosaveMinutes2D;
};

export const defaultSettings2D: Settings2D = {
  theme: "light",
  density: "compact",
  fontSize: 11,
  rulersVisible: true,
  gridVisible: true,
  gridSnap: true,
  gridSize: 10,
  drawingTemplateVisible: true,
  drawingSheet: "A1",
  lengthUnit: "mm",
  autosaveMinutes: 5,
};

const storageKey = "harness-designer.rebuild2d.settings.v1";
const autosaveOptions: AutosaveMinutes2D[] = [0, 1, 5, 10, 30];

export function normalizeSettings2D(saved: Partial<Settings2D>): Settings2D {
  const fontSize = Number(saved.fontSize);
  const gridSize = Number(saved.gridSize);
  return {
    theme: saved.theme === "dark" ? "dark" : "light",
    density: saved.density === "comfortable" ? "comfortable" : "compact",
    fontSize: Number.isFinite(fontSize) ? Math.min(14, Math.max(10, fontSize)) : defaultSettings2D.fontSize,
    rulersVisible: typeof saved.rulersVisible === "boolean" ? saved.rulersVisible : defaultSettings2D.rulersVisible,
    gridVisible: typeof saved.gridVisible === "boolean" ? saved.gridVisible : defaultSettings2D.gridVisible,
    gridSnap: typeof saved.gridSnap === "boolean" ? saved.gridSnap : defaultSettings2D.gridSnap,
    gridSize: Number.isFinite(gridSize) ? Math.min(100, Math.max(5, gridSize)) : defaultSettings2D.gridSize,
    drawingTemplateVisible: typeof saved.drawingTemplateVisible === "boolean" ? saved.drawingTemplateVisible : defaultSettings2D.drawingTemplateVisible,
    drawingSheet: saved.drawingSheet === "A3" || saved.drawingSheet === "A2" ? saved.drawingSheet : "A1",
    lengthUnit: saved.lengthUnit === "in" ? "in" : "mm",
    autosaveMinutes: autosaveOptions.includes(saved.autosaveMinutes as AutosaveMinutes2D)
      ? saved.autosaveMinutes as AutosaveMinutes2D
      : defaultSettings2D.autosaveMinutes,
  };
}

export function loadSettings2D(): Settings2D {
  try {
    return normalizeSettings2D(JSON.parse(window.localStorage.getItem(storageKey) ?? "{}"));
  } catch {
    return { ...defaultSettings2D };
  }
}

export function saveSettings2D(settings: Settings2D) {
  window.localStorage.setItem(storageKey, JSON.stringify(normalizeSettings2D(settings)));
}

export function displayLength(mm: number, unit: LengthUnit2D) {
  return unit === "in" ? mm / 25.4 : mm;
}

export function storedLength(value: number, unit: LengthUnit2D) {
  return unit === "in" ? value * 25.4 : value;
}
