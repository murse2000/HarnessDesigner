import { emit } from "@tauri-apps/api/event";
import { join } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";
import { Box, Database, FileOutput, Grid3X3, HardDrive, RotateCcw, Save, Settings2, ShieldCheck, Type, X } from "lucide-react";
import { useEffect, useState, type PropsWithChildren } from "react";
import type { Locale } from "../i18n";
import { backendInvoke, isTauri } from "../platform";
import { defaultAppPreferences, normalizeAppPreferences, validationRuleLabels, type AppPreferences, type DrawingTemplate, type OutputJob, type ValidationProfile } from "../preferences";
import { useProjectStore } from "../store/projectStore";
import { Field, IconButton } from "./common";

type SettingsSection = "general" | "editor" | "validation" | "output" | "files" | "recovery" | "quality";
interface LibraryStatus { directory: string; databasePath: string; partCount: number }
interface LibraryIntegrity { ok: boolean; message: string; partCount: number; backupCount: number }
interface SettingsProfile { version: 1; locale: Locale; theme: "light" | "dark"; uiScale: number; preferences: AppPreferences }

const newId = () => crypto.randomUUID();
const cloneNamed = <T extends { id: string; name: string }>(item: T): T => ({ ...structuredClone(item), id: newId(), name: `${item.name} 복사본` });

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const store = useProjectStore();
  const [section, setSection] = useState<SettingsSection>("general");
  const [draft, setDraft] = useState<AppPreferences>(() => structuredClone(store.preferences));
  const [locale, setLocale] = useState<Locale>(store.locale);
  const [theme, setTheme] = useState<"light" | "dark">(store.theme);
  const [uiScale, setUiScale] = useState(store.uiScale);
  const [library, setLibrary] = useState<LibraryStatus | null>(null);
  const [integrity, setIntegrity] = useState<LibraryIntegrity | null>(null);
  const [copyExisting, setCopyExisting] = useState(true);
  const [operation, setOperation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadLibraryStatus = () => {
    if (!isTauri()) return;
    void backendInvoke<LibraryStatus>("get_library_status").then(setLibrary).catch((reason) => setError(String(reason)));
  };
  useEffect(loadLibraryStatus, []);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const setPreference = <K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const updateValidation = (profile: ValidationProfile) => setPreference("validationProfiles", draft.validationProfiles.map((item) => item.id === profile.id ? profile : item));
  const updateTemplate = (template: DrawingTemplate) => setPreference("drawingTemplates", draft.drawingTemplates.map((item) => item.id === template.id ? template : item));
  const updateJob = (job: OutputJob) => setPreference("outputJobs", draft.outputJobs.map((item) => item.id === job.id ? job : item));
  const validation = draft.validationProfiles.find((item) => item.id === draft.activeValidationProfileId) ?? draft.validationProfiles[0];
  const template = draft.drawingTemplates.find((item) => item.id === draft.activeDrawingTemplateId) ?? draft.drawingTemplates[0];
  const outputJob = draft.outputJobs.find((item) => item.id === draft.activeOutputJobId) ?? draft.outputJobs[0];

  const chooseDirectory = async (key: "defaultImportDirectory" | "defaultExportDirectory") => {
    const directory = await open({ directory: true, multiple: false, defaultPath: draft[key] || undefined, title: key === "defaultImportDirectory" ? "기본 가져오기 폴더" : "기본 내보내기 폴더" });
    if (directory) setPreference(key, directory);
  };
  const changeLibraryDirectory = async () => {
    if (!isTauri()) return;
    const directory = await open({ directory: true, multiple: false, defaultPath: library?.directory, title: "공용 부품 라이브러리 폴더" });
    if (!directory) return;
    try { setOperation("라이브러리 위치 변경 중…"); setError(null); setLibrary(await backendInvoke("set_library_directory", { directory, copyExisting })); await emit("library-changed"); }
    catch (reason) { setError(String(reason)); } finally { setOperation(null); }
  };
  const exportLibrary = async () => {
    if (!isTauri()) return;
    const defaultPath = draft.defaultExportDirectory ? await join(draft.defaultExportDirectory, "HarnessDesigner-Library.sqlite") : "HarnessDesigner-Library.sqlite";
    const path = await save({ defaultPath, title: "부품 라이브러리 백업", filters: [{ name: "SQLite library", extensions: ["sqlite", "db"] }] });
    if (!path) return;
    try { setOperation("라이브러리 백업 중…"); setError(null); await backendInvoke("export_library_database", { path }); }
    catch (reason) { setError(String(reason)); } finally { setOperation(null); }
  };
  const importLibrary = async () => {
    if (!isTauri()) return;
    const path = await open({ multiple: false, directory: false, defaultPath: draft.defaultImportDirectory || undefined, title: "부품 라이브러리 가져오기", filters: [{ name: "SQLite library", extensions: ["sqlite", "db"] }] });
    if (!path || !window.confirm("현재 라이브러리를 백업한 뒤 선택한 라이브러리로 교체하시겠습니까?")) return;
    try { setOperation("라이브러리 가져오는 중…"); setError(null); setLibrary(await backendInvoke("import_library_database", { path })); await emit("library-changed"); }
    catch (reason) { setError(String(reason)); } finally { setOperation(null); }
  };
  const checkIntegrity = async () => {
    try { setOperation("무결성 검사 중…"); setError(null); setIntegrity(await backendInvoke("check_library_integrity")); }
    catch (reason) { setError(String(reason)); } finally { setOperation(null); }
  };
  const exportSettings = async () => {
    if (!isTauri()) return;
    const path = await save({ defaultPath: "HarnessDesigner-Settings.hdsettings", filters: [{ name: "Harness Designer settings", extensions: ["hdsettings"] }] });
    if (!path) return;
    const profile: SettingsProfile = { version: 1, locale, theme, uiScale, preferences: draft };
    await backendInvoke("write_text_file", { path, content: JSON.stringify(profile, null, 2) });
  };
  const importSettings = async () => {
    if (!isTauri()) return;
    const path = await open({ multiple: false, directory: false, filters: [{ name: "Harness Designer settings", extensions: ["hdsettings"] }] });
    if (!path) return;
    try {
      const profile = JSON.parse(await backendInvoke<string>("read_text_file", { path })) as Partial<SettingsProfile>;
      if (profile.version !== 1 || !profile.preferences) throw new Error("지원하지 않는 설정 프로필입니다.");
      setDraft(normalizeAppPreferences(profile.preferences)); setLocale(profile.locale ?? "ko"); setTheme(profile.theme ?? "light"); setUiScale(profile.uiScale ?? 100);
    } catch (reason) { setError(String(reason)); }
  };
  const chooseLogo = async () => {
    if (!isTauri() || !template) return;
    const path = await open({ multiple: false, directory: false, filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "svg"] }] });
    if (!path) return;
    const bytes = await backendInvoke<number[]>("read_binary_file", { path });
    const extension = path.split(".").pop()?.toLowerCase();
    const mime = extension === "svg" ? "image/svg+xml" : extension === "png" ? "image/png" : "image/jpeg";
    let binary = ""; for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.slice(offset, offset + 0x8000));
    updateTemplate({ ...template, logoDataUrl: `data:${mime};base64,${btoa(binary)}` });
  };
  const saveSettings = async () => {
    try {
      if (isTauri()) await backendInvoke("set_library_backup_retention", { retention: draft.libraryBackupRetention });
      const activeTemplate = draft.drawingTemplates.find((item) => item.id === draft.activeDrawingTemplateId);
      const activeJob = draft.outputJobs.find((item) => item.id === draft.activeOutputJobId);
      const savedDraft = { ...draft, defaultPaper: activeTemplate?.paper ?? draft.defaultPaper, defaultOutputLanguage: activeTemplate?.outputLanguage ?? draft.defaultOutputLanguage, defaultImageDpi: activeTemplate?.imageDpi ?? draft.defaultImageDpi, exportFormats: activeJob?.formats ?? draft.exportFormats };
      store.setLocale(locale); store.setTheme(theme); store.setUiScale(uiScale); store.setPreferences(savedDraft); onClose();
    } catch (reason) { setError(String(reason)); }
  };
  const resetDefaults = () => { setDraft(structuredClone(defaultAppPreferences)); setLocale("ko"); setTheme("light"); setUiScale(100); };

  return <div className="modal-backdrop"><section className="settings-dialog" role="dialog" aria-modal="true" aria-label="환경설정">
    <header><div><Settings2 size={15} /><strong>환경설정</strong><span>모든 창에 동기화되는 사용자별 설정입니다.</span></div><IconButton title="닫기" onClick={onClose}><X size={14} /></IconButton></header>
    <div className="settings-layout">
      <nav>
        <SectionButton section={section} value="general" onSelect={setSection} icon={<Type size={14} />} title="일반 및 화면" detail="언어 · 테마 · 프로필" />
        <SectionButton section={section} value="editor" onSelect={setSection} icon={<Grid3X3 size={14} />} title="편집기" detail="그리드 · 단위 · 단축키" />
        <SectionButton section={section} value="validation" onSelect={setSection} icon={<ShieldCheck size={14} />} title="검증 규칙" detail="프로필 · 오류 등급" />
        <SectionButton section={section} value="output" onSelect={setSection} icon={<FileOutput size={14} />} title="도면 및 출력" detail="템플릿 · 출력 작업" />
        <SectionButton section={section} value="files" onSelect={setSection} icon={<Database size={14} />} title="파일 및 라이브러리" detail="위치 · 백업 · 무결성" />
        <SectionButton section={section} value="recovery" onSelect={setSection} icon={<HardDrive size={14} />} title="저장 및 복구" detail="자동 저장 · 복구본" />
        <SectionButton section={section} value="quality" onSelect={setSection} icon={<Box size={14} />} title="3D 및 가져오기" detail="렌더링 · STEP 정밀도" />
      </nav>
      <main>
        {section === "general" && <SettingsGroup title="일반 및 화면" description="모든 프로젝트와 창에 공통으로 적용됩니다.">
          <Field label="UI 언어"><select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}><option value="ko">한국어</option><option value="en">English</option></select></Field>
          <Field label="테마"><select value={theme} onChange={(event) => setTheme(event.target.value as "light" | "dark")}><option value="light">산업용 라이트</option><option value="dark">다크</option></select></Field>
          <Field label="UI 배율"><Range value={uiScale} min={80} max={140} step={5} suffix="%" onChange={setUiScale} /></Field>
          <Field label="글꼴"><select value={draft.fontFamily} onChange={(event) => setPreference("fontFamily", event.target.value as AppPreferences["fontFamily"])}><option value="noto">Noto Sans KR</option><option value="system">운영체제 기본 글꼴</option></select></Field>
          <Field label="기본 글자 크기"><Range value={draft.fontSize} min={10} max={16} step={1} suffix="px" onChange={(value) => setPreference("fontSize", value)} /></Field>
          <div className="settings-actions"><button onClick={() => void exportSettings()}>설정 프로필 내보내기</button><button onClick={() => void importSettings()}>설정 프로필 가져오기</button></div>
        </SettingsGroup>}
        {section === "editor" && <SettingsGroup title="편집기" description="2D 도면의 이동, 표시, 수치 형식을 제어합니다.">
          <Toggle label="그리드 표시" description="도면 배경에 기준 그리드를 표시합니다." checked={draft.gridVisible} onChange={(value) => setPreference("gridVisible", value)} />
          <Toggle label="그리드 스냅" description="하우징 이동 시 설정 간격에 맞춥니다." checked={draft.gridSnap} onChange={(value) => setPreference("gridSnap", value)} />
          <Field label="그리드 스타일"><select value={draft.gridStyle} onChange={(event) => setPreference("gridStyle", event.target.value as AppPreferences["gridStyle"])}><option value="dots">점</option><option value="lines">선</option></select></Field>
          <Field label="그리드 간격"><Range value={draft.gridSize} min={5} max={50} step={5} suffix="px" onChange={(value) => setPreference("gridSize", value)} /></Field>
          <Field label="길이 표시 단위"><select value={draft.lengthUnit} onChange={(event) => setPreference("lengthUnit", event.target.value as "mm" | "in")}><option value="mm">mm</option><option value="in">inch</option></select></Field>
          <Field label="표시 소수 자릿수"><select value={draft.decimalPlaces} onChange={(event) => setPreference("decimalPlaces", Number(event.target.value) as 0 | 1 | 2 | 3)}><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></Field>
          <Field label="휠 확대 동작"><select value={draft.mouseWheelZoom} onChange={(event) => setPreference("mouseWheelZoom", event.target.value as AppPreferences["mouseWheelZoom"])}><option value="normal">표준 방향</option><option value="disabled">휠 확대 사용 안 함</option></select></Field>
          <div className="shortcut-grid"><strong>키보드 단축키</strong>{Object.entries(draft.shortcuts).map(([key, value]) => <label key={key}><span>{key}</span><input value={value} onChange={(event) => setPreference("shortcuts", { ...draft.shortcuts, [key]: event.target.value })} /></label>)}</div>
        </SettingsGroup>}
        {section === "validation" && validation && <SettingsGroup title="검증 규칙" description="프로필별로 출력 차단 오류, 경고 또는 사용 안 함을 지정합니다.">
          <ProfileBar value={validation.id} items={draft.validationProfiles} onSelect={(id) => setPreference("activeValidationProfileId", id)} onClone={() => { const item = cloneNamed(validation); setPreference("validationProfiles", [...draft.validationProfiles, item]); setPreference("activeValidationProfileId", item.id); }} onDelete={draft.validationProfiles.length > 1 ? () => { const items = draft.validationProfiles.filter((item) => item.id !== validation.id); setPreference("validationProfiles", items); setPreference("activeValidationProfileId", items[0].id); } : undefined} />
          <Field label="프로필 이름"><input value={validation.name} onChange={(event) => updateValidation({ ...validation, name: event.target.value })} /></Field>
          <div className="validation-rules">{Object.entries(validationRuleLabels).map(([code, label]) => <label key={code}><span><strong>{label}</strong><small>{code}</small></span><select value={validation.rules[code as keyof typeof validation.rules]} onChange={(event) => updateValidation({ ...validation, rules: { ...validation.rules, [code]: event.target.value } })}><option value="error">오류 · 출력 차단</option><option value="warning">경고</option><option value="off">사용 안 함</option></select></label>)}</div>
        </SettingsGroup>}
        {section === "output" && template && outputJob && <SettingsGroup title="도면 템플릿 및 출력 작업" description="도면 제목란 기본값과 일괄 생성 형식을 관리합니다.">
          <h4>도면 템플릿</h4><ProfileBar value={template.id} items={draft.drawingTemplates} onSelect={(id) => setPreference("activeDrawingTemplateId", id)} onClone={() => { const item = cloneNamed(template); setPreference("drawingTemplates", [...draft.drawingTemplates, item]); setPreference("activeDrawingTemplateId", item.id); }} onDelete={draft.drawingTemplates.length > 1 ? () => { const items = draft.drawingTemplates.filter((item) => item.id !== template.id); setPreference("drawingTemplates", items); setPreference("activeDrawingTemplateId", items[0].id); } : undefined} />
          <Field label="템플릿 이름"><input value={template.name} onChange={(event) => updateTemplate({ ...template, name: event.target.value })} /></Field>
          <Field label="회사명"><input value={template.companyName} onChange={(event) => updateTemplate({ ...template, companyName: event.target.value })} /></Field>
          <Field label="작성 / 승인"><div className="settings-dual"><input placeholder="작성자" value={template.drawnBy} onChange={(event) => updateTemplate({ ...template, drawnBy: event.target.value })} /><input placeholder="승인자" value={template.approvedBy} onChange={(event) => updateTemplate({ ...template, approvedBy: event.target.value })} /></div></Field>
          <Field label="용지 / 언어 / JPG"><div className="settings-triple"><select value={template.paper} onChange={(event) => updateTemplate({ ...template, paper: event.target.value as "A3" | "A4" })}><option value="A3">A3</option><option value="A4">A4</option></select><select value={template.outputLanguage} onChange={(event) => updateTemplate({ ...template, outputLanguage: event.target.value as DrawingTemplate["outputLanguage"] })}><option value="ko-en">한영 병기</option><option value="ko">한국어</option><option value="en">English</option></select><select value={template.imageDpi} onChange={(event) => updateTemplate({ ...template, imageDpi: Number(event.target.value) as 150 | 300 | 600 })}><option value="150">150 DPI</option><option value="300">300 DPI</option><option value="600">600 DPI</option></select></div></Field>
          <Toggle label="2D 시트 템플릿 표시" description="2D 도면에 외곽선, 구역 좌표와 제목란을 표시합니다." checked={template.showOnCanvas} onChange={(value) => updateTemplate({ ...template, showOnCanvas: value })} />
          <Field label="2D 시트 크기"><Range value={template.canvasScalePercent} min={50} max={200} step={5} suffix="%" onChange={(value) => updateTemplate({ ...template, canvasScalePercent: value })} /></Field>
          <Field label="파일명 규칙"><input value={template.fileNamePattern} onChange={(event) => updateTemplate({ ...template, fileNamePattern: event.target.value })} /></Field>
          <div className="settings-actions"><button onClick={() => void chooseLogo()}>{template.logoDataUrl ? "로고 교체" : "로고 이미지 선택"}</button>{template.logoDataUrl && <button onClick={() => updateTemplate({ ...template, logoDataUrl: "" })}>로고 제거</button>}</div>
          <h4>출력 작업</h4><ProfileBar value={outputJob.id} items={draft.outputJobs} onSelect={(id) => setPreference("activeOutputJobId", id)} onClone={() => { const item = cloneNamed(outputJob); setPreference("outputJobs", [...draft.outputJobs, item]); setPreference("activeOutputJobId", item.id); }} onDelete={draft.outputJobs.length > 1 ? () => { const items = draft.outputJobs.filter((item) => item.id !== outputJob.id); setPreference("outputJobs", items); setPreference("activeOutputJobId", items[0].id); } : undefined} />
          <Field label="작업 이름"><input value={outputJob.name} onChange={(event) => updateJob({ ...outputJob, name: event.target.value })} /></Field>
          <div className="format-settings"><strong>생성 형식</strong>{Object.entries(outputJob.formats).map(([format, enabled]) => <label key={format}><input type="checkbox" checked={enabled} onChange={(event) => updateJob({ ...outputJob, formats: { ...outputJob.formats, [format]: event.target.checked } })} /><span>{format.toUpperCase()}</span></label>)}</div>
          <Field label="절단 길이 올림"><NumberInput value={draft.cutLengthRoundingMm} suffix="mm" min={0} onChange={(value) => setPreference("cutLengthRoundingMm", value)} /></Field>
          <Field label="BOM 전선 여유율"><NumberInput value={draft.bomWastePercent} suffix="%" min={0} onChange={(value) => setPreference("bomWastePercent", value)} /></Field>
          <Field label="BOM 길이 올림"><NumberInput value={draft.bomLengthRoundingMm} suffix="mm" min={0} onChange={(value) => setPreference("bomLengthRoundingMm", value)} /></Field>
        </SettingsGroup>}
        {section === "files" && <SettingsGroup title="파일 및 라이브러리" description="공용 라이브러리 위치, 순환 백업, 무결성을 관리합니다.">
          <PathField label="기본 가져오기 폴더" value={draft.defaultImportDirectory} onChoose={() => void chooseDirectory("defaultImportDirectory")} />
          <PathField label="기본 내보내기 폴더" value={draft.defaultExportDirectory} onChoose={() => void chooseDirectory("defaultExportDirectory")} />
          <div className="library-location-card"><div><strong>공용 부품 라이브러리</strong><span>{library?.databasePath ?? "경로 확인 중…"}</span><small>{library ? `${library.partCount}개 부품 · SQLite` : ""}</small></div><button onClick={() => void changeLibraryDirectory()} disabled={!!operation}>위치 변경</button></div>
          <Toggle label="위치 변경 시 기존 라이브러리 복사" description="새 폴더에 parts.db가 없을 때 현재 데이터를 복사합니다." checked={copyExisting} onChange={setCopyExisting} />
          <Field label="자동 백업 보관 수"><NumberInput value={draft.libraryBackupRetention} suffix="개" min={0} onChange={(value) => setPreference("libraryBackupRetention", value)} /></Field>
          <div className="settings-actions"><button onClick={() => void exportLibrary()} disabled={!!operation}>라이브러리 백업 내보내기</button><button onClick={() => void importLibrary()} disabled={!!operation}>라이브러리 가져오기</button><button onClick={() => void checkIntegrity()} disabled={!!operation}>무결성 검사</button></div>
          {integrity && <div className={integrity.ok ? "settings-success" : "connector-library-error"}>{integrity.ok ? "정상" : "오류"} · 부품 {integrity.partCount}개 · 자동 백업 {integrity.backupCount}개 · {integrity.message}</div>}
        </SettingsGroup>}
        {section === "recovery" && <SettingsGroup title="저장 및 복구" description="편집 중인 프로젝트의 복구본을 원본과 별도로 보관합니다.">
          <Field label="자동 저장 간격"><select value={draft.autosaveIntervalMinutes} onChange={(event) => setPreference("autosaveIntervalMinutes", Number(event.target.value))}><option value="0">사용 안 함</option><option value="1">1분</option><option value="5">5분</option><option value="10">10분</option><option value="30">30분</option></select></Field>
          <Field label="프로젝트별 복구본"><NumberInput value={draft.recoveryRetention} suffix="개" min={1} onChange={(value) => setPreference("recoveryRetention", value)} /></Field>
          <div className="settings-note"><strong>복구 방식</strong><span>변경된 프로젝트만 앱 데이터 폴더에 .harness 복구본으로 저장합니다. 다음 실행 시 복구본을 새 창으로 열 수 있습니다.</span></div>
        </SettingsGroup>}
        {section === "quality" && <SettingsGroup title="3D 및 STEP 가져오기" description="복잡한 하우징과 대형 하네스의 품질과 성능 균형을 지정합니다.">
          <Field label="3D 렌더링 품질"><select value={draft.threeDQuality} onChange={(event) => setPreference("threeDQuality", event.target.value as AppPreferences["threeDQuality"])}><option value="low">낮음 · 대형 프로젝트</option><option value="medium">표준 · 권장</option><option value="high">높음 · 상세 확인</option></select></Field>
          <Field label="STEP 메시 정밀도"><select value={draft.stepImportQuality} onChange={(event) => setPreference("stepImportQuality", event.target.value as AppPreferences["stepImportQuality"])}><option value="coarse">빠르게</option><option value="standard">표준 · 권장</option><option value="fine">정밀하게</option></select></Field>
          <div className="settings-note"><strong>적용 시점</strong><span>3D 품질은 열려 있는 3D 창에 즉시 반영됩니다. STEP 정밀도는 이후 등록하는 모델부터 적용됩니다.</span></div>
        </SettingsGroup>}
        {operation && <div className="settings-operation">{operation}</div>}{error && <div className="connector-library-error settings-error">{error}</div>}
      </main>
    </div>
    <footer><button onClick={resetDefaults}><RotateCcw size={12} />기본값 복원</button><span>라이브러리 관리 작업은 즉시 적용됩니다.</span><button onClick={onClose}>취소</button><button className="primary" onClick={() => void saveSettings()}><Save size={13} />설정 저장</button></footer>
  </section></div>;
}

