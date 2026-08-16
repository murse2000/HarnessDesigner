import { afterEach, describe, expect, it, vi } from "vitest";
import { findDockTarget, isNearDockTarget, openDetachedView, openLibraryWindow } from "./windowing";

describe("openLibraryWindow", () => {
  afterEach(() => vi.restoreAllMocks());

  it("같은 세션에서 재사용할 수 있는 라이브러리 창 이름으로 연다", async () => {
    const openWindow = vi.spyOn(window, "open").mockReturnValue(null);

    await openLibraryWindow("session-1");

    expect(openWindow).toHaveBeenCalledWith(
      "/?session=session-1&view=library",
      "library-session-1",
      "width=1100,height=760",
    );
  });
});

describe("openDetachedView", () => {
  afterEach(() => vi.restoreAllMocks());

  it("하단 패널의 활성 탭을 전달하고 창이 닫히면 복귀 콜백을 연결한다", async () => {
    const addEventListener = vi.fn();
    const openWindow = vi.spyOn(window, "open").mockReturnValue({ addEventListener } as unknown as Window);
    const onClosed = vi.fn();

    await openDetachedView("session-1", "bottom", { bottomView: "bom", onClosed });

    expect(openWindow).toHaveBeenCalledWith(
      "/?session=session-1&view=bottom&bottom=bom",
      expect.stringMatching(/^hd-bottom-/),
      "width=1100,height=760",
    );
    expect(addEventListener).toHaveBeenCalledWith("beforeunload", onClosed, { once: true });
  });
});

describe("isNearDockTarget", () => {
  const host = { x: 400, y: 100, width: 1200, height: 800 };

  it("각 패널의 원래 가장자리에서만 마그넷 도킹한다", () => {
    expect(isNearDockTarget("navigator", { x: 80, y: 180, width: 300, height: 500 }, host, 24)).toBe(true);
    expect(isNearDockTarget("inspector", { x: 1620, y: 180, width: 300, height: 500 }, host, 24)).toBe(true);
    expect(isNearDockTarget("bottom", { x: 600, y: 920, width: 700, height: 400 }, host, 24)).toBe(true);
  });

  it("대상 가장자리와 멀면 도킹하지 않는다", () => {
    expect(isNearDockTarget("navigator", { x: 900, y: 180, width: 300, height: 500 }, host, 24)).toBe(false);
    expect(isNearDockTarget("inspector", { x: 80, y: 180, width: 300, height: 500 }, host, 24)).toBe(false);
    expect(isNearDockTarget("bottom", { x: 600, y: 180, width: 700, height: 400 }, host, 24)).toBe(false);
  });

  it("두 메인 창 중 실제로 가까운 창을 도킹 대상으로 선택한다", () => {
    const hosts = [
      { label: "main-a", x: 100, y: 100, width: 900, height: 700 },
      { label: "main-b", x: 1200, y: 100, width: 900, height: 700 },
    ];

    expect(findDockTarget("navigator", { x: 900, y: 180, width: 280, height: 500 }, hosts, 24)).toBe("main-b");
    expect(findDockTarget("inspector", { x: 2120, y: 180, width: 280, height: 500 }, hosts, 24)).toBe("main-b");
    expect(findDockTarget("bottom", { x: 1320, y: 820, width: 650, height: 300 }, hosts, 24)).toBe("main-b");
  });
});
