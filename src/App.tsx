import { open, save } from "@tauri-apps/plugin-dialog";
import { emit, emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow, Window } from "@tauri-apps/api/window";
import {
  Box, Boxes, Cable, ChevronDown, CircleAlert, Download, ExternalLink, FilePlus2, FolderOpen,
  Languages, Moon, PanelBottom, Plus, Redo2, Save, Search, Settings2, Sun, Undo2, ZoomIn,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HarnessAssembly, SessionSnapshot, ViewKind } from "./domain/types";
import { createProject } from "./domain/sample";
import { translate } from "./i18n";
import { backendInvoke, isTauri } from "./platform";
import { useProjectStore } from "./store/projectStore";
import { exportProject } from "./export/exportProject";
import { findDockTarget, installWindowPlacement, openDesignWindow, openDetachedView, openLibraryWindow, openProjectWorkspace, type DockTarget } from "./windowing";
import { BomView, CutListView, PinMapView, ValidationBar } from "./components/DataViews";
import { HarnessCanvas } from "./components/HarnessCanvas";
import { Inspector } from "./components/Inspector";
import { LibraryView } from "./components/LibraryView";
import { Navigator } from "./components/Navigator";
import { PreviewView } from "./components/PreviewView";
import { IconButton } from "./components/common";
import { DocumentWorkspace } from "./components/DocumentWorkspace";
import { ConnectorLibraryDialog } from "./components/ConnectorLibraryDialog";
import { PinMapEditDialog } from "./components/PinMapEditDialog";
import { CableRunDialog } from "./components/CableRunDialog";
import { Harness3DView } from "./components/ThreeDView";
import { SettingsDialog } from "./components/SettingsDialog";
import { applyNewProjectDefaults, appFontStack } from "./preferences";
import { shortcutMatches } from "./preferences";
import { RecoveryDialog, type RecoveryEntry } from "./components/RecoveryDialog";

const params = new URLSearchParams(window.location.search);
const initialSessionId = params.get("session") ?? undefined;
const initialView = (params.get("view") as ViewKind | null) ?? "workspace";
const initialHarnessId = params.get("harness") ?? undefined;
const initialBottomView = params.get("bottom");
const initialHostWindowLabel = params.get("host");
const isDesignWindow = params.get("window") === "design";

type FloatingPanel = "navigator" | "inspector" | "bottom";

interface WorkspaceHost {
  label: string;
  name: string;
  floatingPanels: FloatingPanel[];
}

interface WorkspaceHostQuery {
  sessionId: string;
  replyTo: string;
}

interface DockPanelRequest {
  panel: FloatingPanel;
  hostWindowLabel: string;
}

interface MovePanelOwnerRequest {
  panel: FloatingPanel;
  fromHostWindowLabel: string;
  toHostWindowLabel: string;
  bottomView?: "pinmap" | "cutlist" | "bom";
}

