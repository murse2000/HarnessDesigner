import { buildBom, buildCutList, conductorLengthMm } from "./calculations";
import { resolvePinTermination } from "./parts";
import type {
  EquipmentProfile,
  HarnessAssembly,
  HarnessVariant,
  ProjectDocument,
  SystemAssembly,
  ValidationIssue,
} from "./types";

export interface BundleMetric {
  segmentId: string;
  conductorCount: number;
  calculatedDiameterMm?: number;
  sleeveInnerDiameterMm?: number;
  fillPercent?: number;
}

export interface CostRow {
  partId: string;
  partNumber: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  extendedCost: number;
  supplier: string;
  leadTimeDays?: number;
}

export interface CostSummary {
  materialCost: number;
  laborMinutes: number;
  laborCost: number;
  overheadCost: number;
  totalCost: number;
  currency: string;
}

export interface SystemNetlistRow {
  systemReference: string;
  harnessReference: string;
  harnessNumber: string;
  conductorReference: string;
  from: string;
  to: string;
  wirePartNumber: string;
  color: string;
  gauge: string;
  quantity: number;
}

export interface ConnectionImportRow {
  harnessNumber: string;
  reference: string;
  fromReference: string;
  fromPin: string;
  toReference: string;
  toPin: string;
  wirePartNumber: string;
  color: string;
  gauge: string;
}

const positiveNumber = (value?: string): number | undefined => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
};

const partDiameter = (project: ProjectDocument, partId: string): number | undefined => {
  const part = project.parts.find((item) => item.id === partId);
  return positiveNumber(part?.attributes.outerDiameterMm ?? part?.attributes.diameterMm);
};

export function buildBundleMetrics(project: ProjectDocument, harness: HarnessAssembly): BundleMetric[] {
  const factor = Math.min(1, Math.max(0.1, project.manufacturingRules.bundlePackingFactor));
  return harness.segments.map((segment) => {
    const conductors = harness.conductors.filter((conductor) => conductor.routeSegmentIds.includes(segment.id));
    const diameters = conductors.map((conductor) => partDiameter(project, conductor.wirePartId));
    const complete = diameters.length > 0 && diameters.every((diameter) => diameter !== undefined);
    const calculatedDiameterMm = complete
      ? Math.sqrt(diameters.reduce((total, diameter) => total + diameter! ** 2, 0) / factor)
      : undefined;
    const sleeveInnerDiameterMm = segment.sleevePartId
      ? positiveNumber(project.parts.find((part) => part.id === segment.sleevePartId)?.attributes.innerDiameterMm)
      : undefined;
    const fillPercent = calculatedDiameterMm && sleeveInnerDiameterMm
      ? (calculatedDiameterMm ** 2 / sleeveInnerDiameterMm ** 2) * 100
      : undefined;
    return { segmentId: segment.id, conductorCount: conductors.length, calculatedDiameterMm, sleeveInnerDiameterMm, fillPercent };
  });
}

