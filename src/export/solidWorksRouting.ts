import type { HarnessAssembly, PartSnapshot, ProjectDocument } from "../domain/types";
import { getCableCores } from "../domain/cables";
import { getModelPlacement } from "../three/modelPlacement";
import { buildHarnessCadData, buildHarnessStep } from "./step3d";

export interface RoutingPackageEntry {
  path: string;
  contentBase64: string;
}

export interface SolidWorksRoutingPackage {
  entries: RoutingPackageEntry[];
  fromToRows: string[][];
  cableLibraryRows: string[][];
}

const fromToHeaders = ["Wire Name", "Cable Name", "From Reference", "From Pin", "To Reference", "To Pin", "Part Number", "Color", "Gauge", "Cable Core", "Route Segments", "Length (mm)", "From CPoint", "To CPoint"];
const cableLibraryHeaders = ["Type", "Name", "Part Number", "Manufacturer", "Description", "Gauge", "Color", "Outer Diameter (mm)", "Core Count", "Construction", "Core Number", "Core Name", "Core Color", "Core Gauge"];

function safeName(value: string) {
  return value.trim().replaceAll(/[^a-zA-Z0-9가-힣_.-]/g, "_") || "ITEM";
}

function xml(value: unknown) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function textBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

function endpoint(harness: HarnessAssembly, nodeId: string, pinId?: string) {
  const node = harness.nodes.find((item) => item.id === nodeId);
  const pin = node?.pins.find((item) => item.id === pinId);
  return { reference: node?.reference ?? nodeId, pin: pin?.number ?? pinId ?? "", cpoint: `${node?.reference ?? nodeId}_CP1` };
}

function routeLength(harness: HarnessAssembly, routeSegmentIds: string[]) {
  return routeSegmentIds.reduce((total, id) => total + (harness.segments.find((segment) => segment.id === id)?.lengthMm ?? 0), 0);
}

function componentDirection(harness: HarnessAssembly, nodeId: string, positions: ReturnType<typeof buildHarnessCadData>["nodePositions"]) {
  const origin = positions.get(nodeId);
  if (!origin) return { x: 0, y: 0, z: 1 };
  let x = 0; let y = 0; let z = 0;
  for (const segment of harness.segments) {
    const otherId = segment.fromNodeId === nodeId ? segment.toNodeId : segment.toNodeId === nodeId ? segment.fromNodeId : null;
    const other = otherId ? positions.get(otherId) : undefined;
    if (!other) continue;
    const dx = other.x - origin.x; const dy = other.y - origin.y; const dz = other.z - origin.z;
    const length = Math.hypot(dx, dy, dz) || 1;
    x += dx / length; y += dy / length; z += dz / length;
  }
  const length = Math.hypot(x, y, z);
  return length > 0.001 ? { x: x / length, y: y / length, z: z / length } : { x: 0, y: 0, z: 1 };
}

function libraryRows(project: ProjectDocument, harness: HarnessAssembly) {
  const rows: string[][] = [cableLibraryHeaders];
  const usedPartIds = new Set(harness.conductors.map((conductor) => conductor.wirePartId));
  harness.segments.forEach((segment) => segment.cablePartId && usedPartIds.add(segment.cablePartId));
  for (const part of project.parts.filter((item) => usedPartIds.has(item.id))) {
    if (part.category === "cable") {
      const cores = getCableCores(part);
      if (!cores.length) rows.push(["Cable", part.partNumber, part.partNumber, part.manufacturer, part.description, "", part.color ?? "", part.attributes.outerDiameterMm ?? "", part.attributes.coreCount ?? "", part.attributes.construction ?? "multiCore", "", "", "", ""]);
      cores.forEach((core) => rows.push(["Cable Core", `${part.partNumber}:${core.number}`, part.partNumber, part.manufacturer, part.description, "", part.color ?? "", part.attributes.outerDiameterMm ?? "", part.attributes.coreCount ?? "", part.attributes.construction ?? "multiCore", core.number, core.name, core.color, core.gauge]));
    } else {
      rows.push(["Wire", part.partNumber, part.partNumber, part.manufacturer, part.description, part.gauge ?? "", part.color ?? "", part.attributes.outerDiameterMm ?? "", "", "", "", "", "", ""]);
    }
  }
  return rows;
}

function fromToRows(project: ProjectDocument, harness: HarnessAssembly) {
  const rows: string[][] = [fromToHeaders];
  for (const conductor of harness.conductors) {
    const from = endpoint(harness, conductor.from.nodeId, conductor.from.pinId);
    const to = endpoint(harness, conductor.to.nodeId, conductor.to.pinId);
    const part = project.parts.find((item) => item.id === conductor.wirePartId);
    const cableSegment = harness.segments.find((segment) => segment.id === conductor.cableRunId);
    rows.push([
      conductor.reference,
      cableSegment?.label ?? conductor.cableRunId ?? "",
      from.reference,
      from.pin,
      to.reference,
      to.pin,
      part?.partNumber ?? conductor.wirePartId,
      conductor.color,
      conductor.gauge,
      conductor.cableCoreId ?? "",
      conductor.routeSegmentIds.map((id) => harness.segments.find((segment) => segment.id === id)?.label ?? id).join(" > "),
      String(conductor.overrideLengthMm ?? routeLength(harness, conductor.routeSegmentIds) + conductor.startTermination.allowanceMm + conductor.endTermination.allowanceMm + conductor.adjustmentMm),
      from.cpoint,
      to.cpoint,
    ]);
  }
  return rows;
}

