import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { create } from "zustand";
import type { PinConnectionPreset } from "../domain/pinmap";
import { createProject } from "../domain/sample";
import type { ProjectDocument, SessionSnapshot, ViewKind } from "../domain/types";
import type { Locale } from "../i18n";
import { backendInvoke, isTauri } from "../platform";
import { loadAppPreferences, saveAppPreferences, type AppPreferences } from "../preferences";

interface ProjectState {
  snapshot: SessionSnapshot | null;
  activeHarnessId: string | null;
  selectedEntityId: string | null;
  selectedEntityType: "node" | "segment" | "conductor" | null;
  locale: Locale;
  theme: "light" | "dark";
  uiScale: number;
  preferences: AppPreferences;
  bottomView: Extract<ViewKind, "pinmap" | "cutlist" | "bom">;
  busy: boolean;
  error: string | null;
  connectorPicker: { mode: "add" | "replace"; nodeId?: string; partId?: string } | null;
  pinMapEditor: { wireId?: string; duplicate?: boolean; preset?: PinConnectionPreset } | null;
  cableRunEditor: { segmentId?: string } | null;
  initialize: (sessionId?: string) => Promise<void>;
  replaceProject: (project: ProjectDocument) => Promise<void>;
  updateProject: (mutator: (project: ProjectDocument) => void) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  setActiveHarness: (id: string) => void;
  selectEntity: (id: string | null, type?: "node" | "segment" | "conductor") => void;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: "light" | "dark") => void;
  setUiScale: (scale: number) => void;
  setPreferences: (preferences: AppPreferences) => void;
  setBottomView: (view: Extract<ViewKind, "pinmap" | "cutlist" | "bom">) => void;
  setSnapshot: (snapshot: SessionSnapshot) => void;
  clearError: () => void;
  openConnectorPicker: (mode?: "add" | "replace", nodeId?: string, partId?: string) => void;
  closeConnectorPicker: () => void;
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
        selectionCleanup = await listen<{ id: string | null; type: "node" | "segment" | "conductor" | null }>(`selection-changed:${snapshot.sessionId}`, ({ payload }) => {
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

  updateProject: async (mutator) => {
    const current = get().snapshot;
    if (!current) return;
    const project = structuredClone(current.project);
    mutator(project);
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
  openPinMapEditor: (wireId, duplicate = false, preset) => set({ pinMapEditor: { wireId, duplicate, preset } }),
  closePinMapEditor: () => set({ pinMapEditor: null }),
  openCableRunEditor: (segmentId) => set({ cableRunEditor: { segmentId } }),
  closeCableRunEditor: () => set({ cableRunEditor: null }),
}));
