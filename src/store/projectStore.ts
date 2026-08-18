import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { create } from "zustand";
import type { PinConnectionPreset } from "../domain/pinmap";
import { releasedHarnessEditViolation } from "../domain/release";
import { canProjectRole, type ProjectPermission } from "../domain/permissions";
import { createProject } from "../domain/sample";
import type { ProjectDocument, SessionSnapshot, ViewKind } from "../domain/types";
import type { Locale } from "../i18n";
import { backendInvoke, isTauri } from "../platform";
import { loadAppPreferences, saveAppPreferences, type AppPreferences } from "../preferences";

interface ProjectState {
  snapshot: SessionSnapshot | null;
  activeHarnessId: string | null;
  selectedEntityId: string | null;
  selectedEntityType: "node" | "segment" | "conductor" | "accessory" | "annotation" | null;
  locale: Locale;
  theme: "light" | "dark";
  uiScale: number;
  preferences: AppPreferences;
  bottomView: Extract<ViewKind, "pinmap" | "cutlist" | "bom" | "test">;
  busy: boolean;
  error: string | null;
  connectorPicker: { mode: "add" | "replace"; nodeId?: string; partId?: string } | null;
  accessoryPicker: { partId?: string } | null;
  pinMapEditor: { wireId?: string; duplicate?: boolean; preset?: PinConnectionPreset } | null;
  cableRunEditor: { segmentId?: string } | null;
  initialize: (sessionId?: string) => Promise<void>;
  replaceProject: (project: ProjectDocument) => Promise<void>;
  updateProject: (mutator: (project: ProjectDocument) => void, permission?: ProjectPermission) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  setActiveHarness: (id: string) => void;
  selectEntity: (id: string | null, type?: "node" | "segment" | "conductor" | "accessory" | "annotation") => void;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: "light" | "dark") => void;
  setUiScale: (scale: number) => void;
  setPreferences: (preferences: AppPreferences) => void;
  setBottomView: (view: Extract<ViewKind, "pinmap" | "cutlist" | "bom" | "test">) => void;
  setSnapshot: (snapshot: SessionSnapshot) => void;
  clearError: () => void;
  openConnectorPicker: (mode?: "add" | "replace", nodeId?: string, partId?: string) => void;
  closeConnectorPicker: () => void;
  openAccessoryPicker: (partId?: string) => void;
  closeAccessoryPicker: () => void;
  openPinMapEditor: (wireId?: string, duplicate?: boolean, preset?: PinConnectionPreset) => void;
  closePinMapEditor: () => void;
  openCableRunEditor: (segmentId?: string) => void;
  closeCableRunEditor: () => void;
}

interface AppSettingsEvent {
  locale: Locale;
  theme: "light" | "dark";
  uiScale: number;
  preferences: AppPreferences;
}

let eventCleanup: UnlistenFn | undefined;
let selectionCleanup: UnlistenFn | undefined;
let preferencesCleanup: UnlistenFn | undefined;

