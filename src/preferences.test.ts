import { beforeEach, describe, expect, it } from "vitest";
import { activeOutputFormats, applyNewProjectDefaults, defaultAppPreferences, loadAppPreferences, normalizeAppPreferences, saveAppPreferences } from "./preferences";
import { createProject } from "./domain/sample";

describe("app preferences", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    const storage: Storage = {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: (key) => values.get(key) ?? null,
      key: (index) => [...values.keys()][index] ?? null,
      removeItem: (key) => { values.delete(key); },
      setItem: (key, value) => { values.set(key, value); },
    };
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: storage,
    });
  });

  it("일부 값만 저장된 이전 설정에 기본값을 병합한다", () => {
    window.localStorage.setItem("hd.preferences.v1", JSON.stringify({ gridSize: 24, exportFormats: { jpg: false } }));
    const preferences = loadAppPreferences();
    expect(preferences.gridSize).toBe(24);
    expect(preferences.exportFormats.jpg).toBe(false);
    expect(preferences.exportFormats.dxf).toBe(true);
  });

  it("새 프로젝트에 출력 기본값을 적용한다", () => {
    const preferences = { ...defaultAppPreferences, defaultPaper: "A4" as const, defaultOutputLanguage: "en" as const, defaultImageDpi: 600 as const };
    saveAppPreferences(preferences);
    const project = createProject();
    applyNewProjectDefaults(project, loadAppPreferences());
    expect(project.settings).toMatchObject({ paper: "A4", outputLocales: ["en"], imageDpi: 600 });
  });

  it("이전 설정에 검증·템플릿·복구 기본값을 추가한다", () => {
    const preferences = normalizeAppPreferences({ gridSize: 20 });
    expect(preferences.autosaveIntervalMinutes).toBe(5);
    expect(preferences.validationProfiles[0].rules.PIN_DUPLICATE).toBe("error");
    expect(preferences.drawingTemplates[0].fileNamePattern).toContain("{harness}");
    expect(preferences.drawingTemplates[0]).toMatchObject({ showOnCanvas: true, canvasScalePercent: 100 });
    expect(preferences.shortcuts.addLabel).toBe("L");
    expect(preferences.shortcuts.deleteSelection).toBe("Delete");
    expect(preferences.shortcuts.powerTools).toBe("CmdOrCtrl+Shift+U");
    expect(preferences.threeDViewpoints).toEqual([]);
  });

  it("사용자 3D 시점을 유지하고 잘못된 항목은 제거한다", () => {
    const valid = { id: "view-1", name: "검사 시점", position: [10, 20, 30] as [number, number, number], target: [0, 0, 0] as [number, number, number], up: [0, 1, 0] as [number, number, number] };
    const invalid = { ...valid, id: "view-2", name: "" };
    expect(normalizeAppPreferences({ threeDViewpoints: [valid, invalid] }).threeDViewpoints).toEqual([valid]);
  });

  it("가져온 도면 템플릿 크기를 지원 범위로 제한한다", () => {
    const legacyTemplate = { ...defaultAppPreferences.drawingTemplates[0], canvasScalePercent: 250 };
    expect(normalizeAppPreferences({ drawingTemplates: [legacyTemplate] }).drawingTemplates[0].canvasScalePercent).toBe(200);
  });

  it("활성 출력 작업의 형식을 사용한다", () => {
    const preferences = structuredClone(defaultAppPreferences);
    preferences.outputJobs[0].formats.jpg = false;
    expect(activeOutputFormats(preferences).jpg).toBe(false);
  });
});
