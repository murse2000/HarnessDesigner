import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AutoUpdater } from "./AutoUpdater";

const checkMock = vi.fn();
const relaunchMock = vi.fn();

vi.mock("../platform", () => ({ isTauri: () => true }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: () => checkMock() }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: () => relaunchMock() }));

describe("자동 업데이트", () => {
  beforeEach(() => {
    checkMock.mockReset();
    relaunchMock.mockReset();
    vi.spyOn(window, "confirm").mockReturnValue(false);
  });

  it("시작 시 최신 버전을 확인한다", async () => {
    checkMock.mockResolvedValue(null);
    render(<AutoUpdater />);

    expect(await screen.findByRole("button", { name: "최신 버전" })).toBeInTheDocument();
    expect(checkMock).toHaveBeenCalledTimes(1);
  });

  it("새 버전을 알리고 다운로드한 뒤 앱을 재실행한다", async () => {
    const downloadAndInstall = vi.fn(async (listener: (event: unknown) => void) => {
      listener({ event: "Started", data: { contentLength: 100 } });
      listener({ event: "Progress", data: { chunkLength: 40 } });
      listener({ event: "Finished" });
    });
    checkMock.mockResolvedValue({ version: "0.4.0", downloadAndInstall });
    render(<AutoUpdater />);

    const updateButton = await screen.findByRole("button", { name: "v0.4.0 업데이트" });
    expect(window.confirm).toHaveBeenCalledWith("Harness Designer v0.4.0 업데이트가 있습니다. 지금 설치하시겠습니까?");
    fireEvent.click(updateButton);

    await waitFor(() => expect(downloadAndInstall).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(relaunchMock).toHaveBeenCalledTimes(1));
  });
});
