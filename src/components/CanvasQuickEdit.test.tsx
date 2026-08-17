import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CanvasQuickEdit } from "./CanvasQuickEdit";

describe("CanvasQuickEdit", () => {
  it("도면 부품의 참조명과 표시명을 한 번에 저장한다", () => {
    const onSave = vi.fn();
    render(<CanvasQuickEdit target={{ kind: "node", id: "j1", reference: "J1", label: "MAIN" }} x={100} y={100} onCancel={vi.fn()} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText("참조명"), { target: { value: " J10 " } });
    fireEvent.change(screen.getByLabelText("표시명"), { target: { value: " SENSOR " } });
    fireEvent.submit(screen.getByRole("dialog"));

    expect(onSave).toHaveBeenCalledWith({ kind: "node", id: "j1", reference: " J10 ", label: " SENSOR " });
  });

  it("일반 구간의 길이가 0이면 저장하지 않는다", () => {
    const onSave = vi.fn();
    render(<CanvasQuickEdit target={{ kind: "segment", id: "s1", label: "SEG 1", lengthMm: 0 }} x={100} y={100} onCancel={vi.fn()} onSave={onSave} />);

    fireEvent.submit(screen.getByRole("dialog"));

    expect(screen.getByText("구간명과 0보다 큰 실제 길이를 입력하세요.")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("라벨 내용을 도면 편집창에서 저장한다", () => {
    const onSave = vi.fn();
    render(<CanvasQuickEdit target={{ kind: "annotation", id: "a1", annotationKind: "label", text: "LABEL", width: 140, height: 36 }} x={100} y={100} onCancel={vi.fn()} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText("내용"), { target: { value: "ENGINE ROOM" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ kind: "annotation", id: "a1", text: "ENGINE ROOM" }));
  });
});