export default function App() {
  const store = useProjectStore();
  const [view] = useState<ViewKind>(initialView);
  const [bottomOpen, setBottomOpen] = useState(true);
  const [floatingPanels, setFloatingPanels] = useState<Set<FloatingPanel>>(() => new Set());
  const [exportState, setExportState] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recoveries, setRecoveries] = useState<RecoveryEntry[]>([]);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const restorePanel = useCallback((panel: FloatingPanel) => {
    setFloatingPanels((current) => {
      if (!current.has(panel)) return current;
      const next = new Set(current);
      next.delete(panel);
      return next;
    });
    if (panel === "bottom") setBottomOpen(true);
  }, []);
  const hidePanel = useCallback((panel: FloatingPanel) => {
    setFloatingPanels((current) => new Set(current).add(panel));
    if (panel === "bottom") setBottomOpen(false);
  }, []);

  useEffect(() => { void store.initialize(initialSessionId); }, []);
  useEffect(() => {
    if (initialSessionId || !isTauri()) return;
    void backendInvoke<RecoveryEntry[]>("list_recovery_snapshots").then((entries) => {
      setRecoveries(entries);
      setRecoveryOpen(entries.length > 0);
    });
  }, []);
  useEffect(() => {
    if (!store.snapshot || !isTauri() || store.preferences.autosaveIntervalMinutes <= 0) return;
    const timer = window.setInterval(() => {
      const current = useProjectStore.getState();
      if (!current.snapshot?.dirty || current.snapshot.readOnly) return;
      void backendInvoke("save_recovery_snapshot", { sessionId: current.snapshot.sessionId, retention: current.preferences.recoveryRetention });
    }, store.preferences.autosaveIntervalMinutes * 60_000);
    return () => window.clearInterval(timer);
  }, [store.snapshot?.sessionId, store.preferences.autosaveIntervalMinutes, store.preferences.recoveryRetention]);
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.matches("input, textarea, select") || document.querySelector(".modal-backdrop")) return;
      const shortcuts = store.preferences.shortcuts;
      const command = shortcutMatches(event, shortcuts.newProject) ? "new" : shortcutMatches(event, shortcuts.openProject) ? "open" : shortcutMatches(event, shortcuts.saveProject) ? "save" : shortcutMatches(event, shortcuts.undo) ? "undo" : shortcutMatches(event, shortcuts.redo) ? "redo" : shortcutMatches(event, shortcuts.settings) ? "settings" : null;
      if (!command) return;
      event.preventDefault();
      if (command === "undo") void store.undo();
      if (command === "redo") void store.redo();
      if (command === "settings") setSettingsOpen(true);
      if (command === "new" || command === "open" || command === "save") {
        const buttons = document.querySelectorAll<HTMLButtonElement>(".command-bar > .command-group button");
        buttons[command === "new" ? 0 : command === "open" ? 1 : 2]?.click();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [store.preferences.shortcuts, store.undo, store.redo]);
  useEffect(() => {
    if (initialHarnessId && store.snapshot?.project.harnesses.some((item) => item.id === initialHarnessId)) store.setActiveHarness(initialHarnessId);
  }, [store.snapshot?.sessionId]);
  useEffect(() => {
    if (initialView === "bottom" && (initialBottomView === "pinmap" || initialBottomView === "cutlist" || initialBottomView === "bom")) store.setBottomView(initialBottomView);
  }, []);
  useEffect(() => {
    if (view !== "workspace" || !store.snapshot || !isTauri()) return;
    const current = getCurrentWindow();
    const harness = store.snapshot.project.harnesses.find((item) => item.id === store.activeHarnessId);
    const host: WorkspaceHost = {
      label: current.label,
      name: `${isDesignWindow ? "설계 창" : "메인 창"} · ${harness?.number ?? store.snapshot.project.projectNumber} · ${current.label.slice(-6)}`,
      floatingPanels: [...floatingPanels],
    };
    let active = true;
    const cleanups: Array<() => void> = [];
    void Promise.all([
      listen<WorkspaceHostQuery>("workspace-host-query", ({ payload }) => {
        if (payload.sessionId === store.snapshot?.sessionId) void emitTo(payload.replyTo, "workspace-host-response", host);
      }),
      listen<DockPanelRequest>(`dock-panel:${store.snapshot.sessionId}`, ({ payload }) => {
        if (payload.hostWindowLabel === current.label) restorePanel(payload.panel);
      }),
      listen<MovePanelOwnerRequest>(`move-panel-owner:${store.snapshot.sessionId}`, ({ payload }) => {
        if (payload.fromHostWindowLabel === current.label) restorePanel(payload.panel);
        if (payload.toHostWindowLabel === current.label) {
          hidePanel(payload.panel);
          if (payload.panel === "bottom" && payload.bottomView) store.setBottomView(payload.bottomView);
        }
      }),
    ]).then((listeners) => {
      if (!active) { listeners.forEach((cleanup) => cleanup()); return; }
      cleanups.push(...listeners);
    });
    void emit(`workspace-host-announced:${store.snapshot.sessionId}`, host);
    return () => { active = false; cleanups.forEach((cleanup) => cleanup()); };
  }, [store.snapshot?.sessionId, store.activeHarnessId, view, floatingPanels, restorePanel, hidePanel]);
  useEffect(() => { let cleanup: () => void = () => {}; void installWindowPlacement().then((fn) => { cleanup = fn; }); return () => cleanup(); }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = store.theme;
    document.documentElement.style.setProperty("--ui-scale", String(store.uiScale / 100));
    document.documentElement.style.setProperty("--base-font-size", `${store.preferences.fontSize}px`);
    document.documentElement.style.setProperty("--app-font-family", appFontStack(store.preferences.fontFamily));
    document.documentElement.lang = store.locale;
  }, [store.locale, store.theme, store.uiScale, store.preferences.fontFamily, store.preferences.fontSize]);
  useEffect(() => {
    if (!store.snapshot || !isTauri()) return;
    const harness = store.snapshot.project.harnesses.find((item) => item.id === store.activeHarnessId);
    const viewName = view === "workspace" ? (isDesignWindow ? "설계 창" : translate(store.locale, "appName")) : translate(store.locale, view);
    const dirty = store.snapshot.dirty ? " ●" : "";
    void getCurrentWindow().setTitle(`${store.snapshot.project.projectNumber} · ${harness?.number ?? viewName} · ${viewName}${dirty}`);
  }, [store.snapshot, store.activeHarnessId, store.locale, view]);

  if (store.busy || !store.snapshot) return <div className="loading-screen"><div className="app-mark"><Cable size={26} /></div><strong>Harness Designer</strong><span>프로젝트 세션 준비 중…</span></div>;

  if (view !== "workspace") return <><DetachedView view={view} /><GlobalDialogs /></>;

  const activeHarness = store.snapshot.project.harnesses.find((item) => item.id === store.activeHarnessId);
  const floatPanel = (panel: FloatingPanel) => {
    hidePanel(panel);
    void openDetachedView(store.snapshot!.sessionId, panel, {
      harnessId: store.activeHarnessId ?? undefined,
      bottomView: panel === "bottom" ? store.bottomView : undefined,
      onClosed: () => restorePanel(panel),
    }).catch((error) => {
      restorePanel(panel);
      setExportState(`창 열기 실패 · ${String(error)}`);
    });
  };
  const workspaceClasses = [
    "workspace",
    floatingPanels.has("navigator") ? "workspace--without-navigator" : "",
    floatingPanels.has("inspector") ? "workspace--without-inspector" : "",
  ].filter(Boolean).join(" ");
  return <><div className="app-shell">
    <CommandBar onSettings={() => setSettingsOpen(true)} onExport={async () => {
      try { setExportState("출력 생성 중…"); const result = await exportProject(store.snapshot!.project); setExportState(`출력 완료 · ${result}`); }
      catch (error) { store.clearError(); setExportState(String(error)); }
    }} />
    <ToolBar harness={activeHarness} bottomOpen={bottomOpen} setBottomOpen={setBottomOpen} />
    <main className={workspaceClasses}>
      {!floatingPanels.has("navigator") && <Navigator onDetach={() => floatPanel("navigator")} />}
      <section className="center-workspace"><DocumentWorkspace bottomDock={bottomOpen ? <BottomDock onDetach={() => floatPanel("bottom")} /> : undefined} /></section>
      {!floatingPanels.has("inspector") && <aside className="right-dock"><Inspector onDetach={() => floatPanel("inspector")} /><ValidationBar /></aside>}
    </main>
    <StatusBar exportState={exportState} />
    {store.error && <button className="error-toast" onClick={store.clearError}><CircleAlert size={14} /><span>{store.error}</span></button>}
  </div><GlobalDialogs />{settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}{recoveryOpen && <RecoveryDialog entries={recoveries} onChange={setRecoveries} onClose={() => setRecoveryOpen(false)} />}</>;
}

