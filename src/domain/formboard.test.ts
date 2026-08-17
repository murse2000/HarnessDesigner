import { describe, expect, it } from "vitest";
import { buildFormboardLayout } from "./formboard";
import { createProject } from "./sample";

describe("1:1 폼보드 배치", () => {
  it("각 번들의 도면 길이를 등록된 제조 길이와 일치시킨다", () => {
    const harness = createProject().harnesses[0];
    const layout = buildFormboardLayout(harness);

    for (const segment of harness.segments) {
      const from = layout.nodes[segment.fromNodeId];
      const to = layout.nodes[segment.toNodeId];
      expect(Math.hypot(to.x - from.x, to.y - from.y)).toBeCloseTo(segment.lengthMm, 6);
    }
  });
});
