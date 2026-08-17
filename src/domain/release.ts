import type { HarnessAssembly, HarnessReleaseRecord, ProjectDocument } from "./types";

type ReleaseEntity = "nodes" | "segments" | "conductors" | "accessories";

export interface HarnessReleaseDifference {
  added: Record<ReleaseEntity, number>;
  removed: Record<ReleaseEntity, number>;
  modified: Record<ReleaseEntity, number>;
  total: number;
}

const entities: ReleaseEntity[] = ["nodes", "segments", "conductors", "accessories"];

function comparableHarness(harness: HarnessAssembly) {
  return {
    number: harness.number,
    name: harness.name,
    revision: harness.revision,
    nodes: harness.nodes,
    segments: harness.segments,
    conductors: harness.conductors,
    accessories: harness.accessories,
    drawingNotes: harness.drawingNotes ?? "",
    drawingTableOffsets: harness.drawingTableOffsets ?? {},
    drawingAnnotations: harness.drawingAnnotations ?? [],
  };
}

function content(harness: HarnessAssembly): string {
  return JSON.stringify(comparableHarness(harness));
}

export function harnessFingerprint(harness: HarnessAssembly): string {
  let hash = 0xcbf29ce484222325n;
  for (const character of new TextEncoder().encode(content(harness))) {
    hash ^= BigInt(character);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

export function submitHarnessForReview(project: ProjectDocument, harnessId: string): void {
  const harness = requiredHarness(project, harnessId);
  if ((harness.releaseStatus ?? "draft") !== "draft") throw new Error("작업 중인 하네스만 검토 요청할 수 있습니다.");
  harness.releaseStatus = "inReview";
}

export function returnHarnessToDraft(project: ProjectDocument, harnessId: string): void {
  const harness = requiredHarness(project, harnessId);
  if (harness.releaseStatus !== "inReview") throw new Error("검토 중인 하네스만 작업 상태로 되돌릴 수 있습니다.");
  harness.releaseStatus = "draft";
}

export function releaseHarness(project: ProjectDocument, harnessId: string, releasedBy: string, note: string, releasedAt = new Date().toISOString()): HarnessReleaseRecord {
  const harness = requiredHarness(project, harnessId);
  if (harness.releaseStatus !== "inReview") throw new Error("검토 중인 하네스만 릴리즈할 수 있습니다.");
  if (!releasedBy.trim()) throw new Error("릴리즈 승인자를 입력하세요.");
  if ((project.releaseHistory ?? []).some((record) => record.harnessId === harnessId && record.revision === harness.revision)) {
    throw new Error(`리비전 ${harness.revision}은 이미 릴리즈되었습니다.`);
  }
  harness.releaseStatus = "released";
  const snapshot = structuredClone(harness);
  const record: HarnessReleaseRecord = {
    id: crypto.randomUUID(),
    harnessId,
    revision: harness.revision,
    releasedAt,
    releasedBy: releasedBy.trim(),
    note: note.trim(),
    fingerprint: harnessFingerprint(snapshot),
    snapshot,
  };
  project.releaseHistory = [...(project.releaseHistory ?? []), record];
  return record;
}

export function startHarnessRevision(project: ProjectDocument, harnessId: string, revision: string): void {
  const harness = requiredHarness(project, harnessId);
  const nextRevision = revision.trim();
  if (harness.releaseStatus !== "released") throw new Error("릴리즈된 하네스에서만 다음 리비전을 시작할 수 있습니다.");
  if (!nextRevision || nextRevision === harness.revision) throw new Error("현재와 다른 다음 리비전을 입력하세요.");
  harness.revision = nextRevision;
  harness.releaseStatus = "draft";
}

export function latestHarnessRelease(project: ProjectDocument, harnessId: string): HarnessReleaseRecord | undefined {
  return [...(project.releaseHistory ?? [])].reverse().find((record) => record.harnessId === harnessId);
}

export function compareHarnessToLastRelease(project: ProjectDocument, harnessId: string): HarnessReleaseDifference {
  const harness = requiredHarness(project, harnessId);
  const baseline = latestHarnessRelease(project, harnessId)?.snapshot;
  const difference: HarnessReleaseDifference = {
    added: { nodes: 0, segments: 0, conductors: 0, accessories: 0 },
    removed: { nodes: 0, segments: 0, conductors: 0, accessories: 0 },
    modified: { nodes: 0, segments: 0, conductors: 0, accessories: 0 },
    total: 0,
  };
  if (!baseline) return difference;
  for (const entity of entities) {
    const current = new Map(harness[entity].map((item) => [item.id, JSON.stringify(item)]));
    const released = new Map(baseline[entity].map((item) => [item.id, JSON.stringify(item)]));
    for (const [id, value] of current) {
      if (!released.has(id)) difference.added[entity] += 1;
      else if (released.get(id) !== value) difference.modified[entity] += 1;
    }
    for (const id of released.keys()) if (!current.has(id)) difference.removed[entity] += 1;
  }
  difference.total = entities.reduce((sum, entity) => sum + difference.added[entity] + difference.removed[entity] + difference.modified[entity], 0);
  return difference;
}

export function releasedHarnessEditViolation(before: ProjectDocument, after: ProjectDocument): string | null {
  for (const released of before.harnesses.filter((harness) => harness.releaseStatus === "released")) {
    const next = after.harnesses.find((harness) => harness.id === released.id);
    if (!next) return released.id;
    if (next.releaseStatus === "draft" && next.revision !== released.revision) {
      const expected = { ...comparableHarness(released), revision: next.revision };
      if (JSON.stringify(expected) === content(next)) continue;
    }
    if (next.releaseStatus !== "released" || content(released) !== content(next)) return released.id;
  }
  return null;
}

function requiredHarness(project: ProjectDocument, harnessId: string): HarnessAssembly {
  const harness = project.harnesses.find((item) => item.id === harnessId);
  if (!harness) throw new Error("하네스를 찾을 수 없습니다.");
  return harness;
}
