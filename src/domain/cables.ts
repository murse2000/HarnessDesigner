import type { CableCoreDefinition, HarnessSegment, PartSnapshot } from "./types";

export interface CableConductorDefinition extends CableCoreDefinition {
  kind: "core" | "shield";
}

const coreColors = ["BK", "WH", "RD", "BU", "GN", "YE", "OR", "BR", "GY", "VT", "PK"];

export function defaultCableCores(count: number, current: CableCoreDefinition[] = []): CableCoreDefinition[] {
  const safeCount = Number.isInteger(count) && count > 0 ? count : 0;
  return Array.from({ length: safeCount }, (_, index) => current[index] ?? {
    id: String(index + 1),
    number: String(index + 1),
    name: `CORE ${index + 1}`,
    color: coreColors[index % coreColors.length],
    gauge: "",
  });
}

export function validateCableCoreDefinitions(expectedCount: number, cores: CableCoreDefinition[]): string | null {
  if (!Number.isInteger(expectedCount) || expectedCount <= 0 || cores.length !== expectedCount) {
    return "심 수와 코어 정의 개수가 일치해야 합니다.";
  }
  if (cores.some((core) => !core.number.trim() || !core.name.trim() || !core.color.trim() || !core.gauge.trim())) {
    return "모든 코어의 번호, 이름, 색상, Gauge를 입력하세요.";
  }
  const numbers = cores.map((core) => core.number.trim().toUpperCase());
  if (new Set(numbers).size !== numbers.length) return "코어 번호는 중복될 수 없습니다.";
  return null;
}

export function getCableCores(part: PartSnapshot): CableCoreDefinition[] {
  const count = Number(part.attributes.coreCount);
  let fallback = defaultCableCores(count).map((core) => ({ ...core, gauge: part.gauge ?? "" }));
  const colorValue = part.attributes.coreColors;
  if (colorValue) {
    try {
      const colors: unknown = JSON.parse(colorValue);
      if (Array.isArray(colors) && colors.length === fallback.length) {
        fallback = fallback.map((core, index) => ({ ...core, color: String(colors[index]) }));
      }
    } catch {
      // 잘못된 색상 목록은 기존 기본 색상으로 표시합니다.
    }
  }
  const value = part.attributes.cores;
  if (!value) return fallback;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length !== fallback.length) return fallback;
    return parsed.map((item, index) => {
      const core = item as Partial<CableCoreDefinition>;
      return {
        id: String(core.id || fallback[index].id),
        number: String(core.number || fallback[index].number),
        name: String(core.name || fallback[index].name),
        color: String(core.color || fallback[index].color),
        gauge: String(core.gauge || part.gauge || ""),
      };
    });
  } catch {
    return fallback;
  }
}

export function getCableConductors(part: PartSnapshot): CableConductorDefinition[] {
  const cores = getCableCores(part).map((core) => ({ ...core, kind: "core" as const }));
  if (part.attributes.construction !== "shieldedMultiCore") return cores;
  const shieldCount = Math.max(1, Number(part.attributes.shieldCount) || 1);
  return [
    ...cores,
    ...Array.from({ length: shieldCount }, (_, index) => ({
      id: `shield:${index + 1}`,
      number: shieldCount === 1 ? "S" : `S${index + 1}`,
      name: shieldCount === 1 ? "SHIELD / DRAIN" : `SHIELD / DRAIN ${index + 1}`,
      color: part.attributes.drainWireColor || "BARE",
      gauge: part.attributes.drainWireGauge || "",
      kind: "shield" as const,
    })),
  ];
}

export function nextCableRunReference(segments: HarnessSegment[]): string {
  const used = new Set(segments.map((segment) => segment.label.toUpperCase()));
  let index = 1;
  while (used.has(`CBL-${String(index).padStart(3, "0")}`)) index += 1;
  return `CBL-${String(index).padStart(3, "0")}`;
}

export function isCableRunSegment(segment: Pick<HarnessSegment, "cablePartId">): boolean {
  return Boolean(segment.cablePartId);
}
