import type { CableConstruction, CableCoreDefinition } from "../domain/types";
import { WireColorSelect } from "./WireColorSelect";

interface CableDefinitionEditorProps {
  construction: CableConstruction;
  cores: CableCoreDefinition[];
  commonGauge: string;
  shieldCount: string;
  drainWireColor: string;
  drainWireGauge: string;
  minimumBendRadiusMm: string;
  onCoreChange: (id: string, field: "number" | "name" | "color" | "gauge", value: string) => void;
  onCommonGaugeChange: (value: string) => void;
  onApplyCommonGauge: () => void;
  onShieldCountChange: (value: string) => void;
  onDrainWireColorChange: (value: string) => void;
  onDrainWireGaugeChange: (value: string) => void;
  onMinimumBendRadiusChange: (value: string) => void;
}

export function CableDefinitionEditor({ construction, cores, commonGauge, shieldCount, drainWireColor, drainWireGauge, minimumBendRadiusMm, onCoreChange, onCommonGaugeChange, onApplyCommonGauge, onShieldCountChange, onDrainWireColorChange, onDrainWireGaugeChange, onMinimumBendRadiusChange }: CableDefinitionEditorProps) {
  return <>
    <section className="cable-core-definition-editor">
      <div className="section-heading"><h3>CORE DEFINITION <span>{cores.length}</span></h3></div>
      <div className="cable-core-bulk">
        <input aria-label="공통 코어 Gauge" placeholder="공통 Gauge · 예: 22 AWG" value={commonGauge} onChange={(event) => onCommonGaugeChange(event.target.value)} />
        <button type="button" onClick={onApplyCommonGauge}>전체 적용</button>
      </div>
      <div className="cable-core-definition-table">
        <table className="data-table">
          <thead><tr><th>Core</th><th>Name</th><th>Color</th><th>Gauge</th></tr></thead>
          <tbody>{cores.map((core) => <tr key={core.id}>
            <td><input aria-label={`${core.name} 번호`} value={core.number} onChange={(event) => onCoreChange(core.id, "number", event.target.value)} /></td>
            <td><input aria-label={`${core.number} 이름`} value={core.name} onChange={(event) => onCoreChange(core.id, "name", event.target.value)} /></td>
            <td><WireColorSelect ariaLabel={`${core.number} 색상`} value={core.color} onChange={(value) => onCoreChange(core.id, "color", value)} /></td>
            <td><input aria-label={`${core.number} Gauge`} value={core.gauge} onChange={(event) => onCoreChange(core.id, "gauge", event.target.value)} /></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
    <section className="cable-custom-spec-editor">
      <h3>CUSTOM CABLE</h3>
      <label><span>최소 굽힘 반경 (mm)</span><input aria-label="최소 굽힘 반경 (mm)" type="number" min="0.1" step="0.1" value={minimumBendRadiusMm} onChange={(event) => onMinimumBendRadiusChange(event.target.value)} /></label>
      {construction === "shieldedMultiCore" ? <>
        <h3>SHIELD / DRAIN</h3>
        <label><span>쉴드/드레인 결선 수</span><input aria-label="쉴드/드레인 결선 수" type="number" min="1" value={shieldCount} onChange={(event) => onShieldCountChange(event.target.value)} /></label>
        <label><span>드레인 색상</span><WireColorSelect ariaLabel="드레인 색상" value={drainWireColor} onChange={onDrainWireColorChange} includeBare /></label>
        <label><span>드레인 Gauge</span><input aria-label="드레인 Gauge" placeholder="예: 24 AWG" value={drainWireGauge} onChange={(event) => onDrainWireGaugeChange(event.target.value)} /></label>
        <p>각 쉴드/드레인은 케이블 추가 시 일반 코어와 별도로 핀에 연결하거나 미사용 처리할 수 있습니다.</p>
      </> : <p>일반 멀티코어 케이블에는 별도 쉴드/드레인 결선이 생성되지 않습니다.</p>}
    </section>
  </>;
}
