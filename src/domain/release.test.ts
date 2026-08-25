import { describe, expect, it } from "vitest";
import { createSampleProject } from "../test/sampleProject";
import {
  compareHarnessToLastRelease,
  releaseHarness,
  releasedHarnessEditViolation,
  startHarnessRevision,
  submitHarnessForReview,
} from "./release";

describe("하네스 릴리즈", () => {
  it("검토, 릴리즈, 변경 비교와 다음 리비전 전환을 보존한다", () => {
    const project = createSampleProject();
    const harness = project.harnesses[0];

    submitHarnessForReview(project, harness.id);
    expect(harness.releaseStatus).toBe("inReview");

    const record = releaseHarness(project, harness.id, "QA", "초도 승인", "2026-08-17T00:00:00.000Z");
    expect(harness.releaseStatus).toBe("released");
    expect(project.releaseHistory).toEqual([record]);
    expect(compareHarnessToLastRelease(project, harness.id).total).toBe(0);

    harness.nodes[0].label = "변경된 커넥터";
    const difference = compareHarnessToLastRelease(project, harness.id);
    expect(difference.modified.nodes).toBe(1);
    expect(difference.total).toBe(1);

    startHarnessRevision(project, harness.id, "B");
    expect(harness.releaseStatus).toBe("draft");
    expect(harness.revision).toBe("B");
  });

  it("릴리즈 상태의 설계 변경은 차단하고 다음 리비전 전환은 허용한다", () => {
    const before = createSampleProject();
    submitHarnessForReview(before, before.harnesses[0].id);
    releaseHarness(before, before.harnesses[0].id, "QA", "", "2026-08-17T00:00:00.000Z");

    const edited = structuredClone(before);
    edited.harnesses[0].name = "수정됨";
    expect(releasedHarnessEditViolation(before, edited)).toBe(before.harnesses[0].id);

    const noteEdited = structuredClone(before);
    noteEdited.harnesses[0].drawingNotes = "릴리즈 후 변경";
    expect(releasedHarnessEditViolation(before, noteEdited)).toBe(before.harnesses[0].id);

    const tableMoved = structuredClone(before);
    tableMoved.harnesses[0].drawingTableOffsets = { notes: { x: 20, y: 10 } };
    expect(releasedHarnessEditViolation(before, tableMoved)).toBe(before.harnesses[0].id);

    const annotationAdded = structuredClone(before);
    annotationAdded.harnesses[0].drawingAnnotations = [{ id: "a1", kind: "label", text: "검사", position: { x: 10, y: 10 }, width: 120, height: 32 }];
    expect(releasedHarnessEditViolation(before, annotationAdded)).toBe(before.harnesses[0].id);

    const nextRevision = structuredClone(before);
    startHarnessRevision(nextRevision, nextRevision.harnesses[0].id, "B");
    expect(releasedHarnessEditViolation(before, nextRevision)).toBeNull();
  });
});
