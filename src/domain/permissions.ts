import type { ProjectRole } from "./types";

export type ProjectPermission = "design" | "review" | "admin";

export function canProjectRole(role: ProjectRole | undefined, permission: ProjectPermission): boolean {
  if (!role) return true;
  if (role === "owner") return true;
  if (role === "editor") return permission !== "admin";
  return role === "reviewer" && permission === "review";
}
