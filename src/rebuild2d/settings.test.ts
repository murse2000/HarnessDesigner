import { beforeEach, describe, expect, it } from "vitest";
import { defaultSettings2D, loadSettings2D, normalizeSettings2D, saveSettings2D } from "./settings";

describe("2D 앱 환경설정", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        get length() { return values.size; },
        clear: () => values.clear(),
        getItem: (key: string) => values.get(key) ?? null,
        key: (index: number) => [...values.keys()][index] ?? null,
        removeItem: (key: string) => { values.delete(key); },
        setItem: (key: string, value: string) => { values.set(key, value); },
      } satisfies Storage,
    });
  });

  it("잘못된 저장값을 지원 범위로 보정한다", () => {
    const settings = normalizeSettings2D({ fontSize: 40, gridSize: 2, autosaveMinutes: 7 } as unknown as Parameters<typeof normalizeSettings2D>[0]);

    expect(settings.fontSize).toBe(14);
    expect(settings.gridSize).toBe(5);
    expect(settings.autosaveMinutes).toBe(defaultSettings2D.autosaveMinutes);
  });

  it("사용자 로컬 저장소에 저장하고 다시 읽는다", () => {
    saveSettings2D({ ...defaultSettings2D, theme: "dark", gridVisible: false, rulersVisible: false, gridSize: 25, drawingTemplateVisible: false, drawingSheet: "A2" });

    expect(loadSettings2D()).toMatchObject({ theme: "dark", gridVisible: false, rulersVisible: false, gridSize: 25, drawingTemplateVisible: false, drawingSheet: "A2" });
  });
});