export function validateManufacturingRules(project: ProjectDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const harness of project.harnesses) {
    const occupiedPins = new Set(harness.conductors.flatMap((conductor) => [conductor.from.pinId, conductor.to.pinId]).filter((pinId): pinId is string => Boolean(pinId)));
    const metrics = new Map(buildBundleMetrics(project, harness).map((metric) => [metric.segmentId, metric]));
    for (const segment of harness.segments) {
      const metric = metrics.get(segment.id);
      if (metric?.conductorCount && metric.calculatedDiameterMm === undefined) {
        issues.push(productionIssue("warning", "WIRE_DIAMETER_MISSING", segment.id, harness.id, "전선 부품의 outerDiameterMm 또는 diameterMm 속성이 필요합니다."));
      }
      if (metric?.fillPercent !== undefined && metric.fillPercent > project.manufacturingRules.maxBundleFillPercent) {
        issues.push(productionIssue("error", "BUNDLE_FILL_EXCEEDED", segment.id, harness.id, `점유율 ${metric.fillPercent.toFixed(1)}% / 허용 ${project.manufacturingRules.maxBundleFillPercent}%`));
      }
      const cable = project.parts.find((part) => part.id === segment.cablePartId);
      const cableDiameter = positiveNumber(cable?.attributes.outerDiameterMm);
      const partMinimum = positiveNumber(cable?.attributes.minimumBendRadiusMm);
      const requiredBend = partMinimum ?? (cableDiameter ? cableDiameter * project.manufacturingRules.minBendRadiusMultiplier : undefined);
      if (segment.bendRadiusMm !== undefined && requiredBend && segment.bendRadiusMm < requiredBend) {
        issues.push(productionIssue("error", "BEND_RADIUS_TOO_SMALL", segment.id, harness.id, `설계 ${segment.bendRadiusMm} mm / 최소 ${requiredBend.toFixed(1)} mm`));
      }
    }
    for (const conductor of harness.conductors) {
      const wire = project.parts.find((part) => part.id === conductor.wirePartId);
      const maxCurrent = positiveNumber(wire?.attributes.maxCurrentA);
      if (conductor.currentA !== undefined && maxCurrent && conductor.currentA > maxCurrent) {
        issues.push(productionIssue("error", "WIRE_CURRENT_EXCEEDED", conductor.id, harness.id, `부하 ${conductor.currentA} A / 허용 ${maxCurrent} A`));
      }
      const resistance = positiveNumber(wire?.attributes.resistanceOhmPerKm);
      if (conductor.currentA && conductor.voltageV && resistance) {
        const dropV = resistance * (conductorLengthMm(conductor, harness) / 1_000_000) * conductor.currentA;
        const dropPercent = dropV / conductor.voltageV * 100;
        if (dropPercent > project.manufacturingRules.maxVoltageDropPercent) {
          issues.push(productionIssue("warning", "VOLTAGE_DROP_EXCEEDED", conductor.id, harness.id, `전압강하 ${dropPercent.toFixed(2)}% / 허용 ${project.manufacturingRules.maxVoltageDropPercent}%`));
        }
      }
      if (conductor.shieldGroup && !conductor.from.pinId && !conductor.to.pinId) {
        issues.push(productionIssue("warning", "SHIELD_GROUNDING_MISSING", conductor.id, harness.id, "실드/드레인 도체의 양 끝이 모두 개방되어 있습니다."));
      }
    }
    if (project.manufacturingRules.requireUnusedCavitySeal) {
      for (const node of harness.nodes.filter((item) => item.kind === "connector")) {
        for (const pin of node.pins.filter((item) => !occupiedPins.has(item.id) && !item.sealPartId)) {
          issues.push(productionIssue("error", "UNUSED_CAVITY_SEAL_MISSING", node.id, harness.id, `미사용 ${node.reference}:${pin.number}에 캐비티 플러그가 지정되지 않았습니다.`));
        }
      }
    }
  }
  return issues;
}

export function buildCostRows(project: ProjectDocument): CostRow[] {
  const parts = new Map(project.parts.map((part) => [part.id, part]));
  return buildBom(project).map((row) => {
    const part = parts.get(row.partId);
    const unitCost = Math.max(0, Number(part?.attributes.unitCost) || 0);
    const leadTimeDays = positiveNumber(part?.attributes.leadTimeDays);
    return {
      partId: row.partId,
      partNumber: row.partNumber,
      description: row.description,
      quantity: row.quantity,
      unit: row.unit,
      unitCost,
      extendedCost: Number((row.quantity * unitCost).toFixed(4)),
      supplier: part?.attributes.supplier ?? "",
      leadTimeDays,
    };
  });
}

export function buildCostSummary(project: ProjectDocument): CostSummary {
  const materialCost = buildCostRows(project).reduce((total, row) => total + row.extendedCost, 0);
  const laborMinutes = project.workInstructions.reduce((total, instruction) => total + Math.max(0, instruction.estimatedMinutes), 0);
  const laborCost = laborMinutes / 60 * Math.max(0, project.manufacturingRules.laborRatePerHour);
  const overheadCost = (materialCost + laborCost) * Math.max(0, project.manufacturingRules.overheadPercent) / 100;
  return { materialCost, laborMinutes, laborCost, overheadCost, totalCost: materialCost + laborCost + overheadCost, currency: project.manufacturingRules.currency };
}

export function buildSystemNetlist(project: ProjectDocument, system: SystemAssembly, variant?: HarnessVariant): SystemNetlistRow[] {
  const disabled = new Set(variant?.disabledConductorIds ?? []);
  const parts = new Map(project.parts.map((part) => [part.id, part]));
  return system.harnessInstances.flatMap((instance) => {
    const harness = project.harnesses.find((item) => item.id === instance.harnessId);
    if (!harness) return [];
    const nodes = new Map(harness.nodes.map((node) => [node.id, node]));
    return harness.conductors.filter((conductor) => !disabled.has(conductor.id)).map((conductor) => {
      const endpoint = (nodeId: string, pinId?: string) => {
        const node = nodes.get(nodeId);
        const pin = node?.pins.find((item) => item.id === pinId);
        return `${instance.reference}/${node?.reference ?? "?"}:${pin?.number ?? "?"}`;
      };
      return {
        systemReference: system.reference,
        harnessReference: instance.reference,
        harnessNumber: harness.number,
        conductorReference: conductor.reference,
        from: endpoint(conductor.from.nodeId, conductor.from.pinId),
        to: endpoint(conductor.to.nodeId, conductor.to.pinId),
        wirePartNumber: parts.get(conductor.wirePartId)?.partNumber ?? "",
        color: conductor.color,
        gauge: conductor.gauge,
        quantity: Math.max(1, instance.quantity),
      };
    });
  });
}

