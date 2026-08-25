import { Settings2 } from "lucide-react";
import { useState } from "react";
import { defaultSettings2D, type AutosaveMinutes2D, type Density2D, type DrawingSheet2D, type LengthUnit2D, type Settings2D, type Theme2D } from "./settings";

type Props = {
  settings: Settings2D;
  libraryPath: string | null;
  libraryFolder: string | null;
  onApply: (settings: Settings2D) => void;
  onClose: () => void;
  onOpenLibrary: () => void;
  onSelectLibraryFolder: () => void;
};

type Tab = "general" | "canvas" | "files";

export function SettingsDialog({ settings, libraryPath, libraryFolder, onApply, onClose, onOpenLibrary, onSelectLibraryFolder }: Props) {
  const [draft, setDraft] = useState(settings);
  const [tab, setTab] = useState<Tab>("general");
  const change = <K extends keyof Settings2D>(key: K, value: Settings2D[K]) => setDraft((current) => ({ ...current, [key]: value }));

  return <div className="hd2-dialog-backdrop">
    <section className="hd2-settings-dialog" role="dialog" aria-label="환경설정">
      <header><Settings2 size={16} /><strong>환경설정</strong><span>사용자별 2D 편집 환경</span></header>
      <nav>
        <button type="button" className={tab === "general" ? "is-selected" : ""} onClick={() => setTab("general")}>일반</button>
        <button type="button" className={tab === "canvas" ? "is-selected" : ""} onClick={() => setTab("canvas")}>2D 편집</button>
        <button type="button" className={tab === "files" ? "is-selected" : ""} onClick={() => setTab("files")}>파일·라이브러리</button>
      </nav>
      <div className="hd2-settings-content">
        {tab === "general" && <>
          <h3>화면 표시</h3>
          <label><span>테마</span><select aria-label="테마" value={draft.theme} onChange={(event) => change("theme", event.target.value as Theme2D)}><option value="light">산업용 라이트</option><option value="dark">다크</option></select></label>
          <label><span>UI 밀도</span><select aria-label="UI 밀도" value={draft.density} onChange={(event) => change("density", event.target.value as Density2D)}><option value="compact">초고밀도</option><option value="comfortable">보통</option></select></label>
          <label><span>기본 글꼴 크기</span><input aria-label="기본 글꼴 크기" type="number" min="10" max="14" value={draft.fontSize} onChange={(event) => change("fontSize", Number(event.target.value))} /><em>px</em></label>
          <label><span>길이 표시 단위</span><select aria-label="길이 표시 단위" value={draft.lengthUnit} onChange={(event) => change("lengthUnit", event.target.value as LengthUnit2D)}><option value="mm">mm</option><option value="in">inch</option></select></label>
        </>}
        {tab === "canvas" && <>
          <h3>그리드와 배치</h3>
          <label><span>눈금자 표시</span><input aria-label="눈금자 표시" type="checkbox" checked={draft.rulersVisible} onChange={(event) => change("rulersVisible", event.target.checked)} /></label>
          <label><span>그리드 표시</span><input aria-label="그리드 표시" type="checkbox" checked={draft.gridVisible} onChange={(event) => change("gridVisible", event.target.checked)} /></label>
          <label><span>그리드 간격</span><input aria-label="그리드 간격" type="number" min="5" max="100" value={draft.gridSize} onChange={(event) => change("gridSize", Number(event.target.value))} /><em>mm</em></label>
          <label><span>그리드 스냅</span><input aria-label="그리드 스냅" type="checkbox" checked={draft.gridSnap} onChange={(event) => change("gridSnap", event.target.checked)} /></label>
          <label><span>도면 템플릿 표시</span><input aria-label="도면 템플릿 표시" type="checkbox" checked={draft.drawingTemplateVisible} onChange={(event) => change("drawingTemplateVisible", event.target.checked)} /></label>
          <label><span>도면 용지</span><select aria-label="도면 용지" value={draft.drawingSheet} onChange={(event) => change("drawingSheet", event.target.value as DrawingSheet2D)}><option value="A3">A3 가로</option><option value="A2">A2 가로</option><option value="A1">A1 가로</option></select></label>
          <p>스냅을 끄면 커넥터와 경로 핸들이 마우스 위치를 그대로 따라갑니다.</p>
        </>}
        {tab === "files" && <>
          <h3>저장</h3>
          <label><span>자동 저장</span><select aria-label="자동 저장" value={draft.autosaveMinutes} onChange={(event) => change("autosaveMinutes", Number(event.target.value) as AutosaveMinutes2D)}><option value="0">사용 안 함</option><option value="1">1분</option><option value="5">5분</option><option value="10">10분</option><option value="30">30분</option></select></label>
          <p>한 번 이상 저장하여 파일 경로가 정해진 프로젝트만 자동 저장됩니다.</p>
          <h3>부품 라이브러리</h3>
          <div className="hd2-settings-library"><span>기본 폴더</span><output title={libraryFolder ?? ""}>{libraryFolder ?? "자동 설정 중"}</output><button type="button" onClick={onSelectLibraryFolder}>폴더 지정</button></div>
          <div className="hd2-settings-library"><span>현재 파일</span><output title={libraryPath ?? ""}>{libraryPath ?? "연결된 라이브러리 없음"}</output><button type="button" onClick={onOpenLibrary}>라이브러리 열기·변경</button></div>
          <p>기본 폴더를 바꾸면 그 위치에 기본 라이브러리를 설치하고 연결합니다. 같은 이름의 기존 라이브러리는 덮어쓰지 않습니다.</p>
        </>}
      </div>
      <footer><button type="button" onClick={() => setDraft({ ...defaultSettings2D })}>기본값 복원</button><span /><button type="button" onClick={onClose}>취소</button><button type="button" className="is-primary" onClick={() => onApply(draft)}>적용</button></footer>
    </section>
  </div>;
}
