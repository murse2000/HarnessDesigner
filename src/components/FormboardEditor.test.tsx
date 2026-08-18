import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormboardPartSymbol } from "./FormboardPartSymbol";
import type { SymbolAsset } from "../domain/types";

describe("폼보드 부품 도면", () => {
  it("등록된 DXF 변환 심벌을 data 이미지가 아닌 인라인 SVG로 표시한다", () => {
    const symbol: SymbolAsset = {
      id: "connector-dxf",
      name: "Connector DXF",
      sourceFormat: "dxf",
      sourceName: "connector.dxf",
      viewBox: "-5 -2 10 4",
      svg: '<svg viewBox="-5 -2 10 4"><g stroke="currentColor"><line x1="-5" y1="0" x2="5" y2="0"/></g></svg>',
    };

    const { container } = render(<svg><FormboardPartSymbol symbol={symbol} /></svg>);
    const drawing = container.querySelector('[data-formboard-symbol="connector.dxf"]');

    expect(drawing).toHaveAttribute("viewBox", "-5 -2 10 4");
    expect(drawing?.querySelector("line")).toBeInTheDocument();
    expect(drawing?.innerHTML).toContain('stroke="#1f4668"');
    expect(container.querySelector("image")).not.toBeInTheDocument();
  });
});
