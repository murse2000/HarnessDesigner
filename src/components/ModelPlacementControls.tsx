import { Rotate3D, RotateCcw } from "lucide-react";
import { defaultModelPlacement, getModelPinPort, modelCableAxisDirection, setModelPinPort, type ModelCableAxis, type ModelPinPort, type ModelPlacement } from "../three/modelPlacement";
import { Field } from "./common";

type PlacementNumberKey = Exclude<keyof ModelPlacement, "cableAxis" | "pinPorts">;
type PinPortNumberKey = Exclude<keyof ModelPinPort, "pinNumber">;

export function ModelPlacementControls({ value, onChange, pinNumbers = [], selectedPinNumber, onSelectedPinNumberChange, placingPinPort = false, onPlacingPinPortChange, rotatingConnector = false, onRotatingConnectorChange }: { value: ModelPlacement; onChange: (value: ModelPlacement) => void; pinNumbers?: string[]; selectedPinNumber?: string; onSelectedPinNumberChange?: (pinNumber: string) => void; placingPinPort?: boolean; onPlacingPinPortChange?: (placing: boolean) => void; rotatingConnector?: boolean; onRotatingConnectorChange?: (rotating: boolean) => void }) {
  const setNumber = (key: PlacementNumberKey, raw: string) => {
    const next = Number(raw);
    if (Number.isFinite(next)) onChange({ ...value, [key]: key === "scale" ? Math.max(next / 100, 0.01) : next });
  };
  const setAxis = (cableAxis: ModelCableAxis) => {
    const direction = modelCableAxisDirection(cableAxis);
    onChange({ ...value, cableAxis, inletDirectionX: direction.x, inletDirectionY: direction.y, inletDirectionZ: direction.z });
  };
  const activePinNumber = selectedPinNumber ?? pinNumbers[0];
  const activePinPort = activePinNumber ? getModelPinPort(value, activePinNumber) : null;
  const setPinNumber = (key: PinPortNumberKey, raw: string) => {
    const next = Number(raw);
    if (!activePinPort || !Number.isFinite(next)) return;
    onChange(setModelPinPort(value, { ...activePinPort, [key]: key === "straightLeadMm" ? Math.max(next, 0) : next }));
  };
  return <div className="model-placement-controls">
    <div className="model-placement-heading"><strong>JACKET INLET PORT</strong><button onClick={() => onChange({ ...defaultModelPlacement })}><RotateCcw size={11} />전체 초기화</button></div>
    <Field label="방향 프리셋"><select value={value.cableAxis} onChange={(event) => setAxis(event.target.value as ModelCableAxis)}><option value="+x">+X</option><option value="-x">-X</option><option value="+y">+Y</option><option value="-y">-Y</option><option value="+z">+Z</option><option value="-z">-Z</option></select></Field>
    <Field label="축 회전 (°)"><input type="number" step="5" value={value.rollDeg} onChange={(event) => setNumber("rollDeg", event.target.value)} /></Field>
    <div className="model-pin-port-actions">
      <button type="button" className={rotatingConnector ? "active" : ""} onClick={() => onRotatingConnectorChange?.(!rotatingConnector)}><Rotate3D size={11} />{rotatingConnector ? "회전 링을 드래그하세요" : "마우스로 커넥터 회전"}</button>
      <button type="button" onClick={() => onChange({ ...value, rotationXDeg: 0, rotationYDeg: 0, rotationZDeg: 0 })}><RotateCcw size={11} />회전 초기화</button>
    </div>
    <Field label="배율 (%)"><input type="number" min="1" step="1" value={Math.round(value.scale * 10000) / 100} onChange={(event) => setNumber("scale", event.target.value)} /></Field>
    <Field label="직선 인출 (mm)"><input type="number" min="0" step="1" value={value.straightLeadMm} onChange={(event) => setNumber("straightLeadMm", event.target.value)} /></Field>
    <Field label="인입 방향 X"><input type="number" step="0.1" value={value.inletDirectionX} onChange={(event) => setNumber("inletDirectionX", event.target.value)} /></Field>
    <Field label="인입 방향 Y"><input type="number" step="0.1" value={value.inletDirectionY} onChange={(event) => setNumber("inletDirectionY", event.target.value)} /></Field>
    <Field label="인입 방향 Z"><input type="number" step="0.1" value={value.inletDirectionZ} onChange={(event) => setNumber("inletDirectionZ", event.target.value)} /></Field>
    <Field label="포트 보정 X (mm)"><input type="number" step="0.1" value={value.offsetX} onChange={(event) => setNumber("offsetX", event.target.value)} /></Field>
    <Field label="포트 보정 Y (mm)"><input type="number" step="0.1" value={value.offsetY} onChange={(event) => setNumber("offsetY", event.target.value)} /></Field>
    <Field label="포트 보정 Z (mm)"><input type="number" step="0.1" value={value.offsetZ} onChange={(event) => setNumber("offsetZ", event.target.value)} /></Field>
    {!!pinNumbers.length && <>
      <div className="model-placement-heading"><strong>PIN INLET PORTS · {pinNumbers.length}</strong></div>
      <div className="model-pin-port-picker" aria-label="편집 핀 선택">{pinNumbers.map((pinNumber) => <button type="button" key={pinNumber} className={`${activePinNumber === pinNumber ? "active" : ""} ${value.pinPorts.some((port) => port.pinNumber === pinNumber) ? "mapped" : ""}`} onClick={() => {
        onSelectedPinNumberChange?.(pinNumber);
        onPlacingPinPortChange?.(false);
        onRotatingConnectorChange?.(false);
      }}>PIN {pinNumber}</button>)}</div>
      {activePinPort && <>
        <div className="model-pin-port-actions">
          <button type="button" className={placingPinPort ? "active" : ""} onClick={() => onPlacingPinPortChange?.(!placingPinPort)}>{placingPinPort ? "STEP 표면을 클릭하세요" : "마우스로 위치 지정"}</button>
          <button type="button" onClick={() => onChange({ ...value, pinPorts: value.pinPorts.filter((port) => port.pinNumber !== activePinNumber) })}><RotateCcw size={11} />선택 핀 초기화</button>
        </div>
        <p className="model-pin-port-help">작은 청록색 포트점을 STEP 표면 위로 드래그하면 선택한 인입면의 수직 방향으로 직선 인출됩니다.</p>
        <Field label="핀 직선 인출 (mm)"><input type="number" min="0" step="1" value={activePinPort.straightLeadMm} onChange={(event) => setPinNumber("straightLeadMm", event.target.value)} /></Field>
      </>}
    </>}
  </div>;
}
