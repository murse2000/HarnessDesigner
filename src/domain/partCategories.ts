import type { PartCategory } from "./types";

export const partCategories: PartCategory[] = [
  "housing", "terminal", "seal", "wire", "cable", "heatShrink", "sleeve", "shield", "tape", "label", "clip", "lug", "splice",
];

const koreanLabels: Record<PartCategory, string> = {
  housing: "하우징",
  terminal: "터미널",
  seal: "씰",
  wire: "전선",
  cable: "케이블",
  heatShrink: "수축튜브",
  sleeve: "슬리브",
  shield: "실드",
  tape: "테이프",
  label: "라벨",
  clip: "클립",
  lug: "러그",
  splice: "스플라이스",
};

export function partCategoryLabel(category: PartCategory, locale: "ko" | "en") {
  if (locale === "ko") return koreanLabels[category];
  return category === "heatShrink" ? "HEAT SHRINK" : category.toUpperCase();
}
