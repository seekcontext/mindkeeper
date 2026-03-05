import { describe, it, expect } from "vitest";
import { computeDiff } from "../src/diff.js";

describe("computeDiff", () => {
  it("detects added lines", () => {
    const result = computeDiff({
      file: "SOUL.md",
      fromVersion: "abc123",
      toVersion: "def456",
      oldContent: "Line 1\n",
      newContent: "Line 1\nLine 2\n",
    });

    expect(result.additions).toBe(1);
    expect(result.deletions).toBe(0);
    expect(result.unified).toContain("+Line 2");
  });

  it("detects removed lines", () => {
    const result = computeDiff({
      file: "SOUL.md",
      fromVersion: "abc123",
      toVersion: "def456",
      oldContent: "Line 1\nLine 2\n",
      newContent: "Line 1\n",
    });

    expect(result.additions).toBe(0);
    expect(result.deletions).toBe(1);
    expect(result.unified).toContain("-Line 2");
  });

  it("detects modified lines", () => {
    const result = computeDiff({
      file: "SOUL.md",
      fromVersion: "abc123",
      toVersion: "def456",
      oldContent: "Be formal.\n",
      newContent: "Be friendly.\n",
    });

    expect(result.additions).toBe(1);
    expect(result.deletions).toBe(1);
    expect(result.unified).toContain("-Be formal.");
    expect(result.unified).toContain("+Be friendly.");
  });

  it("returns empty hunks for identical content", () => {
    const result = computeDiff({
      file: "SOUL.md",
      fromVersion: "abc123",
      toVersion: "def456",
      oldContent: "Same content\n",
      newContent: "Same content\n",
    });

    expect(result.additions).toBe(0);
    expect(result.deletions).toBe(0);
    expect(result.hunks).toHaveLength(0);
  });

  it("produces structured hunks with line numbers", () => {
    const result = computeDiff({
      file: "AGENTS.md",
      fromVersion: "v1",
      toVersion: "v2",
      oldContent: "Line A\nLine B\nLine C\n",
      newContent: "Line A\nLine B modified\nLine C\nLine D\n",
    });

    expect(result.hunks.length).toBeGreaterThan(0);
    const hunk = result.hunks[0];
    expect(hunk.lines.some((l) => l.type === "removed")).toBe(true);
    expect(hunk.lines.some((l) => l.type === "added")).toBe(true);
  });
});
