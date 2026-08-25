import { describe, expect, it } from "vitest";
import type { HarnessNode, PartSnapshot } from "./types";
import { createPinsFromPart, getCompatibleClampIds, getCompatibleTerminalIds, getPartName, getPartPinCount, getPartPinNumbers, hasMappedPinPositions, isConnectorClampPart, nextConnectorReference, resolvePinTermination } from "./parts";

const housing: PartSnapshot = {
  id: "housing-1",
  name: "방수 4핀 커넥터",
  partNumber: "DT04-4P",
  manufacturer: "TE Connectivity",
  description: "4 position receptacle",
  revision: "A",
  category: "housing",
  unit: "ea",
  attributes: { cavities: "4", compatibleTerminalPartIds: "[\"terminal-1\"]", compatibleClampPartIds: "[\"clamp-1\"]", defaultTerminalPartId: "terminal-1" },
};

describe("커넥터 부품 정보", () => {
  it("파트명과 핀 수를 라이브러리 데이터에서 읽는다", () => {
    expect(getPartName(housing)).toBe("방수 4핀 커넥터");
    expect(getPartPinCount(housing)).toBe(4);
    expect(getPartPinNumbers(housing)).toEqual(["1", "2", "3", "4"]);
    expect(createPinsFromPart(housing).map((pin) => pin.number)).toEqual(["1", "2", "3", "4"]);
    expect(createPinsFromPart(housing).every((pin) => pin.terminalPartId === "terminal-1")).toBe(true);
    expect(getCompatibleTerminalIds(housing)).toEqual(["terminal-1"]);
    expect(getCompatibleClampIds(housing)).toEqual(["clamp-1"]);
    expect(isConnectorClampPart({ ...housing, category: "clip", attributes: { accessoryType: "connectorClamp" } })).toBe(true);
  });

  it("핀맵을 배치할 때마다 새 핀 ID로 복제한다", () => {
    const mapped = { ...housing, attributes: { pinMap: JSON.stringify([{ id: "library-pin", number: "A1", name: "POWER", position: { x: 12, y: 18 } }]) } };
    const first = createPinsFromPart(mapped);
    const second = createPinsFromPart(mapped);
    expect(first[0]).toMatchObject({ number: "A1", name: "POWER", position: { x: 12, y: 18 } });
    expect(getPartPinNumbers(mapped)).toEqual(["A1"]);
    expect(first[0].id).not.toBe(second[0].id);
  });

  it("DXF에 저장된 핀 좌표와 자동 생성 임시 좌표를 구분한다", () => {
    const mapped = { ...housing, attributes: { ...housing.attributes, pinMap: JSON.stringify([{ number: "1", name: "", position: { x: 1.2, y: 2.4 } }]) } };

    expect(hasMappedPinPositions(housing)).toBe(false);
    expect(hasMappedPinPositions(mapped)).toBe(true);
  });

  it("핀 지정값이 없으면 하우징 기본 터미널과 터미널 기본 씰을 적용한다", () => {
    const terminal: PartSnapshot = { id: "terminal-1", partNumber: "T-1", manufacturer: "TEST", description: "", revision: "A", category: "terminal", unit: "ea", attributes: { defaultSealPartId: "seal-1" } };
    const node: HarnessNode = { id: "node-1", kind: "connector", reference: "J1", label: "J1", partId: housing.id, position: { x: 0, y: 0 }, pins: [{ id: "pin-1", number: "1", name: "", position: { x: 0, y: 0 } }] };
    expect(resolvePinTermination([housing, terminal], node, "pin-1")).toEqual({ terminalPartId: "terminal-1", sealPartId: "seal-1" });
  });

  it("사용 중인 참조를 건너뛰어 다음 커넥터 참조를 만든다", () => {
    expect(nextConnectorReference([
      { id: "1", kind: "connector", reference: "J1", label: "", position: { x: 0, y: 0 }, pins: [] },
      { id: "2", kind: "connector", reference: "J3", label: "", position: { x: 0, y: 0 }, pins: [] },
    ])).toBe("J2");
  });
});
