import { beforeEach, describe, expect, it, vi } from "vitest";
import { addSheetTab, findSheetDropHost, isOutsideHost, moveSheetTab, readWorkspaceEnvelope, writeWorkspaceEnvelope, type SheetHostZone, type WorkspaceEnvelope } from "./sheetWorkspace";

describe("하네스 시트 작업 공간", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
        clear: () => values.clear(),
      },
    });
  });

  it("열린 시트를 중복 없이 추가하고 드래그 위치로 재정렬한다", () => {
    expect(addSheetTab(["h1"], "h1")).toEqual(["h1"]);
    expect(addSheetTab(["h1"], "h2")).toEqual(["h1", "h2"]);
    expect(moveSheetTab(["h1", "h2", "h3"], "h3", 0)).toEqual(["h3", "h1", "h2"]);
    expect(moveSheetTab(["h1", "h2", "h3"], "h1", 2)).toEqual(["h2", "h3", "h1"]);
  });

  it("같은 프로젝트의 다른 창 탭 바만 드롭 대상으로 찾는다", () => {
    vi.spyOn(Date, "now").mockReturnValue(10_000);
    const host = (windowLabel: string, workspaceId: string, tabX: number): SheetHostZone => ({
      windowLabel, workspaceId, x: tabX, y: 0, width: 900, height: 700,
      tabX, tabY: 60, tabWidth: 800, tabHeight: 30, updatedAt: 9_500,
    });
    const hosts = [host("main-a", "workspace-1", 0), host("main-b", "workspace-1", 1000), host("main-c", "workspace-2", 2000)];

    expect(findSheetDropHost({ x: 1200, y: 75 }, hosts, "main-a", "workspace-1")).toBe("main-b");
    expect(findSheetDropHost({ x: 2200, y: 75 }, hosts, "main-a", "workspace-1")).toBeUndefined();
  });

  it("포인터가 현재 창 밖에 있는지 판별한다", () => {
    const host = { windowLabel: "main", workspaceId: "workspace", x: 100, y: 100, width: 900, height: 700, tabX: 100, tabY: 150, tabWidth: 900, tabHeight: 30, updatedAt: 0 };
    expect(isOutsideHost({ x: 500, y: 400 }, host)).toBe(false);
    expect(isOutsideHost({ x: 1100, y: 400 }, host)).toBe(true);
  });

  it("대형 작업 공간을 압축 저장하고 기존 JSON도 읽는다", () => {
    const envelope: WorkspaceEnvelope<{ drawing: string }> = {
      revision: 1,
      originWindowLabel: "main",
      project: { drawing: "STEP-PROJECTION-".repeat(50_000) },
      savedDocument: "saved",
      filePath: null,
    };

    writeWorkspaceEnvelope("compressed", envelope);
    const stored = localStorage.getItem("hd2.workspace.compressed") ?? "";
    expect(stored.startsWith("lz:")).toBe(true);
    expect(stored.length).toBeLessThan(JSON.stringify(envelope).length / 10);
    expect(readWorkspaceEnvelope("compressed")).toEqual(envelope);

    localStorage.setItem("hd2.workspace.legacy", JSON.stringify(envelope));
    expect(readWorkspaceEnvelope("legacy")).toEqual(envelope);
  });
});
