import type { CSSProperties } from "react";
import {
  getWireColorOption,
  wireColorOptions,
} from "../domain/wireColors";

export function WireColorSelect({
  ariaLabel,
  value,
  onChange,
  includeBare = false,
}: {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  includeBare?: boolean;
}) {
  const selected = getWireColorOption(value);
  const options = wireColorOptions.filter(
    (option) => includeBare || option.code !== "BARE",
  );
  const isCustom = value.trim() && !selected;
  const swatchColor = selected?.hex ?? (/^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : "#8aa1b4");

  return (
    <div
      className="wire-color-select"
      style={{ "--wire-color": swatchColor } as CSSProperties}
    >
      <span className="wire-color-select__swatch" aria-hidden="true" />
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {!value && <option value="">색상 선택</option>}
        {isCustom && <option value={value}>{value}</option>}
        {options.map((option) => (
          <option key={option.code} value={option.code}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