function routingXml(project: ProjectDocument, harness: HarnessAssembly, fromTo: string[][]) {
  const rows = fromTo.slice(1);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<HarnessDesignerRouting version="1" project="${xml(project.projectNumber)}" harness="${xml(harness.number)}" revision="${xml(harness.revision)}">\n  <FromToList>\n${rows.map((row) => `    <Connection wire="${xml(row[0])}" cable="${xml(row[1])}" fromReference="${xml(row[2])}" fromPin="${xml(row[3])}" toReference="${xml(row[4])}" toPin="${xml(row[5])}" partNumber="${xml(row[6])}" color="${xml(row[7])}" gauge="${xml(row[8])}" cableCore="${xml(row[9])}" route="${xml(row[10])}" lengthMm="${xml(row[11])}" />`).join("\n")}\n  </FromToList>\n</HarnessDesignerRouting>\n`;
}

function componentStepEntries(project: ProjectDocument, harness: HarnessAssembly) {
  const entries: RoutingPackageEntry[] = [];
  const seen = new Set<string>();
  for (const node of harness.nodes) {
    const part = project.parts.find((item) => item.id === node.partId);
    const asset = project.modelAssets.find((item) => item.id === part?.modelAssetId);
    if (!part || !asset?.sourceDataBase64 || seen.has(asset.id)) continue;
    seen.add(asset.id);
    entries.push({ path: `components/${safeName(part.partNumber)}_${safeName(asset.id)}.step`, contentBase64: asset.sourceDataBase64 });
  }
  return entries;
}

function partSummary(part: PartSnapshot | undefined) {
  return part ? { partNumber: part.partNumber, manufacturer: part.manufacturer, modelPlacement: getModelPlacement(part) } : null;
}

export function buildSolidWorksRoutingPackage(project: ProjectDocument, harness: HarnessAssembly): SolidWorksRoutingPackage {
  if (!harness.nodes.length) throw new Error("SolidWorks Routing 패키지에 포함할 커넥터가 없습니다.");
  if (!harness.conductors.length) throw new Error("SolidWorks Routing 패키지에 포함할 From-To 연결이 없습니다.");
  const cad = buildHarnessCadData(project, harness);
  const fromTo = fromToRows(project, harness);
  const cableLibrary = libraryRows(project, harness);
  const components = harness.nodes.map((node) => {
    const part = project.parts.find((item) => item.id === node.partId);
    const position = cad.nodePositions.get(node.id) ?? { x: 0, y: 0, z: 0 };
    return {
      id: node.id,
      reference: node.reference,
      label: node.label,
      part: partSummary(part),
      positionMm: position,
      cpoints: [{ id: `${node.reference}_CP1`, positionMm: position, direction: componentDirection(harness, node.id, cad.nodePositions), schematicPinId: null }],
      pins: node.pins.map((pin) => ({ id: pin.id, number: pin.number, name: pin.name })),
    };
  });
  const manifest = {
    format: "HarnessDesigner.SolidWorksRoutingPackage",
    version: 1,
    generatedAt: new Date().toISOString(),
    project: { id: project.id, number: project.projectNumber, name: project.name, revision: project.revision },
    harness: { id: harness.id, number: harness.number, name: harness.name, revision: harness.revision },
    coordinateSystem: { unit: "mm", handedness: "right", upAxis: "+Y" },
    components,
    routes: cad.routes,
  };
  const guide = `HARNESS DESIGNER → SOLIDWORKS ROUTING\n\n1. SOLIDWORKS Routing 애드인을 활성화합니다.\n2. components 폴더의 STEP을 SOLIDWORKS 파트로 변환하고 Routing Library Manager에서 각 부품의 CP1을 생성합니다.\n3. routing/From-To.xlsx를 From-To List로 가져오고 열을 대응시킵니다.\n4. routing/Routes.json의 중심선과 굽힘 반경을 사용해 3D Route Sketch를 확인합니다.\n5. reference/${safeName(harness.number)}_REFERENCE.step은 간섭 확인용 정적 참조 형상입니다.\n\n주의: 이 패키지는 .SLDASM을 위조하지 않습니다. CPoint가 없는 STEP 원본은 Routing Library Manager에서 패키지의 CPoints.json 좌표/방향대로 CP1을 한 번 생성해야 합니다. 이후 Routing 조립품에서 커넥터를 이동하면 케이블이 경로를 따라 갱신됩니다.\n`;
  const entries: RoutingPackageEntry[] = [
    { path: "manifest.json", contentBase64: textBase64(JSON.stringify(manifest, null, 2)) },
    { path: "README_KO.txt", contentBase64: textBase64(guide) },
    { path: "routing/CPoints.json", contentBase64: textBase64(JSON.stringify(components, null, 2)) },
    { path: "routing/Routes.json", contentBase64: textBase64(JSON.stringify(cad.routes, null, 2)) },
    { path: "routing/HarnessDesignerRouting.xml", contentBase64: textBase64(routingXml(project, harness, fromTo)) },
    { path: `reference/${safeName(harness.number)}_REFERENCE.step`, contentBase64: textBase64(buildHarnessStep(project, harness)) },
    ...componentStepEntries(project, harness),
  ];
  return { entries, fromToRows: fromTo, cableLibraryRows: cableLibrary };
}
