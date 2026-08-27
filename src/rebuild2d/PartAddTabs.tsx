export type PartAddKind = "housing" | "wire" | "cable";

export function PartAddTabs({ active, onChange }: { active: PartAddKind; onChange: (kind: PartAddKind) => void }) {
  return <nav className="hd2-part-add-tabs" aria-label="추가할 부품 종류">
    <button type="button" className={active === "housing" ? "is-selected" : ""} onClick={() => onChange("housing")}>커넥터</button>
    <button type="button" className={active === "wire" ? "is-selected" : ""} onClick={() => onChange("wire")}>단선</button>
    <button type="button" className={active === "cable" ? "is-selected" : ""} onClick={() => onChange("cable")}>멀티코어 케이블</button>
  </nav>;
}
