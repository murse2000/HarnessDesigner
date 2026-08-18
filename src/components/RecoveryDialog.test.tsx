import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { backendInvoke } from "../platform";
import { RecoveryDialog, type RecoveryEntry } from "./RecoveryDialog";

vi.mock("../platform", () => ({ backendInvoke: vi.fn() }));
vi.mock("../windowing", () => ({ openProjectWorkspace: vi.fn() }));

const entries: RecoveryEntry[] = [
  { path: "/recovery/one.harness", projectName: "첫 프로젝트", projectNumber: "PRJ-001", updatedAt: "2026-08-18 20:00" },
  { path: "/recovery/two.harness", projectName: "둘째 프로젝트", projectNumber: "PRJ-002", updatedAt: "2026-08-18 20:10" },
];

describe("저장되지 않은 프로젝트 복구", () => {
  beforeEach(() => vi.mocked(backendInvoke).mockReset());

  it("전체 삭제를 다시 확인한 뒤 모든 복구본을 한 번에 삭제한다", async () => {
    const onClose = vi.fn();
    const onChange = vi.fn();
    vi.mocked(backendInvoke).mockResolvedValue(undefined);
    render(<RecoveryDialog entries={entries} onClose={onClose} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "전체 삭제" }));
    expect(backendInvoke).not.toHaveBeenCalled();
    expect(screen.getByText("2개의 자동 저장 복구본을 모두 삭제합니다.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "2개 모두 삭제" }));
    await waitFor(() => expect(backendInvoke).toHaveBeenCalledWith("delete_recovery_snapshots", {
      paths: ["/recovery/one.harness", "/recovery/two.harness"],
    }));
    expect(onChange).toHaveBeenCalledWith([]);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("전체 삭제 확인을 취소하면 복구본을 유지한다", () => {
    render(<RecoveryDialog entries={entries} onClose={vi.fn()} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "전체 삭제" }));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    expect(screen.getByRole("button", { name: "전체 삭제" })).toBeTruthy();
    expect(backendInvoke).not.toHaveBeenCalled();
  });
});
