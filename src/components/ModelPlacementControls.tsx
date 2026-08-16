import { RotateCcw } from "lucide-react";
import { defaultModelPlacement, type ModelCableAxis, type ModelPlacement } from "../three/modelPlacement";
import { Field } from "./common";

export function ModelPlacementControls({ value, onChange }: { value: ModelPlacement; onChange: (value: ModelPlacement) => void }) {
  const setNumber = (key: keyof Omit<ModelPlacement, "cableAxis">, raw: string) => {
    const next = Number(raw);
    if (Number.isFinite(next)) onChange({ ...value, [key]: key === "scale" ? Math.max(next / 100, 0.01) : next });
  };
  return <div className="model-placement-controls">
    <div className="model-placement-heading"><strong>3D ALIGNMENT</strong><button onClick={() => onChange({ ...defaultModelPlacement })}><RotateCcw size={11} />초기화</button></div>
    <Field label="와이어 인입축"><select value={value.cableAxis} onChange={(event) => onChange({ ...value, cableAxis: event.target.value as ModelCableAxis })}><option value="+x">+X</option><option value="-x">-X</option><option value="+y">+Y</option><option value="-y">-Y</option><option value="+z">+Z</option><option value="-z">-Z</option></select></Field>
    <Field label="축 회전 (°)"><input type="number" step="5" value={value.rollDeg} onChange={(event) => setNumber("rollDeg", event.target.value)} /></Field>
    <Field label="배율 (%)"><input type="number" min="1" step="1" value={Math.round(value.scale * 10000) / 100} onChange={(event) => setNumber("scale", event.target.value)} /></Field>
    <Field label="접속점 X (mm)"><input type="number" step="0.1" value={value.offsetX} onChange={(event) => setNumber("offsetX", event.target.value)} /></Field>
    <Field label="접속점 Y (mm)"><input type="number" step="0.1" value={value.offsetY} onChange={(event) => setNumber("offsetY", event.target.value)} /></Field>
    <Field label="접속점 Z (mm)"><input type="number" step="0.1" value={value.offsetZ} onChange={(event) => setNumber("offsetZ", event.target.value)} /></Field>
  </div>;
}
