import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsDialog } from "./SettingsDialog";
import { defaultSettings2D } from "./settings";

describe("2D 환경설정 라이브러리 폴더", () => {
  it("기본 폴더와 현재 라이브러리 파일을 표시하고 폴더 선택을 요청한다", () => {
    const onSelectLibraryFolder = vi.fn();
    render(<SettingsDialog
      settings={defaultSettings2D}
      libraryPath="/Libraries/HarnessDesigner-Default.hlib2d"
      libraryFolder="/Libraries"
      onApply={vi.fn()}
      onClose={vi.fn()}
      onOpenLibrary={vi.fn()}
      onSelectLibraryFolder={onSelectLibraryFolder}
    />);

    const dialog = screen.getByRole("dialog", { name: "환경설정" });
    fireEvent.click(within(dialog).getByRole("button", { name: "파일·라이브러리" }));

    expect(within(dialog).getByTitle("/Libraries")).toHaveTextContent("/Libraries");
    expect(within(dialog).getByTitle("/Libraries/HarnessDesigner-Default.hlib2d")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "폴더 지정" }));
    expect(onSelectLibraryFolder).toHaveBeenCalledOnce();
  });
});
