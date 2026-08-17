import { open, save } from "@tauri-apps/plugin-dialog";
import { Calculator, Check, ClipboardCheck, Factory, FileInput, Network, Plus, Save, ShieldCheck, Trash2, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  applyConnectionImport,
  buildBundleMetrics,
  buildCostRows,
  buildCostSummary,
  buildEquipmentRows,
  buildSystemNetlist,
  parseConnectionCsv,
  parseKicadNetlistXml,
  rowsToDelimited,
} from "../domain/production";
import type { ConnectionImportRow } from "../domain/production";
import type { EquipmentProfileKind, ProjectRole, WorkInstructionKind } from "../domain/types";
import { canProjectRole } from "../domain/permissions";
import { validateProject } from "../domain/validation";
import { backendInvoke, isTauri } from "../platform";
import { activeValidationRules } from "../preferences";
import { useProjectStore } from "../store/projectStore";
import { EmptyState, Field, IconButton } from "./common";

type Tab = "drc" | "instructions" | "hierarchy" | "cost" | "import" | "equipment" | "team";

const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: "drc", label: "제조 DRC", icon: <ShieldCheck size={13} /> },
  { id: "instructions", label: "작업 지시", icon: <ClipboardCheck size={13} /> },
  { id: "hierarchy", label: "시스템 / Variant", icon: <Network size={13} /> },
  { id: "cost", label: "원가", icon: <Calculator size={13} /> },
  { id: "import", label: "연결 가져오기", icon: <FileInput size={13} /> },
  { id: "equipment", label: "장비 출력", icon: <Factory size={13} /> },
  { id: "team", label: "팀 / 검토", icon: <Users size={13} /> },
];