function CommandBar({ onExport, onSettings }: { onExport: () => Promise<void>; onSettings: () => void }) {
  const { snapshot, locale, theme, setTheme, setLocale, setSnapshot, preferences } = useProjectStore();
  if (!snapshot) return null;
  const newProject = async () => {
    const project = createProject("NEW HARNESS PROJECT");
    applyNewProjectDefaults(project, preferences);
    project.harnesses = [];
    if (isTauri()) {
      const created = await backendInvoke<SessionSnapshot>("create_project", { project });
      await openProjectWorkspace(created.sessionId, created.project.id, created.project.name);
    }
  };
  const openProject = async () => {
    if (!isTauri()) return;
    const path = await open({ multiple: false, directory: false, defaultPath: preferences.defaultImportDirectory || undefined, filters: [{ name: "Harness project", extensions: ["harness"] }] });
    if (!path) return;
    const opened = await backendInvoke<SessionSnapshot>("open_project", { path });
    await openProjectWorkspace(opened.sessionId, opened.project.id, opened.project.name);
  };
  const saveProject = async () => {
    if (!isTauri()) return;
    const path = snapshot.path ?? await save({ defaultPath: `${snapshot.project.projectNumber}.harness`, filters: [{ name: "Harness project", extensions: ["harness"] }] });
    if (!path) return;
    setSnapshot(await backendInvoke("save_project", { sessionId: snapshot.sessionId, path }));
  };
  return <header className="command-bar">
    <div className="brand"><div className="brand-mark"><Cable size={17} /></div><strong>Harness Designer</strong><span>DESKTOP</span></div>
    <div className="command-group"><button onClick={() => void newProject()}><FilePlus2 size={14} />{translate(locale, "newProject")}</button><button onClick={() => void openProject()}><FolderOpen size={14} />{translate(locale, "openProject")}</button><button onClick={() => void saveProject()} disabled={snapshot.readOnly}><Save size={14} />{translate(locale, "save")}</button><button onClick={() => void openLibraryWindow(snapshot.sessionId)}><Boxes size={14} />{translate(locale, "library")}</button></div>
    <div className="command-search"><Search size={13} /><input placeholder="명령, 부품, 하네스 검색…" /><kbd>⌘ K</kbd></div>
    <div className="command-group command-group--right"><button onClick={() => void onExport()}><Download size={14} />{translate(locale, "export")}</button><IconButton title="언어 전환" onClick={() => setLocale(locale === "ko" ? "en" : "ko")}><Languages size={14} /></IconButton><IconButton title="테마 전환" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? <Moon size={14} /> : <Sun size={14} />}</IconButton><IconButton title="환경설정" onClick={onSettings}><Settings2 size={14} /></IconButton></div>
  </header>;
}

