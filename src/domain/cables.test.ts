import { describe, expect, it } from "vitest";
import { defaultCableCores, getCableConductors, getCableCores, isCableRunSegment, nextCableRunReference, validateCableCoreDefinitions } from "./cables";
import type { PartSnapshot } from "./types";

const cable = (attributes: Record<string, string>): PartSnapshot => ({
  id: "cable", name: "Cable", partNumber: "CBL-4C", manufacturer: "TEST", description: "", revision: "A",
  category: "cable", unit: "m", gauge: "20 AWG", attributes,
});

describe("멀티코어 케이블 정의", () => {
  it("심 수만 있는 기존 부품은 표준 코어 정의로 보완한다", () => {
    expect(getCableCores(cable({ coreCount: "2" }))).toEqual([
      { id: "1", number: "1", name: "CORE 1", color: "BK", gauge: "20 AWG" },
      { id: "2", number: "2", name: "CORE 2", color: "WH", gauge: "20 AWG" },
    ]);
  });

  it("등록된 코어 번호·색상·굵기를 사용한다", () => {
    const cores = defaultCableCores(2);
    cores[0] = { ...cores[0], name: "POWER", color: "RD", gauge: "18 AWG" };
    expect(getCableCores(cable({ coreCount: "2", cores: JSON.stringify(cores) }))[0]).toMatchObject({ name: "POWER", color: "RD", gauge: "18 AWG" });
  });

  it("커스텀 코어 정의의 필수값과 중복 번호를 검증한다", () => {
    const cores = defaultCableCores(2).map((core) => ({ ...core, gauge: "22 AWG" }));
    expect(validateCableCoreDefinitions(2, cores)).toBeNull();
    expect(validateCableCoreDefinitions(3, cores)).toBe("심 수와 코어 정의 개수가 일치해야 합니다.");
    expect(validateCableCoreDefinitions(2, [{ ...cores[0], gauge: "" }, cores[1]])).toBe("모든 코어의 번호, 이름, 색상, Gauge를 입력하세요.");
    expect(validateCableCoreDefinitions(2, [cores[0], { ...cores[1], number: cores[0].number }])).toBe("코어 번호는 중복될 수 없습니다.");
  });

  it("카탈로그 코어 색상 목록을 코어에 적용한다", () => {
    expect(getCableCores(cable({ coreCount: "3", coreColors: '["BK","WH","RD"]' })).map((core) => core.color)).toEqual(["BK", "WH", "RD"]);
  });

  it("실드 케이블은 일반 코어와 별도인 드레인 결선을 제공한다", () => {
    const conductors = getCableConductors(cable({
      construction: "shieldedMultiCore", coreCount: "4", shieldCount: "2", drainWireGauge: "24 AWG", drainWireColor: "BARE",
    }));
    expect(conductors.filter((item) => item.kind === "core")).toHaveLength(4);
    expect(conductors.filter((item) => item.kind === "shield")).toEqual([
      expect.objectContaining({ id: "shield:1", number: "S1", gauge: "24 AWG" }),
      expect.objectContaining({ id: "shield:2", number: "S2", gauge: "24 AWG" }),
    ]);
  });

  it("겹치지 않는 케이블 런 참조명을 만든다", () => {
    expect(nextCableRunReference([{ id: "s", fromNodeId: "a", toNodeId: "b", lengthMm: 1, label: "CBL-001" }])).toBe("CBL-002");
  });

  it("일반 내부 구간은 숨기고 실제 케이블 런만 도면에 표시한다", () => {
    expect(isCableRunSegment({})).toBe(false);
    expect(isCableRunSegment({ cablePartId: "part-cable" })).toBe(true);
  });
});
