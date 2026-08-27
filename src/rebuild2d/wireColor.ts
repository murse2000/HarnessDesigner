export const WIRE_COLOR_CODES = ["BK", "WH", "RD", "BU", "GN", "YE", "OR", "BN", "VT", "GY"] as const;

const COLOR_VALUES: Record<string, string> = {
  BK: "#20262c",
  WH: "#cbd3da",
  RD: "#d73c3c",
  BU: "#2c7ec8",
  GN: "#28965a",
  YE: "#d9a514",
  OR: "#e87924",
  BN: "#7a4d2c",
  VT: "#7557a6",
  GY: "#788590",
};

export function splitWireColor(value: string) {
  const [primary, secondary] = value.toUpperCase().split("/", 2);
  return { primary: primary || "BK", secondary: secondary || "" };
}

export function joinWireColor(primary: string, secondary: string) {
  return secondary ? `${primary}/${secondary}` : primary;
}

export function wireColorValue(code: string) {
  return COLOR_VALUES[code.toUpperCase()] ?? "#176b9b";
}

export function wireColorBackground(value: string) {
  const { primary, secondary } = splitWireColor(value);
  const first = wireColorValue(primary);
  return secondary ? `linear-gradient(90deg, ${first} 0 50%, ${wireColorValue(secondary)} 50% 100%)` : first;
}
