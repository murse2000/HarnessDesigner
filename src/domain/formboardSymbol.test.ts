import { describe, expect, it } from "vitest";
import { createProject } from "./sample";
import { resolveFormboardSymbol, resolveFormboardSymbolRotation, resolveFormboardSymbolRouteRotation } from "./formboardSymbol";
import type { ModelAsset, SymbolAsset } from "./types";

const model: ModelAsset = {
  id: "step-model",
  name: "STEP connector",
  sourceFormat: "step",
  sourceName: "connector.step",
  sourceDataBase64: "",
  meshes: [{ name: "body", positions: [0, 0, 0, 20, 0, 0, 20, 10, 0, 0, 10, 0], indices: [0, 1, 2, 0, 2, 3] }],
};

describe("폼보드 부품 형상", () => {
  it("등록된 2D 심벌이 없으면 인입축이 보이는 STEP 측면 투영을 사용한다", () => {
    const project = createProject();
    const part = project.parts[0];
    part.symbolAssetId = undefined;
    part.modelAssetId = model.id;
    project.modelAssets.push(model);

    const symbol = resolveFormboardSymbol(project, part);

    expect(symbol?.id).toBe("formboard-step-model-left");
    expect(symbol?.svg).toContain('data-step-view="left"');
  });

  it("등록된 2D 심벌을 STEP 투영보다 우선한다", () => {
    const project = createProject();
    const part = project.parts[0];
    const registered: SymbolAsset = { id: "registered", name: "registered", sourceFormat: "dxf", sourceName: "registered.dxf", viewBox: "0 0 5 5", svg: '<svg viewBox="0 0 5 5"><line x1="0" y1="0" x2="5" y2="5"/></svg>' };
    part.symbolAssetId = registered.id;
    part.modelAssetId = model.id;
    project.assets.push(registered);
    project.modelAssets.push(model);

    expect(resolveFormboardSymbol(project, part)).toBe(registered);
  });

  it("인입축 정면 STEP 심벌은 폼보드용 측면 투영으로 다시 만든다", () => {
    const project = createProject();
    const part = project.parts[0];
    const registered: SymbolAsset = {
      id: "registered-step",
      name: "saved STEP projection",
      sourceFormat: "svg",
      sourceName: "connector_front.svg",
      viewBox: "-4 -8 8 16",
      svg: '<svg data-step-view="front" viewBox="-4 -8 8 16"><line x1="0" y1="-8" x2="0" y2="8"/></svg>',
    };
    part.symbolAssetId = registered.id;
    part.modelAssetId = model.id;
    project.assets.push(registered);
    project.modelAssets.push(model);

    expect(resolveFormboardSymbol(project, part)?.svg).toContain('data-step-view="left"');
  });

  it("STEP에서 만든 심벌은 저장된 3D 회전 보정으로 다시 투영한다", () => {
    const project = createProject();
    const part = project.parts[0];
    const registered: SymbolAsset = {
      id: "registered-step",
      name: "STEP front",
      sourceFormat: "svg",
      sourceName: "connector_front.svg",
      viewBox: "-1 -1 22 12",
      svg: '<svg data-step-view="front" viewBox="-1 -1 22 12"><line x1="0" y1="0" x2="20" y2="0"/></svg>',
    };
    part.symbolAssetId = registered.id;
    part.modelAssetId = model.id;
    part.attributes.modelPlacement = JSON.stringify({ cableAxis: "-y", rollDeg: 90, scale: 1, offsetX: 0, offsetY: 0, offsetZ: 0 });
    project.assets.push(registered);
    project.modelAssets.push(model);

    const symbol = resolveFormboardSymbol(project, part);
    const [, , width, height] = symbol!.viewBox.split(" ").map(Number);

    expect(symbol?.id).toBe(registered.id);
    expect(width).toBeLessThan(height);
  });

  it("등록된 DXF 심벌에는 저장된 축 회전을 적용한다", () => {
    const project = createProject();
    const part = project.parts[0];
    const registered: SymbolAsset = { id: "registered-dxf", name: "registered", sourceFormat: "dxf", sourceName: "registered.dxf", viewBox: "0 0 20 10", svg: '<svg viewBox="0 0 20 10"><line x1="0" y1="0" x2="20" y2="0"/></svg>' };
    part.symbolAssetId = registered.id;
    part.attributes.modelPlacement = JSON.stringify({ cableAxis: "+z", rollDeg: 90, scale: 1, offsetX: 0, offsetY: 0, offsetZ: 0 });
    project.assets.push(registered);

    const symbol = resolveFormboardSymbol(project, part);

    expect(symbol).toBe(registered);
    expect(resolveFormboardSymbolRotation(symbol, part)).toBe(90);
  });

  it("회전 보정이 이미 투영된 STEP 심벌에는 중복 적용되지 않는다", () => {
    const project = createProject();
    const part = project.parts[0];
    part.modelAssetId = model.id;
    part.attributes.modelPlacement = JSON.stringify({ cableAxis: "+z", rollDeg: 90, scale: 1, offsetX: 0, offsetY: 0, offsetZ: 0 });
    project.modelAssets.push(model);

    const symbol = resolveFormboardSymbol(project, part);

    expect(resolveFormboardSymbolRotation(symbol, part)).toBe(0);
  });

  it("STEP 투영의 인입축 기준각을 경로 각도에서 제거한다", () => {
    const project = createProject();
    const part = project.parts[0];
    const right: SymbolAsset = { id: "right", name: "right", sourceFormat: "svg", sourceName: "right.svg", viewBox: "0 0 20 10", svg: '<svg data-step-view="right" viewBox="0 0 20 10" />' };

    expect(resolveFormboardSymbolRouteRotation(right, part, 0)).toBe(-180);
    expect(resolveFormboardSymbolRouteRotation(right, part, 180)).toBe(0);
  });
});