function SectionButton({ section, value, onSelect, icon, title, detail }: { section: SettingsSection; value: SettingsSection; onSelect: (value: SettingsSection) => void; icon: React.ReactNode; title: string; detail: string }) {
  return <button className={section === value ? "active" : ""} onClick={() => onSelect(value)}>{icon}<span><strong>{title}</strong><small>{detail}</small></span></button>;
}
function SettingsGroup({ title, description, children }: PropsWithChildren<{ title: string; description: string }>) {
  return <section className="settings-group"><header><strong>{title}</strong><span>{description}</span></header><div>{children}</div></section>;
}
function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="settings-toggle"><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}
function PathField({ label, value, onChoose }: { label: string; value: string; onChoose: () => void }) {
  return <div className="settings-path"><span>{label}</span><code title={value}>{value || "지정 안 함"}</code><button onClick={onChoose}>찾아보기…</button></div>;
}
function Range({ value, min, max, step, suffix, onChange }: { value: number; min: number; max: number; step: number; suffix: string; onChange: (value: number) => void }) {
  return <div className="settings-range"><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /><code>{value}{suffix}</code></div>;
}
function NumberInput({ value, suffix, min, onChange }: { value: number; suffix: string; min: number; onChange: (value: number) => void }) {
  return <div className="number-setting"><input type="number" min={min} step="1" value={value} onChange={(event) => onChange(Math.max(min, Number(event.target.value)))} /><span>{suffix}</span></div>;
}
function ProfileBar<T extends { id: string; name: string }>({ value, items, onSelect, onClone, onDelete }: { value: string; items: T[]; onSelect: (id: string) => void; onClone: () => void; onDelete?: () => void }) {
  return <div className="profile-bar"><select value={value} onChange={(event) => onSelect(event.target.value)}>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button onClick={onClone}>복제</button>{onDelete && <button onClick={onDelete}>삭제</button>}</div>;
}
