import { describe, expect, it } from "vitest";
import { orthogonalConductorPath } from "./EditableConductorEdge";

describe("orthogonalConductorPath", () => {
  it("사용자 bendX를 지나는 직교 경로를 만든다", () => {
    const path = orthogonalConductorPath(10, 20, 110, 80, 70);
    expect(path).toContain("L 70 72");
    expect(path).toContain("Q 70 80 78 80");
  });

  it("같은 높이의 핀은 불필요하게 꺾지 않는다", () => {
    expect(orthogonalConductorPath(10, 20, 110, 20, 70)).toBe("M 10 20 L 110 20");
  });
});
