import { invoke } from "@tauri-apps/api/core";

export const isTauri = () => "__TAURI_INTERNALS__" in window;

export async function backendInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) throw new Error("Tauri backend is not available");
  return invoke<T>(command, args);
}
