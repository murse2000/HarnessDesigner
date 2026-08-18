import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../store/projectStore", () => ({ useProjectStore: vi.fn() }));

import { CableCoreColorInput } from "./CableRunDialog";

describe("CableCoreColorInput", () => {
  it("전선 색상 코드와 실제 색상 견본을 함께 표시한다", () => {
    const onChange = vi.fn();
    const { container } = render(<CableCoreColorInput ariaLabel="CORE 1 색상" disabled={false} value="RD" onChange={onChange} />);

    expect(container.querySelector(".cable-core-color-input")).toHaveStyle({ "--wire-color": "#d23b3b" });
    fireEvent.change(screen.getByLabelText("CORE 1 색상"), { target: { value: "GN" } });
    expect(onChange).toHaveBeenCalledWith("GN");
  });
});