function ToolBar({ harness, bottomOpen, setBottomOpen }: { harness?: HarnessAssembly; bottomOpen: boolean; setBottomOpen: (value: boolean) => void }) {
  const { snapshot, locale, undo, redo, uiScale, setUiScale, activeHarnessId, openConnectorPicker, openPinMapEditor, openCableRunEditor } = useProjectStore();
  if (!snapshot) return null;
  return <div className="tool-bar"><div className="tool-group"><IconButton title={translate(locale, "undo")} onClick={() => void undo()}><Undo2 size={14} /></IconButton><IconButton title={translate(locale, "redo")} onClick={() => void redo()}><Redo2 size={14} /></IconButton></div><div className="separator" /><div className="tool-group"><button onClick={() => openConnectorPicker()}><Plus size={13} />Connector</button><button onClick={() => openCableRunEditor()} disabled={!harness || harness.nodes.filter((node) => node.kind === "connector").length < 2}><Plus size={13} />Cable</button><button onClick={() => openPinMapEditor()} disabled={!harness || harness.nodes.length < 2}><Plus size={13} />Wire</button></div><div className="separator" /><button className="harness-selector"><Cable size={13} /><strong>{harness?.number ?? "NO HARNESS"}</strong><span>{harness?.name}</span><ChevronDown size={12} /></button><div className="tool-spacer" /><div className="scale-control"><ZoomIn size={13} /><input type="range" min="80" max="140" step="5" value={uiScale} onChange={(event) => setUiScale(Number(event.target.value))} /><span>{uiScale}%</span></div><button onClick={() => void openDetachedView(snapshot.sessionId, "threeD", { harnessId: activeHarnessId ?? undefined })} disabled={!harness}><Box size={13} />3D Harness</button><IconButton title="새 설계 창에서 열기" onClick={() => void openDesignWindow(snapshot.sessionId, activeHarnessId ?? undefined)}><ExternalLink size={14} /></IconButton><IconButton title="하단 패널" className={bottomOpen ? "is-active" : ""} onClick={() => setBottomOpen(!bottomOpen)}><PanelBottom size={14} /></IconButton></div>;
}