export function projectForVariant(project: ProjectDocument, variant: HarnessVariant): ProjectDocument {
  const disabledConductors = new Set(variant.disabledConductorIds);
  const disabledAccessories = new Set(variant.disabledAccessoryIds);
  const result = structuredClone(project);
  result.harnesses = result.harnesses.map((harness) => ({
    ...harness,
    conductors: harness.conductors.filter((conductor) => !disabledConductors.has(conductor.id)),
    accessories: harness.accessories.filter((accessory) => !disabledAccessories.has(accessory.id)),
  }));
  return result;
}

export function buildEquipmentRows(project: ProjectDocument, profile: EquipmentProfile): Array<Record<string, string | number>> {
  if (profile.kind === "wireProcessor") return buildCutList(project).map((row) => ({
    reference: row.reference, partNumber: row.partNumber, color: row.color, gauge: row.gauge, lengthMm: row.lengthMm,
    startStripMm: row.startStripLengthMm ?? 0, endStripMm: row.endStripLengthMm ?? 0,
  }));
  if (profile.kind === "labelPrinter") return project.harnesses.flatMap((harness) => harness.accessories.flatMap((accessory) => {
    const part = project.parts.find((item) => item.id === accessory.partId && item.category === "label");
    return part ? [{ harness: harness.number, partNumber: part.partNumber, quantity: accessory.quantity, text: accessory.note }] : [];
  }));
  return project.harnesses.flatMap((harness) => harness.conductors.map((conductor) => {
    const fromNode = harness.nodes.find((node) => node.id === conductor.from.nodeId);
    const toNode = harness.nodes.find((node) => node.id === conductor.to.nodeId);
    const fromPin = fromNode?.pins.find((pin) => pin.id === conductor.from.pinId);
    const toPin = toNode?.pins.find((pin) => pin.id === conductor.to.pinId);
    return { reference: conductor.reference, from: `${fromNode?.reference}:${fromPin?.number}`, to: `${toNode?.reference}:${toPin?.number}`, expected: "CONTINUITY" };
  }));
}

export function rowsToDelimited<T extends object>(rows: T[], delimiter: string, includeHeader = true): string {
  if (!rows.length) return "";
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const escape = (value: string | number) => {
    const text = String(value ?? "");
    return /["\r\n,;\t]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [...(includeHeader ? [headers.map(escape).join(delimiter)] : []), ...rows.map((row) => headers.map((header) => escape((row as Record<string, string | number>)[header] ?? "")).join(delimiter))].join("\r\n");
}

function detectDelimiter(text: string): "," | ";" | "\t" {
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && (character === "\r" || character === "\n")) {
      break;
    } else if (!quoted && character in counts) {
      counts[character as keyof typeof counts] += 1;
    }
  }
  return (Object.entries(counts).sort((left, right) => right[1] - left[1])[0]?.[0] as "," | ";" | "\t") || ",";
}