export function ProductionCenterDialog({ onClose }: { onClose: () => void }) {
  const { snapshot, activeHarnessId, preferences, setPreferences, updateProject } = useProjectStore();
  const [tab, setTab] = useState<Tab>("drc");
  const [importRows, setImportRows] = useState<ConnectionImportRow[]>([]);
  const [importSource, setImportSource] = useState("");
  const [importResult, setImportResult] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const project = snapshot?.project;
  const harness = project?.harnesses.find((item) => item.id === activeHarnessId) ?? project?.harnesses[0];
  const issues = useMemo(() => project ? validateProject(project, activeValidationRules(preferences)) : [], [preferences, project]);
  const metrics = useMemo(() => project && harness ? buildBundleMetrics(project, harness) : [], [harness, project]);
  const costs = useMemo(() => project ? buildCostRows(project) : [], [project]);
  if (!snapshot || !project) return null;
  const activeMember = project.members.find((member) => member.id === preferences.currentProjectMemberId);
  const canDesign = canProjectRole(activeMember?.role, "design");
  const canReview = canProjectRole(activeMember?.role, "review");
  const canAdmin = canProjectRole(activeMember?.role, "admin");
  const accessoryEntries = project.harnesses.flatMap((item) => item.accessories.map((accessory) => ({ harness: item, accessory, part: project.parts.find((part) => part.id === accessory.partId) })));

  const addInstruction = () => void updateProject((draft) => draft.workInstructions.push({
    id: crypto.randomUUID(), harnessId: harness?.id ?? "", sequence: draft.workInstructions.length + 1,
    kind: "assembly", title: "새 작업", description: "", estimatedMinutes: 0,
  }));
  const attachInstructionImage = (instructionId: string, file?: File) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError("작업 지시 이미지는 10 MB 이하여야 합니다."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      void updateProject((draft) => { const item = draft.workInstructions.find((entry) => entry.id === instructionId); if (item) item.imageDataUrl = reader.result as string; });
    };
    reader.readAsDataURL(file);
  };
  const addSystem = () => void updateProject((draft) => draft.systems.push({ id: crypto.randomUUID(), name: "새 시스템", reference: `SYS-${draft.systems.length + 1}`, harnessInstances: [] }));
  const addVariant = () => void updateProject((draft) => draft.variants.push({ id: crypto.randomUUID(), name: `Variant ${draft.variants.length + 1}`, description: "", disabledConductorIds: [], disabledAccessoryIds: [] }));
  const loadConnections = async () => {
    if (!isTauri()) return;
    const path = await open({ multiple: false, directory: false, title: "연결 데이터 가져오기", filters: [{ name: "CSV 또는 KiCad XML", extensions: ["csv", "tsv", "txt", "xml"] }] });
    if (!path) return;
    try {
      const text = await backendInvoke<string>("read_text_file", { path });
      const wirePart = project.parts.find((part) => part.category === "wire");
      const rows = path.toLowerCase().endsWith(".xml")
        ? parseKicadNetlistXml(text, harness?.number ?? "", wirePart?.partNumber ?? "")
        : parseConnectionCsv(text);
      setImportRows(rows); setImportSource(path); setImportResult(""); setError(null);
    } catch (reason) { setError(String(reason)); }
  };
  const applyImport = async () => {
    let result = { added: 0, skipped: [] as string[] };
    await updateProject((draft) => { result = applyConnectionImport(draft, importRows); });
    setImportResult(`${result.added}개 연결 추가 · ${result.skipped.length}개 건너뜀${result.skipped.length ? ` (${result.skipped.join(", ")})` : ""}`);
  };
  const exportProfile = async (profileId: string) => {
    const profile = project.equipmentProfiles.find((item) => item.id === profileId);
    if (!profile || !isTauri()) return;
    const path = await save({ defaultPath: `${project.projectNumber}_${profile.kind}.csv`, filters: [{ name: "Delimited text", extensions: ["csv", "txt"] }] });
    if (!path) return;
    const content = rowsToDelimited(buildEquipmentRows(project, profile), profile.delimiter, profile.includeHeader);
    await backendInvoke("write_text_file", { path, content });
  };
  const addComment = () => {
    const author = activeMember?.name ?? "LOCAL USER";
    if (!comment.trim()) return;
    void updateProject((draft) => draft.reviewComments.push({ id: crypto.randomUUID(), harnessId: harness?.id, author, message: comment.trim(), createdAt: new Date().toISOString() }), "review");
    setComment("");
  };

  return <div className="modal-backdrop"><section className="production-center" role="dialog" aria-modal="true" aria-label="생산 엔지니어링 센터">
    <header><div><Factory size={15} /><strong>생산 엔지니어링 센터</strong><span>제조 검증 · 작업 지시 · 계층 설계 · 원가 · 중립 장비 출력</span></div><IconButton title="닫기" onClick={onClose}><X size={14} /></IconButton></header>
    <div className="production-center__layout"><nav>{tabs.map((item) => <button key={item.id} className={tab === item.id ? "is-active" : ""} onClick={() => setTab(item.id)}>{item.icon}<span>{item.label}</span></button>)}</nav><main>
      {!canDesign && tab !== "team" && <div className="permission-banner">{activeMember?.role === "reviewer" ? "Reviewer는 이 화면을 열람하고 검토 의견만 등록할 수 있습니다." : "Viewer는 프로젝트를 열람만 할 수 있습니다."}</div>}
      <fieldset className="production-permission-scope" disabled={!canDesign && tab !== "team"}>
      {tab === "drc" && <section className="production-section"><SectionTitle title="Manufacturing DRC 2.0" detail={`${issues.filter((item) => item.severity === "error").length} 오류 · ${issues.filter((item) => item.severity === "warning").length} 경고`} />
        <div className="production-form-grid">
          <NumberRule label="번들 충진 계수" value={project.manufacturingRules.bundlePackingFactor} min={0.1} max={1} step={0.05} set={(value) => void updateProject((draft) => { draft.manufacturingRules.bundlePackingFactor = value; })} />
          <NumberRule label="최대 점유율 (%)" value={project.manufacturingRules.maxBundleFillPercent} min={1} max={100} set={(value) => void updateProject((draft) => { draft.manufacturingRules.maxBundleFillPercent = value; })} />
          <NumberRule label="굽힘 반경 배수" value={project.manufacturingRules.minBendRadiusMultiplier} min={1} max={30} step={0.5} set={(value) => void updateProject((draft) => { draft.manufacturingRules.minBendRadiusMultiplier = value; })} />
          <NumberRule label="최대 전압강하 (%)" value={project.manufacturingRules.maxVoltageDropPercent} min={0.1} max={100} step={0.1} set={(value) => void updateProject((draft) => { draft.manufacturingRules.maxVoltageDropPercent = value; })} />
          <Field label="미사용 캐비티"><label><input type="checkbox" checked={project.manufacturingRules.requireUnusedCavitySeal} onChange={(event) => void updateProject((draft) => { draft.manufacturingRules.requireUnusedCavitySeal = event.target.checked; })} /> 플러그 필수</label></Field>
        </div>
        <DenseTable headers={["구간", "전선 수", "계산 외경", "보호재 내경", "점유율"]}>{metrics.map((metric) => { const segment = harness?.segments.find((item) => item.id === metric.segmentId); return <tr key={metric.segmentId}><td><strong>{segment?.label}</strong></td><td>{metric.conductorCount}</td><td>{metric.calculatedDiameterMm?.toFixed(2) ?? "데이터 필요"}</td><td>{metric.sleeveInnerDiameterMm?.toFixed(2) ?? "—"}</td><td className={(metric.fillPercent ?? 0) > project.manufacturingRules.maxBundleFillPercent ? "has-error" : ""}>{metric.fillPercent?.toFixed(1) ?? "—"}%</td></tr>; })}</DenseTable>
        <div className="production-issues">{issues.length ? issues.map((item) => <div key={item.id} className={`production-issue production-issue--${item.severity}`}><span>{item.code}</span><strong>{item.details ?? item.messageKey}</strong></div>) : <EmptyState>제조 검증을 통과했습니다.</EmptyState>}</div>
      </section>}
      {tab === "instructions" && <section className="production-section"><SectionTitle title="제조 작업 지시서" detail="순서별 조립·검사·포장 지시" action={<button onClick={addInstruction}><Plus size={12} />작업 추가</button>} />
        <DenseTable headers={["순서", "하네스", "종류", "제목", "예상 시간", "상세 지시", "이미지 / 삭제"]}>{[...project.workInstructions].sort((a, b) => a.sequence - b.sequence).map((instruction) => <tr key={instruction.id}><td><input type="number" min="1" value={instruction.sequence} onChange={(event) => void updateProject((draft) => { const item = draft.workInstructions.find((entry) => entry.id === instruction.id); if (item) item.sequence = Number(event.target.value); })} /></td><td><select value={instruction.harnessId} onChange={(event) => void updateProject((draft) => { const item = draft.workInstructions.find((entry) => entry.id === instruction.id); if (item) item.harnessId = event.target.value; })}>{project.harnesses.map((item) => <option key={item.id} value={item.id}>{item.number}</option>)}</select></td><td><select value={instruction.kind} onChange={(event) => void updateProject((draft) => { const item = draft.workInstructions.find((entry) => entry.id === instruction.id); if (item) item.kind = event.target.value as WorkInstructionKind; })}><option value="preparation">준비</option><option value="assembly">조립</option><option value="inspection">검사</option><option value="packaging">포장</option></select></td><td><input value={instruction.title} onChange={(event) => void updateProject((draft) => { const item = draft.workInstructions.find((entry) => entry.id === instruction.id); if (item) item.title = event.target.value; })} /></td><td><input type="number" min="0" value={instruction.estimatedMinutes} onChange={(event) => void updateProject((draft) => { const item = draft.workInstructions.find((entry) => entry.id === instruction.id); if (item) item.estimatedMinutes = Number(event.target.value); })} /></td><td><textarea rows={2} value={instruction.description} onChange={(event) => void updateProject((draft) => { const item = draft.workInstructions.find((entry) => entry.id === instruction.id); if (item) item.description = event.target.value; })} /></td><td><label className="instruction-image-button">{instruction.imageDataUrl ? "교체" : "사진"}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { attachInstructionImage(instruction.id, event.target.files?.[0]); event.target.value = ""; }} /></label><IconButton title="삭제" onClick={() => void updateProject((draft) => { draft.workInstructions = draft.workInstructions.filter((entry) => entry.id !== instruction.id); })}><Trash2 size={12} /></IconButton></td></tr>)}</DenseTable>
      </section>}
      {tab === "hierarchy" && <section className="production-section"><SectionTitle title="계층 설계와 Variant" detail="하네스 인스턴스 수량과 선택 사양 관리" action={<><button onClick={addSystem}><Plus size={12} />시스템</button><button onClick={addVariant}><Plus size={12} />Variant</button></>} />
        <div className="production-card-grid"><section className="production-card"><h3>시스템 계층</h3>{project.systems.map((system) => <div className="hierarchy-item" key={system.id}>
          <div className="hierarchy-header"><input value={system.reference} aria-label="시스템 참조" onChange={(event) => void updateProject((draft) => { const item = draft.systems.find((entry) => entry.id === system.id); if (item) item.reference = event.target.value; })} /><input value={system.name} aria-label="시스템 이름" onChange={(event) => void updateProject((draft) => { const item = draft.systems.find((entry) => entry.id === system.id); if (item) item.name = event.target.value; })} /><IconButton title="시스템 삭제" onClick={() => void updateProject((draft) => { draft.systems = draft.systems.filter((entry) => entry.id !== system.id); })}><Trash2 size={12} /></IconButton></div>
          <button onClick={() => void updateProject((draft) => { const item = draft.systems.find((entry) => entry.id === system.id); const selected = draft.harnesses[0]; if (item && selected) item.harnessInstances.push({ id: crypto.randomUUID(), harnessId: selected.id, reference: `${selected.number}-${item.harnessInstances.length + 1}`, quantity: 1 }); })}><Plus size={11} />하네스 인스턴스</button>
          {system.harnessInstances.map((instance) => <div className="hierarchy-child" key={instance.id}><input value={instance.reference} aria-label="인스턴스 참조" onChange={(event) => void updateProject((draft) => { const item = draft.systems.find((entry) => entry.id === system.id)?.harnessInstances.find((entry) => entry.id === instance.id); if (item) item.reference = event.target.value; })} /><select value={instance.harnessId} aria-label="하네스 선택" onChange={(event) => void updateProject((draft) => { const item = draft.systems.find((entry) => entry.id === system.id)?.harnessInstances.find((entry) => entry.id === instance.id); if (item) item.harnessId = event.target.value; })}>{project.harnesses.map((item) => <option key={item.id} value={item.id}>{item.number} · {item.name}</option>)}</select><input type="number" min="1" value={instance.quantity} aria-label="인스턴스 수량" onChange={(event) => void updateProject((draft) => { const item = draft.systems.find((entry) => entry.id === system.id)?.harnessInstances.find((entry) => entry.id === instance.id); if (item) item.quantity = Math.max(1, Number(event.target.value) || 1); })} /><IconButton title="인스턴스 삭제" onClick={() => void updateProject((draft) => { const item = draft.systems.find((entry) => entry.id === system.id); if (item) item.harnessInstances = item.harnessInstances.filter((entry) => entry.id !== instance.id); })}><Trash2 size={12} /></IconButton></div>)}
        </div>)}</section>
          <section className="production-card"><h3>설계 Variant</h3>{project.variants.map((variant) => <div className="variant-item" key={variant.id}>
            <div className="variant-header"><input value={variant.name} aria-label="Variant 이름" onChange={(event) => void updateProject((draft) => { const item = draft.variants.find((entry) => entry.id === variant.id); if (item) item.name = event.target.value; })} /><IconButton title="Variant 삭제" onClick={() => void updateProject((draft) => { draft.variants = draft.variants.filter((entry) => entry.id !== variant.id); })}><Trash2 size={12} /></IconButton></div>
            <input placeholder="설명" value={variant.description} onChange={(event) => void updateProject((draft) => { const item = draft.variants.find((entry) => entry.id === variant.id); if (item) item.description = event.target.value; })} />
            <strong className="variant-group-title">전선</strong><div>{project.harnesses.flatMap((item) => item.conductors.map((wire) => <label key={wire.id}><input type="checkbox" checked={!variant.disabledConductorIds.includes(wire.id)} onChange={(event) => void updateProject((draft) => { const target = draft.variants.find((entry) => entry.id === variant.id); if (!target) return; target.disabledConductorIds = event.target.checked ? target.disabledConductorIds.filter((id) => id !== wire.id) : [...target.disabledConductorIds, wire.id]; })} />{item.number}/{wire.reference}</label>))}</div>
            <strong className="variant-group-title">부자재</strong><div>{accessoryEntries.map(({ harness: item, accessory, part }) => <label key={accessory.id}><input type="checkbox" checked={!variant.disabledAccessoryIds.includes(accessory.id)} onChange={(event) => void updateProject((draft) => { const target = draft.variants.find((entry) => entry.id === variant.id); if (!target) return; target.disabledAccessoryIds = event.target.checked ? target.disabledAccessoryIds.filter((id) => id !== accessory.id) : [...target.disabledAccessoryIds, accessory.id]; })} />{item.number}/{part?.partNumber ?? accessory.partId}</label>)}</div>
            <small>활성 넷 {project.systems.reduce((total, system) => total + buildSystemNetlist(project, system, variant).length, 0)}개 · 제외 부자재 {variant.disabledAccessoryIds.length}개</small>
          </div>)}</section></div>
      </section>}
      {tab === "cost" && <section className="production-section"><SectionTitle title="원가 및 견적" detail={`통화 ${project.manufacturingRules.currency}`} />
        <div className="production-form-grid"><Field label="통화"><input value={project.manufacturingRules.currency} onChange={(event) => void updateProject((draft) => { draft.manufacturingRules.currency = event.target.value; })} /></Field><NumberRule label="시간당 작업비" value={project.manufacturingRules.laborRatePerHour} min={0} max={1_000_000_000} step={100} set={(value) => void updateProject((draft) => { draft.manufacturingRules.laborRatePerHour = value; })} /><NumberRule label="간접비 (%)" value={project.manufacturingRules.overheadPercent} min={0} max={1000} step={0.1} set={(value) => void updateProject((draft) => { draft.manufacturingRules.overheadPercent = value; })} /></div>
        <DenseTable headers={["품번", "설명", "수량", "단위", "단가", "금액", "공급사", "리드타임"]}>{costs.map((row) => <tr key={row.partId}><td><strong>{row.partNumber}</strong></td><td>{row.description}</td><td>{row.quantity}</td><td>{row.unit}</td><td><input type="number" min="0" step="0.01" value={row.unitCost} onChange={(event) => void updateProject((draft) => { const part = draft.parts.find((item) => item.id === row.partId); if (part) part.attributes.unitCost = event.target.value; })} /></td><td>{row.extendedCost.toFixed(2)}</td><td><input value={row.supplier} onChange={(event) => void updateProject((draft) => { const part = draft.parts.find((item) => item.id === row.partId); if (part) part.attributes.supplier = event.target.value; })} /></td><td><input type="number" min="0" value={row.leadTimeDays ?? ""} onChange={(event) => void updateProject((draft) => { const part = draft.parts.find((item) => item.id === row.partId); if (part) part.attributes.leadTimeDays = event.target.value; })} /></td></tr>)}</DenseTable><div className="cost-total"><span>자재 {buildCostSummary(project).materialCost.toFixed(2)} + 작업 {buildCostSummary(project).laborCost.toFixed(2)} + 간접비 {buildCostSummary(project).overheadCost.toFixed(2)}</span><strong>{buildCostSummary(project).totalCost.toFixed(2)} {buildCostSummary(project).currency}</strong></div>
      </section>}
      {tab === "import" && <section className="production-section"><SectionTitle title="연결 데이터 가져오기" detail="CSV/TSV 또는 KiCad XML 넷리스트 · 기존 커넥터/핀/전선 부품과 일치하는 행만 추가" action={<button onClick={loadConnections}><FileInput size={12} />파일 선택</button>} />
        <div className="import-summary"><strong>{importSource || "선택한 파일 없음"}</strong><span>{importRows.length}개 유효 연결</span><button className="primary" disabled={!importRows.length} onClick={applyImport}><Check size={12} />검증 후 적용</button></div>
        <DenseTable headers={["Harness", "Wire", "From", "Pin", "To", "Pin", "Wire Part", "Color", "Gauge"]}>{importRows.slice(0, 100).map((row, index) => <tr key={`${row.reference}-${index}`}><td>{row.harnessNumber}</td><td>{row.reference}</td><td>{row.fromReference}</td><td>{row.fromPin}</td><td>{row.toReference}</td><td>{row.toPin}</td><td>{row.wirePartNumber}</td><td>{row.color}</td><td>{row.gauge}</td></tr>)}</DenseTable>{importResult && <div className="operation-result">{importResult}</div>}
      </section>}
      {tab === "equipment" && <section className="production-section"><SectionTitle title="중립 장비 출력 프로필" detail="제조사 비공개 포맷을 추측하지 않고 CSV/구분 텍스트로 출력" action={<button onClick={() => void updateProject((draft) => draft.equipmentProfiles.push({ id: crypto.randomUUID(), name: "새 장비 프로필", kind: "wireProcessor", delimiter: ",", includeHeader: true, enabled: true }))}><Plus size={12} />프로필</button>} />
        <DenseTable headers={["사용", "이름", "종류", "구분자", "헤더", "행", "출력", ""]}>{project.equipmentProfiles.map((profile) => <tr key={profile.id}><td><input type="checkbox" checked={profile.enabled} onChange={(event) => void updateProject((draft) => { const item = draft.equipmentProfiles.find((entry) => entry.id === profile.id); if (item) item.enabled = event.target.checked; })} /></td><td><input value={profile.name} onChange={(event) => void updateProject((draft) => { const item = draft.equipmentProfiles.find((entry) => entry.id === profile.id); if (item) item.name = event.target.value; })} /></td><td><select value={profile.kind} onChange={(event) => void updateProject((draft) => { const item = draft.equipmentProfiles.find((entry) => entry.id === profile.id); if (item) item.kind = event.target.value as EquipmentProfileKind; })}><option value="wireProcessor">전선 가공기</option><option value="labelPrinter">라벨 프린터</option><option value="tester">연속성 검사기</option></select></td><td><select value={profile.delimiter} onChange={(event) => void updateProject((draft) => { const item = draft.equipmentProfiles.find((entry) => entry.id === profile.id); if (item) item.delimiter = event.target.value as "," | ";" | "\t"; })}><option value=",">쉼표</option><option value=";">세미콜론</option><option value="\t">탭</option></select></td><td><input type="checkbox" checked={profile.includeHeader} onChange={(event) => void updateProject((draft) => { const item = draft.equipmentProfiles.find((entry) => entry.id === profile.id); if (item) item.includeHeader = event.target.checked; })} /></td><td>{buildEquipmentRows(project, profile).length}</td><td><button onClick={() => void exportProfile(profile.id)}><Save size={11} />저장</button></td><td><IconButton title="삭제" onClick={() => void updateProject((draft) => { draft.equipmentProfiles = draft.equipmentProfiles.filter((entry) => entry.id !== profile.id); })}><Trash2 size={12} /></IconButton></td></tr>)}</DenseTable>
      </section>}
      {tab === "team" && <section className="production-section"><SectionTitle title="팀 역할과 설계 검토" detail="Owner: 권한 관리 · Editor: 설계/검토 · Reviewer: 검토 · Viewer: 열람" action={<button disabled={!canAdmin} onClick={() => void updateProject((draft) => draft.members.push({ id: crypto.randomUUID(), name: "새 사용자", role: "editor" }), "admin")}><Plus size={12} />사용자</button>} />
        <Field label="현재 사용자"><select value={preferences.currentProjectMemberId} onChange={(event) => setPreferences({ ...preferences, currentProjectMemberId: event.target.value })}><option value="">로컬 사용자 (제한 없음)</option>{project.members.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.role}</option>)}</select></Field>
        {!canAdmin && <div className="permission-banner">현재 역할은 사용자와 역할을 변경할 수 없습니다.</div>}
        <fieldset className="production-permission-scope" disabled={!canAdmin}><DenseTable headers={["이름", "역할", ""]}>{project.members.map((member) => <tr key={member.id}><td><input value={member.name} onChange={(event) => void updateProject((draft) => { const item = draft.members.find((entry) => entry.id === member.id); if (item) item.name = event.target.value; }, "admin")} /></td><td><select value={member.role} onChange={(event) => void updateProject((draft) => { const item = draft.members.find((entry) => entry.id === member.id); if (item) item.role = event.target.value as ProjectRole; }, "admin")}><option value="owner">Owner</option><option value="editor">Editor</option><option value="reviewer">Reviewer</option><option value="viewer">Viewer</option></select></td><td><IconButton title="삭제" onClick={() => void updateProject((draft) => { draft.members = draft.members.filter((entry) => entry.id !== member.id); }, "admin")}><Trash2 size={12} /></IconButton></td></tr>)}</DenseTable></fieldset>
        <fieldset className="production-permission-scope" disabled={!canReview}><div className="review-compose"><textarea rows={3} value={comment} placeholder="설계 검토 의견" onChange={(event) => setComment(event.target.value)} /><button onClick={addComment}><Plus size={12} />의견 등록</button></div>
        <div className="review-list">{project.reviewComments.map((item) => <article key={item.id} className={item.resolvedAt ? "is-resolved" : ""}><header><strong>{item.author}</strong><time>{new Date(item.createdAt).toLocaleString()}</time></header><p>{item.message}</p><button onClick={() => void updateProject((draft) => { const target = draft.reviewComments.find((entry) => entry.id === item.id); if (target) target.resolvedAt = target.resolvedAt ? undefined : new Date().toISOString(); }, "review")}>{item.resolvedAt ? "다시 열기" : "해결"}</button></article>)}</div></fieldset>
      </section>}
      </fieldset>
      {error && <div className="connector-library-error">{error}</div>}
    </main></div>
  </section></div>;
}

function SectionTitle({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) {
  return <header className="production-title"><div><strong>{title}</strong><span>{detail}</span></div>{action && <div>{action}</div>}</header>;
}

function DenseTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return <div className="production-table-wrap"><table className="production-table"><thead><tr>{headers.map((header, index) => <th key={`${header}-${index}`}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}

function NumberRule({ label, value, min, max, step = 1, set }: { label: string; value: number; min: number; max: number; step?: number; set: (value: number) => void }) {
  return <Field label={label}><input type="number" value={value} min={min} max={max} step={step} onChange={(event) => set(Math.min(max, Math.max(min, Number(event.target.value))))} /></Field>;
}