function GlobalDialogs() {
  const pinMapEditor = useProjectStore((state) => state.pinMapEditor);
  const cableRunEditor = useProjectStore((state) => state.cableRunEditor);
  const presetKey = pinMapEditor?.preset ? `${pinMapEditor.preset.fromPinId}-${pinMapEditor.preset.toPinId}` : "manual";
  return <><ConnectorLibraryDialog />{pinMapEditor && <PinMapEditDialog key={`${pinMapEditor.wireId ?? "new"}-${pinMapEditor.duplicate ? "copy" : "edit"}-${presetKey}`} />}{cableRunEditor && <CableRunDialog />}</>;
}

function BottomDock({ onDetach }: { onDetach?: () => void } = {}) {
  const { bottomView, setBottomView, locale } = useProjectStore();
  return <section className="bottom-dock"><div className="dock-tabs"><button className={bottomView === "pinmap" ? "is-active" : ""} onClick={() => setBottomView("pinmap")}>{translate(locale, "pinmap")}</button><button className={bottomView === "cutlist" ? "is-active" : ""} onClick={() => setBottomView("cutlist")}>{translate(locale, "cutlist")}</button><button className={bottomView === "bom" ? "is-active" : ""} onClick={() => setBottomView("bom")}>{translate(locale, "bom")}</button>{onDetach && <IconButton title="하단 패널을 플로팅 창으로 분리" onClick={onDetach}><ExternalLink size={13} /></IconButton>}</div><div className="dock-content">{bottomView === "pinmap" ? <PinMapView /> : bottomView === "cutlist" ? <CutListView /> : <BomView />}</div></section>;
}