function parseDelimitedRecords(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && character === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (!quoted && (character === "\r" || character === "\n")) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("CSV 인용부호가 닫히지 않았습니다.");
  row.push(cell.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

export function parseConnectionCsv(text: string): ConnectionImportRow[] {
  const records = parseDelimitedRecords(text, detectDelimiter(text));
  if (records.length < 2) return [];
  const headers = records[0].map((header) => header.toLowerCase().replace(/[ _.-]/g, ""));
  const aliases: Record<keyof ConnectionImportRow, string[]> = {
    harnessNumber: ["harness", "harnessnumber", "하네스"], reference: ["reference", "wire", "wireid", "회로", "전선"],
    fromReference: ["from", "fromreference", "시작"], fromPin: ["frompin", "startpin", "시작핀"],
    toReference: ["to", "toreference", "종료"], toPin: ["topin", "endpin", "종료핀"],
    wirePartNumber: ["wirepart", "wirepartnumber", "partnumber", "전선품번"], color: ["color", "색상"], gauge: ["gauge", "규격"],
  };
  const index = Object.fromEntries(Object.entries(aliases).map(([key, values]) => [key, headers.findIndex((header) => values.includes(header))])) as Record<keyof ConnectionImportRow, number>;
  return records.slice(1).map((cells) => Object.fromEntries(Object.keys(aliases).map((key) => [key, index[key as keyof ConnectionImportRow] >= 0 ? cells[index[key as keyof ConnectionImportRow]] ?? "" : ""])) as unknown as ConnectionImportRow)
    .filter((row) => row.fromReference && row.fromPin && row.toReference && row.toPin);
}

export function parseKicadNetlistXml(text: string, harnessNumber: string, wirePartNumber: string): ConnectionImportRow[] {
  const document = new DOMParser().parseFromString(text, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("KiCad XML 넷리스트를 읽을 수 없습니다.");
  return [...document.querySelectorAll("net")].flatMap((net, netIndex) => {
    const nodes = [...net.querySelectorAll(":scope > node")].map((node) => ({ reference: node.getAttribute("ref") ?? "", pin: node.getAttribute("pin") ?? "" })).filter((node) => node.reference && node.pin);
    if (nodes.length < 2) return [];
    return nodes.slice(1).map((node, branchIndex) => ({
      harnessNumber,
      reference: net.getAttribute("name") || `NET-${netIndex + 1}-${branchIndex + 1}`,
      fromReference: nodes[0].reference,
      fromPin: nodes[0].pin,
      toReference: node.reference,
      toPin: node.pin,
      wirePartNumber,
      color: "",
      gauge: "",
    }));
  });
}

export function applyConnectionImport(project: ProjectDocument, rows: ConnectionImportRow[]): { added: number; skipped: string[] } {
  let added = 0;
  const skipped: string[] = [];
  for (const row of rows) {
    const harness = project.harnesses.find((item) => item.number === row.harnessNumber) ?? (project.harnesses.length === 1 ? project.harnesses[0] : undefined);
    const fromNode = harness?.nodes.find((node) => node.reference.toLowerCase() === row.fromReference.toLowerCase());
    const toNode = harness?.nodes.find((node) => node.reference.toLowerCase() === row.toReference.toLowerCase());
    const fromPin = fromNode?.pins.find((pin) => pin.number === row.fromPin);
    const toPin = toNode?.pins.find((pin) => pin.number === row.toPin);
    const wirePart = project.parts.find((part) => part.category === "wire" && part.partNumber.toLowerCase() === row.wirePartNumber.toLowerCase());
    if (!harness || !fromNode || !toNode || !fromPin || !toPin || !wirePart) { skipped.push(row.reference || `${row.fromReference}:${row.fromPin}`); continue; }
    if (harness.conductors.some((conductor) => conductor.reference === row.reference || (conductor.from.pinId === fromPin.id && conductor.to.pinId === toPin.id))) { skipped.push(row.reference); continue; }
    const routeSegmentIds = findRoute(harness, fromNode.id, toNode.id);
    if (!routeSegmentIds.length && fromNode.id !== toNode.id) { skipped.push(row.reference); continue; }
    const start = resolvePinTermination(project.parts, fromNode, fromPin.id);
    const end = resolvePinTermination(project.parts, toNode, toPin.id);
    harness.conductors.push({
      id: crypto.randomUUID(), reference: row.reference || `W${String(harness.conductors.length + 1).padStart(3, "0")}`,
      from: { nodeId: fromNode.id, pinId: fromPin.id }, to: { nodeId: toNode.id, pinId: toPin.id }, wirePartId: wirePart.id,
      color: row.color || wirePart.color || "", gauge: row.gauge || wirePart.gauge || "", routeSegmentIds,
      startTermination: { ...start, allowanceMm: 0 }, endTermination: { ...end, allowanceMm: 0 }, adjustmentMm: 0,
    });
    added += 1;
  }
  return { added, skipped };
}

function findRoute(harness: HarnessAssembly, fromId: string, toId: string): string[] {
  const queue: Array<{ nodeId: string; route: string[] }> = [{ nodeId: fromId, route: [] }];
  const seen = new Set([fromId]);
  while (queue.length) {
    const current = queue.shift()!;
    if (current.nodeId === toId) return current.route;
    for (const segment of harness.segments) {
      const next = segment.fromNodeId === current.nodeId ? segment.toNodeId : segment.toNodeId === current.nodeId ? segment.fromNodeId : undefined;
      if (next && !seen.has(next)) { seen.add(next); queue.push({ nodeId: next, route: [...current.route, segment.id] }); }
    }
  }
  return [];
}

function productionIssue(severity: "error" | "warning", code: string, entityId: string, harnessId: string, details: string): ValidationIssue {
  return { id: `${code}:${entityId}`, severity, code, messageKey: `validation.${code}`, entityId, harnessId, details };
}
