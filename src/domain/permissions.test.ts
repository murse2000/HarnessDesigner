import { describe, expect, it } from "vitest";
import { canProjectRole } from "./permissions";

describe("프로젝트 역할 권한", () => {
  it("로컬 사용자와 Owner는 모든 작업을 수행한다", () => {
    expect(canProjectRole(undefined, "admin")).toBe(true);
    expect(canProjectRole("owner", "design")).toBe(true);
    expect(canProjectRole("owner", "review")).toBe(true);
    expect(canProjectRole("owner", "admin")).toBe(true);
  });

  it("Editor는 설계와 검토, Reviewer는 검토만 수행한다", () => {
    expect(canProjectRole("editor", "design")).toBe(true);
    expect(canProjectRole("editor", "review")).toBe(true);
    expect(canProjectRole("editor", "admin")).toBe(false);
    expect(canProjectRole("reviewer", "design")).toBe(false);
    expect(canProjectRole("reviewer", "review")).toBe(true);
  });

  it("Viewer는 프로젝트를 변경하지 못한다", () => {
    expect(canProjectRole("viewer", "design")).toBe(false);
    expect(canProjectRole("viewer", "review")).toBe(false);
    expect(canProjectRole("viewer", "admin")).toBe(false);
  });
});