function DetachedView({ view }: { view: ViewKind }) {
  const { snapshot, activeHarnessId, bottomView, locale } = useProjectStore();
  const dockable = view === "navigator" || view === "inspector" || view === "bottom";
  const [hostWindowLabel, setHostWindowLabel] = useState(initialHostWindowLabel ?? "");
  const [workspaceHosts, setWorkspaceHosts] = useState<WorkspaceHost[]>([]);
  const [hostError, setHostError] = useState<string | null>(null);
  const docking = useRef(false);

  useEffect(() => {
    if (!snapshot || !hostWindowLabel || !isTauri()) return;
    let active = true;
    const cleanups: Array<() => void> = [];
    const rememberHost = (host: WorkspaceHost) => {
      setWorkspaceHosts((current) => [...current.filter((item) => item.label !== host.label), host].sort((a, b) => a.name.localeCompare(b.name)));
    };
    const current = getCurrentWindow();
    void Promise.all([
      listen<WorkspaceHost>("workspace-host-response", ({ payload }) => rememberHost(payload)),
      listen<WorkspaceHost>(`workspace-host-announced:${snapshot.sessionId}`, ({ payload }) => rememberHost(payload)),
    ]).then(async (listeners) => {
      if (!active) { listeners.forEach((cleanup) => cleanup()); return; }
      cleanups.push(...listeners);
      await emit("workspace-host-query", { sessionId: snapshot.sessionId, replyTo: current.label } satisfies WorkspaceHostQuery);
    });
    return () => { active = false; cleanups.forEach((cleanup) => cleanup()); };
  }, [snapshot?.sessionId, hostWindowLabel]);

  useEffect(() => {
    if (!dockable || !snapshot || !hostWindowLabel || !isTauri()) return;
    let active = true;
    let cleanup: () => void = () => undefined;
    void getCurrentWindow().onCloseRequested(async (event) => {
      if (docking.current) return;
      event.preventDefault();
      docking.current = true;
      await emit(`dock-panel:${snapshot.sessionId}`, { panel: view, hostWindowLabel } satisfies DockPanelRequest);
      await getCurrentWindow().destroy();
    }).then((unlisten) => { if (active) cleanup = unlisten; else unlisten(); });
    return () => { active = false; cleanup(); };
  }, [view, snapshot?.sessionId, hostWindowLabel, dockable]);

  useEffect(() => {
    if (!dockable || !snapshot || !hostWindowLabel || !isTauri()) return;
    let active = true;
    let cleanup: () => void = () => undefined;
    const current = getCurrentWindow();
    void current.onMoved(async ({ payload: position }) => {
      if (docking.current) return;
      const candidates = workspaceHosts.filter((host) => host.label === hostWindowLabel || !host.floatingPanels.includes(view));
      const [floatingSize, scaleFactor, targets] = await Promise.all([
        current.outerSize(),
        current.scaleFactor(),
        Promise.all(candidates.map(async (candidate): Promise<DockTarget | null> => {
          try {
            const host = await Window.getByLabel(candidate.label);
            if (!host) return null;
            const [hostPosition, hostSize] = await Promise.all([host.outerPosition(), host.outerSize()]);
            return { label: candidate.label, x: hostPosition.x, y: hostPosition.y, width: hostSize.width, height: hostSize.height };
          } catch { return null; }
        })),
      ]);
      const target = findDockTarget(
        view,
        { x: position.x, y: position.y, width: floatingSize.width, height: floatingSize.height },
        targets.filter((item): item is DockTarget => item !== null),
        36 * scaleFactor,
      );
      if (!target) return;
      docking.current = true;
      let ownerMoved = false;
      try {
        if (target !== hostWindowLabel) {
          await emit(`move-panel-owner:${snapshot.sessionId}`, {
            panel: view,
            fromHostWindowLabel: hostWindowLabel,
            toHostWindowLabel: target,
            bottomView: view === "bottom" ? bottomView : undefined,
          } satisfies MovePanelOwnerRequest);
          ownerMoved = true;
        }
        await emit(`dock-panel:${snapshot.sessionId}`, { panel: view, hostWindowLabel: target } satisfies DockPanelRequest);
        await current.destroy();
      } catch (error) {
        if (ownerMoved) {
          await emit(`move-panel-owner:${snapshot.sessionId}`, {
            panel: view,
            fromHostWindowLabel: target,
            toHostWindowLabel: hostWindowLabel,
            bottomView: view === "bottom" ? bottomView : undefined,
          } satisfies MovePanelOwnerRequest);
        }
        docking.current = false;
        setHostError(`마그넷 도킹 실패 · ${String(error)}`);
      }
    }).then((unlisten) => { if (active) cleanup = unlisten; else unlisten(); });
    return () => { active = false; cleanup(); };
  }, [view, snapshot?.sessionId, hostWindowLabel, dockable, workspaceHosts, bottomView]);

  if (!snapshot) return null;
  const content = useMemo(() => {
    if (view === "canvas") return <HarnessCanvas />;
    if (view === "navigator") return <Navigator detached />;
    if (view === "inspector") return <aside className="right-dock"><Inspector detached /><ValidationBar /></aside>;
    if (view === "pinmap") return <PinMapView />;
    if (view === "cutlist") return <CutListView />;
    if (view === "bom") return <BomView />;
    if (view === "bottom") return <BottomDock />;
    if (view === "library") return <LibraryView />;
    if (view === "preview") return <PreviewView />;
    if (view === "threeD") return <Harness3DView />;
    return null;
  }, [view, snapshot.revision, activeHarnessId, locale]);
  const moveToMain = async (targetHostWindowLabel: string) => {
    if (!isTauri() || !targetHostWindowLabel || targetHostWindowLabel === hostWindowLabel) return;
    const target = workspaceHosts.find((host) => host.label === targetHostWindowLabel);
    if (dockable && target?.floatingPanels.includes(view)) return;
    setHostError(null);
    try {
      if (dockable) {
        await emit(`move-panel-owner:${snapshot.sessionId}`, {
          panel: view,
          fromHostWindowLabel: hostWindowLabel,
          toHostWindowLabel: targetHostWindowLabel,
          bottomView: view === "bottom" ? bottomView : undefined,
        } satisfies MovePanelOwnerRequest);
      }
      setHostWindowLabel(targetHostWindowLabel);
    } catch (error) {
      if (dockable) {
        await emit(`move-panel-owner:${snapshot.sessionId}`, {
          panel: view,
          fromHostWindowLabel: targetHostWindowLabel,
          toHostWindowLabel: hostWindowLabel,
          bottomView: view === "bottom" ? bottomView : undefined,
        } satisfies MovePanelOwnerRequest);
      }
      setHostError(`메인 창 이동 실패 · ${String(error)}`);
    }
  };
  const dockToMain = async () => {
    if (!dockable || !isTauri()) { window.close(); return; }
    docking.current = true;
    await emit(`dock-panel:${snapshot.sessionId}`, { panel: view, hostWindowLabel } satisfies DockPanelRequest);
    await getCurrentWindow().destroy();
  };
  const hostChoices = workspaceHosts.some((host) => host.label === hostWindowLabel)
    ? workspaceHosts
    : [{ label: hostWindowLabel, name: "현재 메인 창", floatingPanels: dockable ? [view] : [] }, ...workspaceHosts];
  return <div className={`detached-shell detached-shell--${view}`}><div className="detached-title"><div className="brand-mark"><Cable size={15} /></div><strong>{snapshot.project.projectNumber}</strong><span>{translate(locale, view)}</span><em>{hostError ?? (snapshot.dirty ? translate(locale, "dirty") : translate(locale, "clean"))}</em>{hostChoices.length > 1 && <label className="detached-host-select"><span>소속</span><select aria-label="소속 메인 창" value={hostWindowLabel} onChange={(event) => void moveToMain(event.target.value)}>{hostChoices.map((host) => <option key={host.label} value={host.label} disabled={dockable && host.label !== hostWindowLabel && host.floatingPanels.includes(view)}>{host.name}{dockable && host.label !== hostWindowLabel && host.floatingPanels.includes(view) ? " · 동일 패널 사용 중" : ""}</option>)}</select></label>}{dockable && <button className="detached-dock-button" onClick={() => void dockToMain()}><PanelBottom size={12} />선택 메인에 도킹</button>}</div><div className="detached-content">{content}</div></div>;
}

function StatusBar({ exportState }: { exportState: string | null }) {
  const { snapshot, activeHarnessId, locale } = useProjectStore();
  const harness = snapshot?.project.harnesses.find((item) => item.id === activeHarnessId);
  return <footer className="status-bar"><span className={`status-dot ${snapshot?.readOnly ? "is-warning" : snapshot?.dirty ? "is-dirty" : ""}`} /> <strong>{snapshot?.readOnly ? translate(locale, "readOnly") : snapshot?.dirty ? translate(locale, "dirty") : translate(locale, "clean")}</strong><span>SESSION {snapshot?.sessionId.slice(0, 8).toUpperCase()}</span><span>REVISION {snapshot?.revision}</span><span>{harness?.nodes.length ?? 0} NODES</span><span>{harness?.conductors.length ?? 0} WIRES</span><span className="status-grow">{exportState}</span><span>mm</span><span>SCHEMA v{snapshot?.project.schemaVersion}</span></footer>;
}
