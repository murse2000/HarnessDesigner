export interface WireColorOption {
  code: string;
  label: string;
  hex: string;
}

export const wireColorOptions: WireColorOption[] = [
  { code: "BK", label: "검정", hex: "#26323d" },
  { code: "WH", label: "흰색", hex: "#f2f3f4" },
  { code: "RD", label: "빨강", hex: "#d23b3b" },
  { code: "BU", label: "파랑", hex: "#3488c8" },
  { code: "GN", label: "초록", hex: "#43a06b" },
  { code: "YE", label: "노랑", hex: "#d7ad32" },
  { code: "OR", label: "주황", hex: "#df7a2d" },
  { code: "BR", label: "갈색", hex: "#84543b" },
  { code: "GY", label: "회색", hex: "#7b8792" },
  { code: "VT", label: "보라", hex: "#7b5bb5" },
  { code: "PK", label: "분홍", hex: "#d86d9d" },
  { code: "BARE", label: "피복 없음", hex: "#b8c1c8" },
];

export function getWireColorOption(value: string) {
  const normalized = value.trim().toUpperCase();
  return wireColorOptions.find((option) => option.code === normalized);
}
