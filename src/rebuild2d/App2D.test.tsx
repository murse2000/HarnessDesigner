import { createEvent, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App2D from "./App2D";

function addConnector(name: string, pinCount: number) {
  fireEvent.click(screen.getByRole("button", { name: "커넥터" }));
  const dialog = screen.getByText("새 2D 부품 인스턴스를 만듭니다.").closest("form")!;
  fireEvent.change(within(dialog).getByLabelText("파트명"), { target: { value: name } });
  fireEvent.change(within(dialog).getByLabelText("핀 수"), { target: { value: String(pinCount) } });
  fireEvent.click(within(dialog).getByRole("button", { name: "추가" }));
}

describe("새 2D 편집 화면", () => {
  beforeEach(() => installLocalStorage());

  it("용지 기준 PDF와 인쇄 명령을 제공한다", () => {
    render(<App2D />);

    expect(screen.getByRole("button", { name: "PDF" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "인쇄" })).toBeEnabled();
    expect(screen.queryByText("새 2D 엔진")).not.toBeInTheDocument();
  });

  it("환경설정을 저장하고 캔버스에 즉시 반영한다", () => {
    const view = render(<App2D />);

    fireEvent.click(screen.getByRole("button", { name: "환경설정" }));
    const dialog = screen.getByRole("dialog", { name: "환경설정" });
    fireEvent.click(within(dialog).getByRole("button", { name: "2D 편집" }));
    expect(screen.getByLabelText("가로 눈금자")).toBeInTheDocument();
    expect(screen.getByLabelText("세로 눈금자")).toBeInTheDocument();
    expect(screen.getByLabelText("도면 템플릿")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByLabelText("그리드 표시"));
    fireEvent.click(within(dialog).getByLabelText("눈금자 표시"));
    fireEvent.click(within(dialog).getByLabelText("도면 템플릿 표시"));
    fireEvent.change(within(dialog).getByLabelText("그리드 간격"), { target: { value: "25" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "적용" }));

    expect(document.querySelector(".hd2-grid")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("도면 템플릿")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("가로 눈금자")).not.toBeInTheDocument();
    view.unmount();
    render(<App2D />);
    fireEvent.click(screen.getByRole("button", { name: "환경설정" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "환경설정" })).getByRole("button", { name: "2D 편집" }));
    expect(screen.getByLabelText("그리드 표시")).not.toBeChecked();
    expect(screen.getByLabelText("눈금자 표시")).not.toBeChecked();
    expect(screen.getByLabelText("도면 템플릿 표시")).not.toBeChecked();
    expect(screen.getByLabelText("그리드 간격")).toHaveValue(25);
  });

  it("마우스 좌표와 단일 선택 커넥터 좌표를 상태 표시줄에 표시한다", () => {
    render(<App2D />);
    addConnector("좌표 확인", 2);

    expect(screen.getByText("SELECT J1 · X 100.0 · Y 100.0")).toBeInTheDocument();
    fireEvent.pointerMove(screen.getByLabelText("하네스 2D 도면"), { clientX: 240, clientY: 140 });
    expect(screen.getByText("CURSOR · X 200.0 · Y 100.0")).toBeInTheDocument();
  });

  it("상세 제목란 정보를 편집하고 라벨을 이동 및 크기 조정한다", () => {
    render(<App2D />);

    expect(screen.getByLabelText("도면 템플릿")).toHaveTextContent("DATE");
    expect(screen.getByLabelText("도면 템플릿")).toHaveTextContent("DRAWN");
    expect(screen.getByLabelText("도면 템플릿")).toHaveTextContent("CHECKED");
    expect(screen.getByLabelText("도면 템플릿")).toHaveTextContent("APPROVED");
    expect(screen.getByLabelText("도면 프로젝트 번호").tagName).toBe("text");
    expect(screen.getByLabelText("도면 프로젝트 번호")).toHaveAttribute("y", "15");
    expect(screen.getByLabelText("도면 생성일").tagName).toBe("text");
    expect(screen.getByLabelText("도면 생성일")).toHaveAttribute("y", "15");
    fireEvent.change(screen.getByLabelText("작성자"), { target: { value: "홍길동" } });
    fireEvent.change(screen.getByLabelText("검토자"), { target: { value: "김검토" } });
    expect(screen.getByLabelText("도면 작성자")).toHaveTextContent("홍길동");
    expect(screen.getByLabelText("도면 검토자")).toHaveTextContent("김검토");

    fireEvent.click(screen.getByLabelText("도면 제목"));
    fireEvent.change(screen.getByRole("textbox", { name: "도면 제목" }), { target: { value: "제조 도면" } });
    fireEvent.blur(screen.getByRole("textbox", { name: "도면 제목" }));
    fireEvent.click(screen.getByLabelText("도면 하네스 이름"));
    fireEvent.change(screen.getByRole("textbox", { name: "도면 하네스 이름" }), { target: { value: "전원 하네스" } });
    fireEvent.blur(screen.getByRole("textbox", { name: "도면 하네스 이름" }));
    expect(screen.getByLabelText("도면 제목")).toHaveTextContent("제조 도면");
    expect(screen.getByLabelText("하네스 이름")).toHaveValue("전원 하네스");

    fireEvent.click(screen.getByRole("button", { name: "라벨" }));
    const canvas = screen.getByLabelText("하네스 2D 도면");
    const label = screen.getByLabelText("LABEL 주석");
    fireEvent.change(screen.getByLabelText("텍스트"), { target: { value: "검사 라벨" } });
    fireEvent.change(screen.getByLabelText("채우기 색상"), { target: { value: "#ffeeaa" } });
    expect(screen.getByLabelText("검사 라벨 주석")).toHaveTextContent("검사 라벨");

    fireEvent.pointerDown(screen.getByLabelText("검사 라벨 주석"), { button: 0, pointerId: 21, clientX: 160, clientY: 120 });
    fireEvent.pointerMove(canvas, { pointerId: 21, clientX: 200, clientY: 150 });
    fireEvent.pointerUp(canvas, { pointerId: 21, clientX: 200, clientY: 150 });
    expect(screen.getByLabelText("검사 라벨 주석")).toHaveAttribute("transform", "translate(160 110)");

    fireEvent.pointerDown(screen.getByLabelText("검사 라벨 크기 조정"), { button: 0, pointerId: 22, clientX: 280, clientY: 140 });
    fireEvent.pointerMove(canvas, { pointerId: 22, clientX: 320, clientY: 170 });
    fireEvent.pointerUp(canvas, { pointerId: 22, clientX: 320, clientY: 170 });
    expect(screen.getByLabelText("너비")).toHaveValue(160);
    expect(screen.getByLabelText("높이")).toHaveValue(60);
    expect(label).toBeInTheDocument();
  });

  it("좌측 추가 버튼으로 새 빈 하네스 도면을 생성하고 활성화한다", () => {
    render(<App2D />);

    fireEvent.click(screen.getByRole("button", { name: "새 하네스 도면 생성" }));

    expect(screen.getByRole("button", { name: "HNS-002 하네스 도면" })).toHaveClass("is-selected");
    expect(screen.getByText("HNS-002 빈 하네스 도면을 생성했습니다.")).toBeInTheDocument();
    expect(screen.getByText("빈 2D 도면")).toBeInTheDocument();
  });

  it("선택한 하네스 도면을 확인 후 삭제하고 인접 도면으로 전환한다", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App2D />);
    expect(screen.getByRole("button", { name: "선택한 하네스 도면 삭제" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "새 하네스 도면 생성" }));
    fireEvent.click(screen.getByRole("button", { name: "선택한 하네스 도면 삭제" }));

    expect(screen.queryByRole("button", { name: "HNS-002 하네스 도면" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "HNS-001 하네스 도면" })).toHaveClass("is-selected");
    expect(screen.getByText("HNS-002 하네스 도면을 삭제했습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "선택한 하네스 도면 삭제" })).toBeDisabled();
  });

  it("좌측 하네스 행을 드래그해 도면 순서를 변경한다", () => {
    render(<App2D />);
    fireEvent.click(screen.getByRole("button", { name: "새 하네스 도면 생성" }));
    fireEvent.click(screen.getByRole("button", { name: "새 하네스 도면 생성" }));
    const source = screen.getByRole("button", { name: "HNS-003 하네스 도면" });
    fireEvent.dragStart(source);
    const target = screen.getByRole("button", { name: "HNS-001 하네스 도면" });
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, top: 0, left: 0, right: 220, bottom: 32, width: 220, height: 32, toJSON: () => ({}),
    });

    const dragOver = createEvent.dragOver(target);
    Object.defineProperty(dragOver, "clientY", { value: 4 });
    fireEvent(target, dragOver);
    const drop = createEvent.drop(target);
    Object.defineProperty(drop, "clientY", { value: 4 });
    fireEvent(target, drop);

    expect(screen.getAllByRole("button", { name: /HNS-\d+ 하네스 도면/ }).map((button) => button.getAttribute("aria-label"))).toEqual([
      "HNS-003 하네스 도면",
      "HNS-001 하네스 도면",
      "HNS-002 하네스 도면",
    ]);
    expect(screen.getByText("HNS-003 도면을 HNS-001 앞에 이동했습니다.")).toBeInTheDocument();
  });

  it("이미지 파일을 도면 요소로 삽입한다", async () => {
    render(<App2D />);
    const file = new File(["<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'/>"], "symbol.svg", { type: "image/svg+xml" });

    fireEvent.change(screen.getByLabelText("도면 이미지 파일"), { target: { files: [file] } });

    const annotation = await screen.findByLabelText("image 주석");
    expect(annotation.querySelector("image")?.getAttribute("href")).toMatch(/^data:image\/svg\+xml/);
    expect(screen.getByLabelText("너비")).toHaveValue(160);
    expect(screen.getByLabelText("높이")).toHaveValue(100);
  });

  it("외부 부품 라이브러리 관리 화면을 연다", () => {
    render(<App2D />);

    fireEvent.click(screen.getByRole("button", { name: "부품 라이브러리" }));

    expect(screen.getByRole("dialog", { name: "외부 2D 부품 라이브러리" })).toBeInTheDocument();
    expect(screen.getByText("연결된 외부 라이브러리가 없습니다.")).toBeInTheDocument();
  });

  it("빈 프로젝트에서 커넥터를 추가하고 핀을 직접 연결한다", () => {
    render(<App2D />);
    expect(screen.getByText("빈 2D 도면")).toBeInTheDocument();

    addConnector("첫 번째", 2);
    addConnector("두 번째", 2);

    const firstPin = screen.getByLabelText("J1 핀 1");
    const secondPin = screen.getByLabelText("J2 핀 2");
    fireEvent.pointerDown(firstPin, { button: 0, clientX: 350, clientY: 193 });
    fireEvent.pointerMove(screen.getByLabelText("하네스 2D 도면"), { clientX: 500, clientY: 220 });
    fireEvent.pointerUp(secondPin, { button: 0, clientX: 490, clientY: 219 });

    expect(screen.getByLabelText("J1 커넥터 핀맵")).toHaveTextContent("J2:2");
    expect(screen.getByLabelText("J2 커넥터 핀맵")).toHaveTextContent("J1:1");
    expect(screen.getByText("핀 연결을 추가했습니다.")).toBeInTheDocument();

    const firstPinMap = screen.getByLabelText("J1 커넥터 핀맵");
    const transformBeforeMove = firstPinMap.getAttribute("transform");
    fireEvent.pointerDown(firstPinMap, { button: 0, pointerId: 9, clientX: 420, clientY: 180 });
    fireEvent.pointerMove(screen.getByLabelText("하네스 2D 도면"), { pointerId: 9, clientX: 480, clientY: 230 });
    fireEvent.pointerUp(screen.getByLabelText("하네스 2D 도면"), { pointerId: 9, clientX: 480, clientY: 230 });

    expect(firstPinMap.getAttribute("transform")).not.toBe(transformBeforeMove);
    expect(firstPinMap).toHaveClass("is-selected");

    const wireName = screen.getByLabelText("J1 핀 1 선 이름");
    const transformBeforeEditing = firstPinMap.getAttribute("transform");
    fireEvent.pointerDown(wireName, { button: 0, pointerId: 10, clientX: 480, clientY: 240 });
    fireEvent.pointerMove(screen.getByLabelText("하네스 2D 도면"), { pointerId: 10, clientX: 540, clientY: 290 });
    fireEvent.pointerUp(screen.getByLabelText("하네스 2D 도면"), { pointerId: 10, clientX: 540, clientY: 290 });
    expect(firstPinMap.getAttribute("transform")).toBe(transformBeforeEditing);

    fireEvent.change(wireName, { target: { value: "SENSOR_POWER" } });
    fireEvent.blur(wireName);
    expect(wireName).toHaveValue("SENSOR_POWER");
    expect(screen.getByLabelText("J2 핀 2 선 이름")).toHaveValue("SENSOR_POWER");
    expect(screen.getByText("SENSOR_POWER", { selector: ".hd2-wire-label" })).toBeInTheDocument();
  });

  it("선택한 커넥터를 중심 기준으로 90도 회전한다", () => {
    render(<App2D />);
    addConnector("회전 확인", 2);
    addConnector("연결 대상", 2);
    fireEvent.pointerDown(screen.getByLabelText("J1 핀 1"), { button: 0, clientX: 350, clientY: 193 });
    fireEvent.pointerUp(screen.getByLabelText("J2 핀 1"), { button: 0, clientX: 490, clientY: 193 });
    const wirePath = screen.getByLabelText("W1 전선").nextElementSibling!;
    const pathBeforeRotation = wirePath.getAttribute("d");
    const canvas = screen.getByLabelText("하네스 2D 도면");
    fireEvent.pointerDown(screen.getByTestId("connector-J1"), { button: 0, pointerId: 7, clientX: 180, clientY: 150 });
    fireEvent.pointerUp(canvas, { pointerId: 7, clientX: 180, clientY: 150 });

    fireEvent.click(screen.getByRole("button", { name: "선택 90° 회전" }));

    expect(screen.getByTestId("connector-geometry-J1").getAttribute("transform")).toContain("rotate(90 110 55.5)");
    expect(screen.getByLabelText("J1 참조 라벨").getAttribute("transform")).toContain("rotate(0)");
    expect(screen.getByLabelText("커넥터 회전")).toHaveValue("90");
    expect(wirePath.getAttribute("d")).not.toBe(pathBeforeRotation);

    const referenceLabel = screen.getByLabelText("J1 참조 라벨");
    const originalLabelTransform = referenceLabel.getAttribute("transform");
    fireEvent.pointerDown(referenceLabel, { button: 0, pointerId: 9, clientX: 250, clientY: 120 });
    fireEvent.pointerMove(canvas, { pointerId: 9, clientX: 290, clientY: 150 });
    fireEvent.pointerUp(canvas, { pointerId: 9, clientX: 290, clientY: 150 });
    expect(screen.getByLabelText("J1 참조 라벨").getAttribute("transform")).not.toBe(originalLabelTransform);

    fireEvent.change(screen.getByLabelText("참조 라벨 각도"), { target: { value: "35" } });
    expect(screen.getByLabelText("J1 참조 라벨").getAttribute("transform")).toContain("rotate(35)");

    fireEvent.pointerDown(referenceLabel, { button: 0, pointerId: 10, clientX: 290, clientY: 150 });
    fireEvent.pointerUp(canvas, { pointerId: 10, clientX: 290, clientY: 150 });
    fireEvent.keyDown(window, { key: "r" });
    expect(screen.getByLabelText("J1 참조 라벨").getAttribute("transform")).toContain("rotate(125)");
    expect(screen.getByTestId("connector-geometry-J1").getAttribute("transform")).toContain("rotate(90 110 55.5)");

    fireEvent.pointerDown(screen.getByTestId("connector-J1"), { button: 0, pointerId: 11, clientX: 180, clientY: 150 });
    fireEvent.pointerUp(canvas, { pointerId: 11, clientX: 180, clientY: 150 });
    fireEvent.keyDown(window, { key: "r" });
    expect(screen.getByTestId("connector-geometry-J1").getAttribute("transform")).toContain("rotate(180 110 55.5)");

    const rotationInput = screen.getByLabelText("참조 라벨 각도");
    fireEvent.keyDown(rotationInput, { key: "r" });
    expect(screen.getByTestId("connector-geometry-J1").getAttribute("transform")).toContain("rotate(180 110 55.5)");
  });

  it("선택한 커넥터의 크기 핸들을 끌어 표시 배율을 조정한다", () => {
    render(<App2D />);
    addConnector("배율 확인", 2);
    const canvas = screen.getByLabelText("하네스 2D 도면");
    const handle = screen.getByLabelText("J1 크기 조절");

    fireEvent.pointerDown(handle, { button: 0, pointerId: 21, clientX: 360, clientY: 251 });
    fireEvent.pointerMove(canvas, { pointerId: 21, clientX: 470, clientY: 306.5 });
    fireEvent.pointerUp(canvas, { pointerId: 21, clientX: 470, clientY: 306.5 });

    expect(screen.getByTestId("connector-geometry-J1").getAttribute("transform")).toContain("scale(2)");
    expect(screen.getByText("표시 배율 · 200%")).toBeInTheDocument();
  });

  it("마우스 휠 확대 배율을 작은 단계로 조정한다", () => {
    render(<App2D />);
    const canvas = screen.getByLabelText("하네스 2D 도면");

    fireEvent.wheel(canvas, { deltaY: -100, deltaMode: 0, clientX: 300, clientY: 200 });

    expect(screen.getByText("106%")).toBeInTheDocument();
  });

  it("선택한 전선의 경로 핸들을 드래그하고 한 번에 실행 취소한다", () => {
    render(<App2D />);
    addConnector("첫 번째", 2);
    addConnector("두 번째", 2);

    fireEvent.pointerDown(screen.getByLabelText("J1 핀 1"), { button: 0, clientX: 350, clientY: 193 });
    fireEvent.pointerUp(screen.getByLabelText("J2 핀 1"), { button: 0, clientX: 490, clientY: 193 });
    const canvas = screen.getByLabelText("하네스 2D 도면");
    const handle = screen.getByLabelText("W1 전선 경로 핸들");
    const originalX = handle.getAttribute("cx");

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 500, clientY: 220 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 700, clientY: 440 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 700, clientY: 440 });

    expect(screen.getByLabelText("W1 전선 경로 핸들")).toHaveAttribute("cx", "660");
    expect(screen.getByLabelText("W1 전선").getAttribute("d")).toContain(" Q ");
    fireEvent.click(screen.getByTitle("실행 취소 (⌘/Ctrl+Z)"));
    fireEvent.pointerDown(screen.getByLabelText("W1 전선"), { button: 0 });
    expect(screen.getByLabelText("W1 전선 경로 핸들").getAttribute("cx")).toBe(originalX);
  });

  it("박스로 전체 하네스를 선택하고 Delete 키로 한 번에 삭제한다", () => {
    render(<App2D />);
    addConnector("첫 번째", 2);
    addConnector("두 번째", 2);
    fireEvent.pointerDown(screen.getByLabelText("J1 핀 1"), { button: 0, clientX: 350, clientY: 193 });
    fireEvent.pointerUp(screen.getByLabelText("J2 핀 1"), { button: 0, clientX: 490, clientY: 193 });

    const canvas = screen.getByLabelText("하네스 2D 도면");
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 2, clientX: 80, clientY: 80 });
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 900, clientY: 520 });
    expect(screen.getByLabelText("박스 선택 영역")).toBeInTheDocument();
    fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 900, clientY: 520 });

    expect(screen.getByTestId("connector-J1")).toHaveClass("is-selected");
    expect(screen.getByTestId("connector-J2")).toHaveClass("is-selected");
    expect(screen.getByLabelText("W1 전선").nextElementSibling).toHaveClass("is-selected");

    fireEvent.keyDown(window, { key: "Delete" });
    expect(screen.getByText("빈 2D 도면")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "PIN MAP 0" })).toBeInTheDocument();
  });

  it("박스로 선택한 두 커넥터를 함께 이동하고 한 번에 실행 취소한다", () => {
    render(<App2D />);
    addConnector("첫 번째", 2);
    addConnector("두 번째", 2);
    addConnector("선택 제외", 2);

    const canvas = screen.getByLabelText("하네스 2D 도면");
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 3, clientX: 80, clientY: 80 });
    fireEvent.pointerMove(canvas, { pointerId: 3, clientX: 800, clientY: 350 });
    fireEvent.pointerUp(canvas, { pointerId: 3, clientX: 800, clientY: 350 });

    const first = screen.getByTestId("connector-J1");
    const second = screen.getByTestId("connector-J2");
    const excluded = screen.getByTestId("connector-J3");
    fireEvent.pointerDown(first, { button: 0, pointerId: 4, clientX: 180, clientY: 150 });
    fireEvent.pointerMove(canvas, { pointerId: 4, clientX: 280, clientY: 250 });
    fireEvent.pointerUp(canvas, { pointerId: 4, clientX: 280, clientY: 250 });

    expect(first).toHaveAttribute("transform", "translate(200 200)");
    expect(second).toHaveAttribute("transform", "translate(590 200)");
    expect(excluded).toHaveAttribute("transform", "translate(880 100)");

    fireEvent.click(screen.getByTitle("실행 취소 (⌘/Ctrl+Z)"));
    expect(screen.getByTestId("connector-J1")).toHaveAttribute("transform", "translate(100 100)");
    expect(screen.getByTestId("connector-J2")).toHaveAttribute("transform", "translate(490 100)");
  });

  it("전체 선택한 하네스 도면의 커넥터와 연결을 함께 붙여넣고 한 번에 실행 취소한다", () => {
    render(<App2D />);
    addConnector("첫 번째", 2);
    addConnector("두 번째", 2);
    fireEvent.pointerDown(screen.getByLabelText("J1 핀 1"), { button: 0, clientX: 350, clientY: 193 });
    fireEvent.pointerUp(screen.getByLabelText("J2 핀 1"), { button: 0, clientX: 490, clientY: 193 });

    fireEvent.keyDown(window, { key: "a", metaKey: true });
    fireEvent.keyDown(window, { key: "c", metaKey: true });
    fireEvent.paste(window, { clipboardData: { items: [] } });

    expect(screen.getByTestId("connector-J1")).toHaveAttribute("transform", "translate(100 100)");
    expect(screen.getByTestId("connector-J2")).toHaveAttribute("transform", "translate(490 100)");
    expect(screen.getByTestId("connector-J3")).toHaveAttribute("transform", "translate(120 120)");
    expect(screen.getByTestId("connector-J4")).toHaveAttribute("transform", "translate(510 120)");
    expect(screen.getByLabelText("W2 전선")).toBeInTheDocument();
    expect(screen.getByText("2개 부품 · 1개 연결을 붙여넣었습니다.")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("실행 취소 (⌘/Ctrl+Z)"));
    expect(screen.queryByTestId("connector-J3")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("W2 전선")).not.toBeInTheDocument();
  });

  it("좌측 하네스 행을 복사해 독립된 새 하네스 도면으로 붙여넣는다", () => {
    render(<App2D />);
    addConnector("첫 번째", 2);
    addConnector("두 번째", 2);
    fireEvent.pointerDown(screen.getByLabelText("J1 핀 1"), { button: 0, clientX: 350, clientY: 193 });
    fireEvent.pointerUp(screen.getByLabelText("J2 핀 1"), { button: 0, clientX: 490, clientY: 193 });

    fireEvent.click(screen.getByRole("button", { name: "HNS-001 하네스 도면" }));
    fireEvent.keyDown(window, { key: "c", metaKey: true });
    fireEvent.paste(window, { clipboardData: { items: [] } });

    expect(screen.getByRole("button", { name: "HNS-002 하네스 도면" })).toHaveClass("is-selected");
    expect(screen.getByText("HNS-002 하네스 도면을 붙여넣었습니다.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "PIN MAP 1" })).toBeInTheDocument();
    expect(screen.getByTestId("connector-J1")).toHaveAttribute("transform", "translate(100 100)");
    expect(screen.getByTestId("connector-J2")).toHaveAttribute("transform", "translate(490 100)");
    expect(screen.getByLabelText("W1 전선")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "HNS-001 하네스 도면" }));
    expect(screen.getByRole("button", { name: "HNS-001 하네스 도면" })).toHaveClass("is-selected");
    expect(screen.getByRole("heading", { name: "PIN MAP 1" })).toBeInTheDocument();
    expect(screen.getByTestId("connector-J1")).toHaveAttribute("transform", "translate(100 100)");
  });
});

function installLocalStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => { values.delete(key); },
      setItem: (key: string, value: string) => { values.set(key, value); },
    } satisfies Storage,
  });
}
