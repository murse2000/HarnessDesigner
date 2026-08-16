import { availableMonitors, getCurrentWindow, PhysicalPosition, PhysicalSize, primaryMonitor } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { ViewKind } from "./domain/types";
import { isTauri } from "./platform";

type BottomViewKind = Extract<ViewKind, "pinmap" | "cutlist" | "bom">;

export interface DetachedViewOptions {
  harnessId?: string;
  bottomView?: BottomViewKind;
  onClosed?: () => void;
}

export type DockableView = Extract<ViewKind, "navigator" | "inspector" | "bottom">;

interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DockTarget extends WindowRect {
  label: string;
}

export function isNearDockTarget(panel: DockableView, floating: WindowRect, host: WindowRect, threshold: number): boolean {
  const overlapsX = floating.x + floating.width >= host.x && floating.x <= host.x + host.width;
  const overlapsY = floating.y + floating.height >= host.y && floating.y <= host.y + host.height;
  if (panel === "navigator") return overlapsY && Math.min(Math.abs(floating.x - host.x), Math.abs(floating.x + floating.width - host.x)) <= threshold;
  if (panel === "inspector") return overlapsY && Math.min(Math.abs(floating.x - host.x - host.width), Math.abs(floating.x + floating.width - host.x - host.width)) <= threshold;
  return overlapsX && Math.min(Math.abs(floating.y - host.y - host.height), Math.abs(floating.y + floating.height - host.y - host.height)) <= threshold;
}

export function findDockTarget(panel: DockableView, floating: WindowRect, hosts: DockTarget[], threshold: number): string | undefined {
  return hosts.find((host) => isNearDockTarget(panel, floating, host, threshold))?.label;
}

interface SavedPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  monitorSignature: string;
}

const placementKey = (label: string) => `hd.window.${label}`;

async function monitorSignature(): Promise<string> {
  const monitors = await availableMonitors();
  return monitors
    .map((monitor) => `${monitor.name ?? "display"}:${monitor.position.x},${monitor.position.y}:${monitor.size.width}x${monitor.size.height}@${monitor.scaleFactor}`)
    .sort()
    .join("|");
}

export async function installWindowPlacement(): Promise<() => void> {
  if (!isTauri()) return () => undefined;
  const current = getCurrentWindow();
  const key = placementKey(current.label);
  const saved = localStorage.getItem(key);
  if (saved) {
    try {
      const placement = JSON.parse(saved) as SavedPlacement;
      const monitors = await availableMonitors();
      const visible = monitors.some((monitor) => {
        const left = monitor.position.x;
        const top = monitor.position.y;
        return placement.x + 120 > left && placement.x < left + monitor.size.width && placement.y + 32 > top && placement.y < top + monitor.size.height;
      });
      if (visible) {
        await current.setPosition(new PhysicalPosition(placement.x, placement.y));
        await current.setSize(new PhysicalSize(Math.max(520, placement.width), Math.max(360, placement.height)));
      } else {
        const primary = await primaryMonitor();
        if (primary) await current.setPosition(new PhysicalPosition(primary.position.x + 60, primary.position.y + 60));
      }
    } catch { localStorage.removeItem(key); }
  }

  let timer = 0;
  const persist = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
      const [position, size, signature] = await Promise.all([current.outerPosition(), current.outerSize(), monitorSignature()]);
      const placement: SavedPlacement = { x: position.x, y: position.y, width: size.width, height: size.height, monitorSignature: signature };
      localStorage.setItem(key, JSON.stringify(placement));
    }, 250);
  };
  const unlistenMove = await current.onMoved(persist);
  const unlistenResize = await current.onResized(persist);
  return () => { unlistenMove(); unlistenResize(); window.clearTimeout(timer); };
}

export async function openDetachedView(sessionId: string, view: ViewKind, options: DetachedViewOptions = {}): Promise<void> {
  const params = new URLSearchParams({ session: sessionId, view });
  if (options.harnessId) params.set("harness", options.harnessId);
  if (options.bottomView) params.set("bottom", options.bottomView);
  if (isTauri()) params.set("host", getCurrentWindow().label);
  const url = `/?${params.toString()}`;
  if (!isTauri()) {
    const popup = window.open(url, `hd-${view}-${crypto.randomUUID()}`, "width=1100,height=760");
    if (popup && options.onClosed) popup.addEventListener("beforeunload", options.onClosed, { once: true });
    return;
  }
  const label = `${view}-${crypto.randomUUID()}`;
  const windowHandle = new WebviewWindow(label, {
    url,
    title: `Harness Designer · ${view}`,
    width: view === "canvas" || view === "threeD" ? 1280 : 980,
    height: view === "canvas" || view === "threeD" ? 820 : 720,
    minWidth: 520,
    minHeight: 360,
    resizable: true,
  });
  await new Promise<void>((resolve, reject) => {
    windowHandle.once("tauri://created", () => resolve());
    windowHandle.once("tauri://error", ({ payload }) => reject(payload));
  });
  if (options.onClosed) await windowHandle.once("tauri://destroyed", options.onClosed);
}

export async function openLibraryWindow(sessionId: string): Promise<void> {
  const params = new URLSearchParams({ session: sessionId, view: "library" });
  const url = `/?${params.toString()}`;
  const label = `library-${sessionId}`;
  if (!isTauri()) {
    window.open(url, label, "width=1100,height=760");
    return;
  }
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.unminimize();
    await existing.setFocus();
    return;
  }
  const windowHandle = new WebviewWindow(label, {
    url,
    title: "Harness Designer · 부품 라이브러리",
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    resizable: true,
  });
  await new Promise<void>((resolve, reject) => {
    windowHandle.once("tauri://created", () => resolve());
    windowHandle.once("tauri://error", ({ payload }) => reject(payload));
  });
}

export async function openDesignWindow(sessionId: string, harnessId?: string): Promise<void> {
  const params = new URLSearchParams({ session: sessionId, view: "workspace", window: "design" });
  if (harnessId) params.set("harness", harnessId);
  const url = `/?${params.toString()}`;
  if (!isTauri()) {
    window.open(url, `design-${crypto.randomUUID()}`, "width=1600,height=920");
    return;
  }
  const label = `design-${crypto.randomUUID()}`;
  const windowHandle = new WebviewWindow(label, {
    url,
    title: "Harness Designer · 설계 창",
    width: 1600,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    resizable: true,
  });
  await new Promise<void>((resolve, reject) => {
    windowHandle.once("tauri://created", () => resolve());
    windowHandle.once("tauri://error", ({ payload }) => reject(payload));
  });
}

export async function openProjectWorkspace(sessionId: string, projectId: string, title: string): Promise<void> {
  const params = new URLSearchParams({ session: sessionId, view: "workspace" });
  if (!isTauri()) {
    window.open(`/?${params.toString()}`, `project-${projectId}`, "width=1600,height=920");
    return;
  }
  const label = `project-${projectId}`;
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) { await existing.unminimize(); await existing.setFocus(); return; }
  const windowHandle = new WebviewWindow(label, {
    url: `/?${params.toString()}`,
    title: `Harness Designer · ${title}`,
    width: 1600,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    resizable: true,
  });
  await new Promise<void>((resolve, reject) => {
    windowHandle.once("tauri://created", () => resolve());
    windowHandle.once("tauri://error", ({ payload }) => reject(payload));
  });
}
