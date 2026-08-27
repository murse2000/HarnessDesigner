import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { compressToUTF16, decompressFromUTF16 } from "lz-string";
import { isTauri } from "../platform";

export type SheetHostZone = {
  windowLabel: string;
  workspaceId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tabX: number;
  tabY: number;
  tabWidth: number;
  tabHeight: number;
  updatedAt: number;
};

export type SheetTransfer = {
  workspaceId: string;
  sourceWindowLabel: string;
  targetWindowLabel: string;
  harnessId: string;
};

export type WorkspaceEnvelope<T> = {
  revision: number;
  originWindowLabel: string;
  project: T;
  savedDocument: string;
  filePath: string | null;
};

const hostKey = (workspaceId: string) => `hd2.sheet-hosts.${workspaceId}`;
const workspaceKey = (workspaceId: string) => `hd2.workspace.${workspaceId}`;
const compressedWorkspacePrefix = "lz:";

export function moveSheetTab(ids: string[], sourceId: string, targetIndex: number): string[] {
  const sourceIndex = ids.indexOf(sourceId);
  if (sourceIndex < 0) return ids;
  const next = ids.filter((id) => id !== sourceId);
  next.splice(Math.max(0, Math.min(targetIndex, next.length)), 0, sourceId);
  return next;
}

export function addSheetTab(ids: string[], harnessId: string): string[] {
  return ids.includes(harnessId) ? ids : [...ids, harnessId];
}

export function findSheetDropHost(point: { x: number; y: number }, hosts: SheetHostZone[], sourceWindowLabel: string, workspaceId: string): string | undefined {
  const now = Date.now();
  return hosts.find((host) =>
    host.windowLabel !== sourceWindowLabel
    && host.workspaceId === workspaceId
    && now - host.updatedAt < 5_000
    && point.x >= host.tabX
    && point.x <= host.tabX + host.tabWidth
    && point.y >= host.tabY
    && point.y <= host.tabY + host.tabHeight
  )?.windowLabel;
}

export function isOutsideHost(point: { x: number; y: number }, host: SheetHostZone): boolean {
  return point.x < host.x || point.x > host.x + host.width || point.y < host.y || point.y > host.y + host.height;
}

export function readSheetHosts(workspaceId: string): SheetHostZone[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(hostKey(workspaceId)) ?? "[]") as SheetHostZone[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeSheetHost(host: SheetHostZone): void {
  const hosts = readSheetHosts(host.workspaceId).filter((item) => item.windowLabel !== host.windowLabel && Date.now() - item.updatedAt < 5_000);
  localStorage.setItem(hostKey(host.workspaceId), JSON.stringify([...hosts, host]));
}

export function removeSheetHost(workspaceId: string, windowLabel: string): void {
  localStorage.setItem(hostKey(workspaceId), JSON.stringify(readSheetHosts(workspaceId).filter((host) => host.windowLabel !== windowLabel)));
}

export function readWorkspaceEnvelope<T>(workspaceId: string): WorkspaceEnvelope<T> | null {
  try {
    const stored = localStorage.getItem(workspaceKey(workspaceId));
    if (!stored) return null;
    const json = stored.startsWith(compressedWorkspacePrefix)
      ? decompressFromUTF16(stored.slice(compressedWorkspacePrefix.length))
      : stored;
    const parsed = JSON.parse(json ?? "null") as WorkspaceEnvelope<T> | null;
    return parsed && typeof parsed.revision === "number" ? parsed : null;
  } catch {
    return null;
  }
}

export function writeWorkspaceEnvelope<T>(workspaceId: string, envelope: WorkspaceEnvelope<T>): void {
  const compressed = compressToUTF16(JSON.stringify(envelope));
  localStorage.setItem(workspaceKey(workspaceId), `${compressedWorkspacePrefix}${compressed}`);
}

export async function openSheetWindow(workspaceId: string, harnessId: string): Promise<void> {
  const params = new URLSearchParams({ workspace: workspaceId, harness: harnessId, window: "sheet" });
  const url = `/?${params.toString()}`;
  if (!isTauri()) {
    window.open(url, `sheet-${crypto.randomUUID()}`, "width=1600,height=920");
    return;
  }
  const windowHandle = new WebviewWindow(`sheet-${crypto.randomUUID()}`, {
    url,
    title: "Harness Designer · 하네스 시트",
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
