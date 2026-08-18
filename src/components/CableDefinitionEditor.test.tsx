import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { defaultCableCores } from "../domain/cables";
import { CableDefinitionEditor } from "./CableDefinitionEditor";

const commonProps = {
  cores: defaultCableCores(2),
  commonGauge: "",
  shieldCount: "1",
  drainWireColor: "BARE",
  drainWireGauge: "",
  minimumBendRadiusMm: "",
  onCoreChange: vi.fn(),
  onCommonGaugeChange: vi.fn(),
  onApplyCommonGauge: vi.fn(),
  onShieldCountChange: vi.fn(),
  onDrainWireColorChange: vi.fn(),
  onDrainWireGaugeChange: vi.fn(),
  onMinimumBendRadiusChange: vi.fn(),
};

describe("커스텀 멀티코어 케이블 등록 편집기", () => {
  it("심 수만큼 코어 정보를 편집하고 공통 Gauge를 일괄 적용한다", () => {
    const onCoreChange = vi.fn();
    const onApplyCommonGauge = vi.fn();
    render(<CableDefinitionEditor {...commonProps} construction="multiCore" onCoreChange={onCoreChange} onApplyCommonGauge={onApplyCommonGauge} />);

    expect(screen.getAllByRole("row")).toHaveLength(3);
    fireEvent.change(screen.getByLabelText("1 이름"), { target: { value: "POWER +" } });
    fireEvent.click(screen.getByRole("button", { name: "전체 적용" }));

    expect(onCoreChange).toHaveBeenCalledWith("1", "name", "POWER +");
    expect(onApplyCommonGauge).toHaveBeenCalledOnce();
  });

  it("색상 코드는 실제 색상 견본과 색상명으로 편집한다", () => {
    const onCoreChange = vi.fn();
    render(<CableDefinitionEditor {...commonProps} construction="multiCore" onCoreChange={onCoreChange} />);

    const black = screen.getByLabelText("1 색상");
    expect(black).toHaveValue("BK");
    expect(black).toHaveTextContent("검정");
    expect(black.parentElement).toHaveStyle({ "--wire-color": "#26323d" });

    fireEvent.change(black, { target: { value: "RD" } });
    expect(onCoreChange).toHaveBeenCalledWith("1", "color", "RD");
  });

  it("실드 케이블에는 복수 드레인 결선 정의를 표시한다", () => {
    render(<CableDefinitionEditor {...commonProps} construction="shieldedMultiCore" />);

    expect(screen.getByLabelText("쉴드/드레인 결선 수")).toBeTruthy();
    expect(screen.getByLabelText("드레인 색상")).toBeTruthy();
    expect(screen.getByLabelText("드레인 Gauge")).toBeTruthy();
  });
});
