import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Download } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "../platform";

type UpdateStatus =
  | { kind: "checking" }
  | { kind: "current" }
  | { kind: "available"; version: string }
  | { kind: "downloading"; progress: number | null }
  | { kind: "error" };

export function AutoUpdater() {
  const updateRef = useRef<Update | null>(null);
  const startedRef = useRef(false);
  const [status, setStatus] = useState<UpdateStatus>({ kind: "checking" });

  const installUpdate = useCallback(async () => {
    const update = updateRef.current;
    if (!update) return;
    let downloaded = 0;
    let contentLength = 0;
    setStatus({ kind: "downloading", progress: null });
    try {
      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          contentLength = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
        }
        const progress = contentLength > 0 ? Math.min(100, Math.round((downloaded / contentLength) * 100)) : null;
        setStatus({ kind: "downloading", progress });
      });
      await relaunch();
    } catch {
      setStatus({ kind: "error" });
    }
  }, []);

  const checkForUpdate = useCallback(async () => {
    if (!isTauri()) return;
    setStatus({ kind: "checking" });
    try {
      const update = await check();
      updateRef.current = update;
      if (!update) {
        setStatus({ kind: "current" });
        return;
      }
      setStatus({ kind: "available", version: update.version });
      if (window.confirm(`Harness Designer v${update.version} 업데이트가 있습니다. 지금 설치하시겠습니까?`)) {
        await installUpdate();
      }
    } catch {
      setStatus({ kind: "error" });
    }
  }, [installUpdate]);

  useEffect(() => {
    if (!isTauri() || startedRef.current) return;
    startedRef.current = true;
    void checkForUpdate();
  }, [checkForUpdate]);

  if (!isTauri()) return null;
  const label = status.kind === "checking" ? "업데이트 확인 중"
    : status.kind === "current" ? "최신 버전"
      : status.kind === "available" ? `v${status.version} 업데이트`
        : status.kind === "downloading" ? `업데이트 ${status.progress === null ? "다운로드 중" : `${status.progress}%`}`
          : "업데이트 재확인";
  const disabled = status.kind === "checking" || status.kind === "downloading" || status.kind === "current";
  const action = status.kind === "available" ? installUpdate : checkForUpdate;

  return <button type="button" className="hd2-update-button" aria-live="polite" disabled={disabled} onClick={() => void action()}>
    <Download size={13} />{label}
  </button>;
}