export const useProjectStore = create<ProjectState>((set, get) => ({
  snapshot: null,
  activeHarnessId: null,
  selectedEntityId: null,
  selectedEntityType: null,
  locale: (localStorage.getItem("hd.locale") as Locale) || "ko",
  theme: (localStorage.getItem("hd.theme") as "light" | "dark") || "light",
  uiScale: Number(localStorage.getItem("hd.uiScale") || 100),
  preferences: loadAppPreferences(),
  bottomView: "pinmap",
  busy: false,
  error: null,
  connectorPicker: null,
  accessoryPicker: null,
  pinMapEditor: null,
  cableRunEditor: null,

  initialize: async (sessionId) => {
    set({ busy: true, error: null });
    try {
      let snapshot: SessionSnapshot;
      if (isTauri()) {
        snapshot = sessionId
          ? await backendInvoke<SessionSnapshot>("get_session", { sessionId })
          : await backendInvoke<SessionSnapshot>("create_project", { project: createProject() });
        eventCleanup?.();
        selectionCleanup?.();
        preferencesCleanup?.();
        eventCleanup = await listen<SessionSnapshot>(`project-changed:${snapshot.sessionId}`, ({ payload }) => {
          get().setSnapshot(payload);
        });
        selectionCleanup = await listen<{ id: string | null; type: "node" | "segment" | "conductor" | "accessory" | "annotation" | null }>(`selection-changed:${snapshot.sessionId}`, ({ payload }) => {
          set({ selectedEntityId: payload.id, selectedEntityType: payload.type });
        });
        preferencesCleanup = await listen<AppSettingsEvent>("app-settings-changed", ({ payload }) => {
          localStorage.setItem("hd.locale", payload.locale);
          localStorage.setItem("hd.theme", payload.theme);
          localStorage.setItem("hd.uiScale", String(payload.uiScale));
          saveAppPreferences(payload.preferences);
          set(payload);
        });
      } else {
        snapshot = { sessionId: sessionId || crypto.randomUUID(), revision: 0, dirty: false, readOnly: false, project: createProject() };
      }
      set({ snapshot, activeHarnessId: snapshot.project.harnesses[0]?.id ?? null, busy: false });
    } catch (error) {
      set({ error: String(error), busy: false });
    }
  },

  replaceProject: async (project) => {
    const current = get().snapshot;
    if (!current || current.readOnly) return;
    const optimistic = { ...current, project, revision: current.revision + 1, dirty: true };
    set({ snapshot: optimistic, error: null });
    if (!isTauri()) return;
    try {
      const snapshot = await backendInvoke<SessionSnapshot>("replace_project", { sessionId: current.sessionId, project });
      set({ snapshot });
    } catch (error) {
      set({ snapshot: current, error: String(error) });
    }
  },

  updateProject: async (mutator, permission = "design") => {
    const current = get().snapshot;
    if (!current) return;
    const activeMember = current.project.members.find((member) => member.id === get().preferences.currentProjectMemberId);
    if (!canProjectRole(activeMember?.role, permission)) {
      set({ error: `${activeMember?.name ?? "현재 사용자"}에게 ${permission === "review" ? "검토" : permission === "admin" ? "권한 관리" : "설계 편집"} 권한이 없습니다.` });
      return;
    }
    const project = structuredClone(current.project);
    try { mutator(project); }
    catch (error) { set({ error: String(error) }); return; }
    const lockedHarnessId = releasedHarnessEditViolation(current.project, project);
    if (lockedHarnessId) {
      const harness = current.project.harnesses.find((item) => item.id === lockedHarnessId);
      set({ error: `릴리즈된 하네스 ${harness?.number ?? lockedHarnessId}는 수정할 수 없습니다. 다음 리비전을 시작하세요.` });
      return;
    }
    project.updatedAt = new Date().toISOString();
    await get().replaceProject(project);
  },

  undo: async () => {
    const current = get().snapshot;
    if (!current || !isTauri()) return;
    try { set({ snapshot: await backendInvoke("undo_project", { sessionId: current.sessionId }) }); }
    catch (error) { set({ error: String(error) }); }
  },
  redo: async () => {
    const current = get().snapshot;
    if (!current || !isTauri()) return;
    try { set({ snapshot: await backendInvoke("redo_project", { sessionId: current.sessionId }) }); }
    catch (error) { set({ error: String(error) }); }
  },
  setActiveHarness: (activeHarnessId) => set({ activeHarnessId, selectedEntityId: null, selectedEntityType: null }),
  selectEntity: (selectedEntityId, selectedEntityType) => {
    const type = selectedEntityId ? selectedEntityType ?? null : null;
    set({ selectedEntityId, selectedEntityType: type });
    const sessionId = get().snapshot?.sessionId;
    if (sessionId && isTauri()) void emit(`selection-changed:${sessionId}`, { id: selectedEntityId, type });
  },
  setLocale: (locale) => { localStorage.setItem("hd.locale", locale); set({ locale }); },
  setTheme: (theme) => { localStorage.setItem("hd.theme", theme); set({ theme }); },
  setUiScale: (uiScale) => { localStorage.setItem("hd.uiScale", String(uiScale)); set({ uiScale }); },
  setPreferences: (preferences) => {
    saveAppPreferences(preferences);
    set({ preferences });
    if (isTauri()) {
      const { locale, theme, uiScale } = get();
      void emit("app-settings-changed", { locale, theme, uiScale, preferences });
    }
  },
  setBottomView: (bottomView) => set({ bottomView }),
  setSnapshot: (snapshot) => set((state) => ({
    snapshot,
    activeHarnessId: snapshot.project.harnesses.some((item) => item.id === state.activeHarnessId)
      ? state.activeHarnessId
      : snapshot.project.harnesses[0]?.id ?? null,
  })),
  clearError: () => set({ error: null }),
  openConnectorPicker: (mode = "add", nodeId, partId) => set({ connectorPicker: { mode, nodeId, partId } }),
  closeConnectorPicker: () => set({ connectorPicker: null }),
  openAccessoryPicker: (partId) => set({ accessoryPicker: { partId } }),
  closeAccessoryPicker: () => set({ accessoryPicker: null }),
  openPinMapEditor: (wireId, duplicate = false, preset) => set({ pinMapEditor: { wireId, duplicate, preset } }),
  closePinMapEditor: () => set({ pinMapEditor: null }),
  openCableRunEditor: (segmentId) => set({ cableRunEditor: { segmentId } }),
  closeCableRunEditor: () => set({ cableRunEditor: null }),
}));
