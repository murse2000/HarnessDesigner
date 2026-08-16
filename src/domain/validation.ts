import type { ProjectDocument, ValidationIssue } from "./types";
import type { ValidationCode, ValidationLevel } from "../preferences";
import { getCableConductors, getCableCores } from "./cables";
import { pinConductorCapacity } from "./pinCapacity";

export function validateProject(project: ProjectDocument, rules?: Record<ValidationCode, ValidationLevel>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const partIds = new Set(project.parts.map((part) => part.id));

  for (const part of project.parts) {
    if (!part.partNumber.trim() || !part.unit) {
      issues.push(issue("error", "PART_INCOMPLETE", "validation.partIncomplete", part.id));
    }
  }

  for (const harness of project.harnesses) {
    const nodes = new Map(harness.nodes.map((node) => [node.id, node]));
    const segments = new Map(harness.segments.map((segment) => [segment.id, segment]));
    const occupiedPins = new Map<string, number>();

    for (const segment of harness.segments) {
      if (!nodes.has(segment.fromNodeId) || !nodes.has(segment.toNodeId)) {
        issues.push(issue("error", "SEGMENT_NODE_MISSING", "validation.segmentNodeMissing", segment.id, harness.id));
      }
      if (segment.lengthMm <= 0) {
        issues.push(issue("error", "SEGMENT_LENGTH", "validation.segmentLength", segment.id, harness.id));
      }
      for (const partId of [segment.cablePartId, segment.startHeatShrinkPartId, segment.endHeatShrinkPartId, segment.sleevePartId, segment.shieldPartId, segment.tapePartId]) {
        if (partId && !partIds.has(partId)) issues.push(issue("error", "PART_MISSING", "validation.partMissing", segment.id, harness.id));
      }
      const cablePart = project.parts.find((part) => part.id === segment.cablePartId && part.category === "cable");
      const coreCount = Number(cablePart?.attributes.coreCount);
      const coreIds = new Set(cablePart ? getCableCores(cablePart).map((core) => core.id) : []);
      const routedCoreCount = harness.conductors.filter((conductor) => conductor.routeSegmentIds.includes(segment.id) && (!conductor.cableCoreId || coreIds.has(conductor.cableCoreId))).length;
      if (Number.isFinite(coreCount) && coreCount > 0 && routedCoreCount > coreCount) {
        issues.push(issue("warning", "CABLE_CORE_CAPACITY", "validation.cableCoreCapacity", segment.id, harness.id));
      }
      if (cablePart && (!segment.startHeatShrinkPartId || !segment.endHeatShrinkPartId)) {
        issues.push(issue("warning", "HEAT_SHRINK_REQUIRED", "validation.heatShrinkRequired", segment.id, harness.id));
      }
    }

    for (const conductor of harness.conductors) {
      if (!partIds.has(conductor.wirePartId)) issues.push(issue("error", "WIRE_PART_MISSING", "validation.wirePartMissing", conductor.id, harness.id));
      if (!conductor.shieldGroup && (!conductor.from.pinId || !conductor.to.pinId)) {
        issues.push(issue("error", "CONNECTION_INCOMPLETE", "validation.connectionIncomplete", conductor.id, harness.id));
      }
      let terminationMissing = false;
      for (const [endpoint, termination] of [[conductor.from, conductor.startTermination], [conductor.to, conductor.endTermination]] as const) {
        const endpointKey = `${endpoint.nodeId}:${endpoint.pinId ?? "open"}`;
        const node = nodes.get(endpoint.nodeId);
        const pinExists = !endpoint.pinId || node?.pins.some((pin) => pin.id === endpoint.pinId);
        if (!node || !pinExists) issues.push(issue("error", "PIN_MISSING", "validation.pinMissing", conductor.id, harness.id, endpointKey));
        if (endpoint.pinId && node?.kind === "connector") {
          const key = `${endpoint.nodeId}:${endpoint.pinId}`;
          const usage = (occupiedPins.get(key) ?? 0) + 1;
          if (usage > pinConductorCapacity(project.parts, node, endpoint.pinId)) issues.push(issue("error", "PIN_DUPLICATE", "validation.pinDuplicate", conductor.id, harness.id, endpointKey));
          occupiedPins.set(key, usage);
          if (!termination.terminalPartId) terminationMissing = true;
        }
        if (termination.terminalPartId && !partIds.has(termination.terminalPartId)) {
          issues.push(issue("error", "PART_MISSING", "validation.partMissing", conductor.id, harness.id, endpointKey));
        }
        const housing = project.parts.find((part) => part.id === node?.partId && part.category === "housing");
        const compatibleTerminalIds = parsePartIds(housing?.attributes.compatibleTerminalPartIds);
        if (termination.terminalPartId && compatibleTerminalIds.length && !compatibleTerminalIds.includes(termination.terminalPartId)) {
          issues.push(issue("error", "TERMINAL_HOUSING_INCOMPATIBLE", "validation.terminalHousingIncompatible", conductor.id, harness.id, endpointKey));
        }
        const terminal = project.parts.find((part) => part.id === termination.terminalPartId && part.category === "terminal");
        const wireRange = terminal?.gauge || terminal?.attributes.wireRange;
        if (wireRange && !wireRangeIncludes(wireRange, conductor.gauge)) {
          issues.push(issue("warning", "TERMINAL_WIRE_INCOMPATIBLE", "validation.terminalWireIncompatible", conductor.id, harness.id, endpointKey));
        }
      }
      if (terminationMissing) issues.push(issue("error", "TERMINATION_MISSING", "validation.terminationMissing", conductor.id, harness.id));
      if (!conductor.routeSegmentIds.length || conductor.routeSegmentIds.some((id) => !segments.has(id))) {
        issues.push(issue("error", "ROUTE_BROKEN", "validation.routeBroken", conductor.id, harness.id));
      }
      if (conductor.cableRunId) {
        const cableRun = segments.get(conductor.cableRunId);
        if (!cableRun?.cablePartId || conductor.wirePartId !== cableRun.cablePartId || !conductor.routeSegmentIds.includes(conductor.cableRunId) || !conductor.cableCoreId) {
          issues.push(issue("error", "ROUTE_BROKEN", "validation.routeBroken", conductor.id, harness.id));
        }
        const cablePart = project.parts.find((part) => part.id === cableRun?.cablePartId && part.category === "cable");
        const cableConductorIds = new Set(cablePart ? getCableConductors(cablePart).map((item) => item.id) : []);
        if (conductor.cableCoreId && cablePart && !cableConductorIds.has(conductor.cableCoreId)) {
          issues.push(issue("error", "CABLE_CORE_INVALID", "validation.cableCoreInvalid", conductor.id, harness.id));
        }
        const duplicateCore = harness.conductors.some((item) => item.id < conductor.id && item.cableRunId === conductor.cableRunId && item.cableCoreId === conductor.cableCoreId);
        if (duplicateCore) issues.push(issue("error", "CABLE_CORE_DUPLICATE", "validation.cableCoreDuplicate", conductor.id, harness.id));
      }
    }
  }
  return rules ? issues.flatMap((item) => {
    const level = rules[item.code as ValidationCode];
    return level === "off" ? [] : [{ ...item, severity: level ?? item.severity }];
  }) : issues;
}

function parsePartIds(value?: string): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch { return []; }
}

function wireRangeIncludes(range: string, gauge: string): boolean {
  const rangeAwg = /AWG/i.test(range);
  const gaugeAwg = /AWG/i.test(gauge);
  const values = range.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const gaugeValue = Number(gauge.match(/\d+(?:\.\d+)?/)?.[0]);
  if (rangeAwg && gaugeAwg && values.length && Number.isFinite(gaugeValue)) {
    return gaugeValue >= Math.min(...values) && gaugeValue <= Math.max(...values);
  }
  const normalized = (value: string) => value.toLowerCase().replace(/\s+/g, "");
  return range.split(/[,;/]/).some((item) => normalized(item) === normalized(gauge));
}

function issue(severity: "error" | "warning", code: string, messageKey: string, entityId?: string, harnessId?: string, discriminator?: string): ValidationIssue {
  return { id: `${code}:${entityId ?? crypto.randomUUID()}${discriminator ? `:${discriminator}` : ""}`, severity, code, messageKey, entityId, harnessId };
}
