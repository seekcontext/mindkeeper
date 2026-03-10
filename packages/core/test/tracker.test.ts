import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Tracker } from "../src/tracker.js";

let tempDir: string;
let tracker: Tracker;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mindkeeper-test-"));
  tracker = new Tracker({ workDir: tempDir });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(tempDir, { recursive: true, force: true });
});

async function writeFile(name: string, content: string) {
  await fs.writeFile(path.join(tempDir, name), content, "utf-8");
}

async function readFile(name: string): Promise<string> {
  return fs.readFile(path.join(tempDir, name), "utf-8");
}

describe("Tracker.init", () => {
  it("marks an empty workspace as initialized", async () => {
    await tracker.init();

    const status = await tracker.status();
    expect(status.initialized).toBe(true);
  });

  it("creates .mindkeeper directory and .gitignore", async () => {
    await writeFile("AGENTS.md", "# Agent rules");
    await tracker.init();

    const gitDir = path.join(tempDir, ".mindkeeper");
    const stat = await fs.stat(gitDir);
    expect(stat.isDirectory()).toBe(true);

    const gitignore = await readFile(".gitignore");
    expect(gitignore).toContain(".mindkeeper/");
  });

  it("creates initial snapshot of existing files", async () => {
    await writeFile("AGENTS.md", "# Agent rules");
    await writeFile("SOUL.md", "# Personality");
    await tracker.init();

    const commits = await tracker.history();
    expect(commits.length).toBeGreaterThanOrEqual(1);
  });

  it("preserves existing gitignore content when appending mindkeeper entry", async () => {
    await writeFile("AGENTS.md", "# Agent rules");
    await writeFile(".gitignore", "node_modules/\n");

    await tracker.init();

    const gitignore = await readFile(".gitignore");
    expect(gitignore).toContain("node_modules/");
    expect(gitignore).toContain(".mindkeeper/");
  });

  it("does not overwrite gitignore when reading it fails", async () => {
    await writeFile("AGENTS.md", "# Agent rules");
    await writeFile(".gitignore", "node_modules/\n");

    const originalReadFile = fs.readFile.bind(fs);
    vi.spyOn(fs, "readFile").mockImplementation(async (filePath, ...args) => {
      if (String(filePath) === path.join(tempDir, ".gitignore")) {
        const error = new Error("Permission denied") as NodeJS.ErrnoException;
        error.code = "EACCES";
        throw error;
      }
      return originalReadFile(filePath as Parameters<typeof fs.readFile>[0], ...args);
    });

    await expect(tracker.init()).rejects.toThrow("Permission denied");
    expect(await originalReadFile(path.join(tempDir, ".gitignore"), "utf-8")).toBe("node_modules/\n");
  });
});

describe("Tracker.snapshot", () => {
  it("creates a commit with the given message", async () => {
    await writeFile("AGENTS.md", "# Rules v1");
    await tracker.init();

    await writeFile("AGENTS.md", "# Rules v2");
    const commit = await tracker.snapshot({ message: "Update rules" });

    expect(commit.oid).toBeTruthy();
    expect(commit.message).toBe("Update rules");
  });

  it("creates a named tag when name is provided", async () => {
    await writeFile("AGENTS.md", "# Rules");
    await tracker.init();

    await tracker.snapshot({ name: "checkpoint-1", message: "First checkpoint" });
    const status = await tracker.status();

    expect(status.snapshots.some((s) => s.name === "checkpoint-1")).toBe(true);
  });
});

describe("Tracker.history", () => {
  it("returns commits in reverse chronological order", async () => {
    await writeFile("SOUL.md", "v1");
    await tracker.init();

    await writeFile("SOUL.md", "v2");
    await tracker.snapshot({ message: "Second version" });

    await writeFile("SOUL.md", "v3");
    await tracker.snapshot({ message: "Third version" });

    const commits = await tracker.history();
    expect(commits.length).toBeGreaterThanOrEqual(3);
    expect(commits[0].message).toBe("Third version");
  });

  it("filters by file when specified", async () => {
    await writeFile("SOUL.md", "soul v1");
    await writeFile("AGENTS.md", "agents v1");
    await tracker.init();

    await writeFile("SOUL.md", "soul v2");
    await tracker.snapshot({ message: "Update soul" });

    await writeFile("AGENTS.md", "agents v2");
    await tracker.snapshot({ message: "Update agents" });

    const soulHistory = await tracker.history({ file: "SOUL.md" });
    const soulMessages = soulHistory.map((c) => c.message);
    expect(soulMessages).toContain("Update soul");
    expect(soulMessages).not.toContain("Update agents");
  });
});

describe("Tracker.diff", () => {
  it("shows additions and deletions between versions", async () => {
    await writeFile("SOUL.md", "Be formal.\n");
    await tracker.init();
    const commits1 = await tracker.history();

    await writeFile("SOUL.md", "Be friendly.\nUse humor.\n");
    await tracker.snapshot({ message: "Change tone" });
    const commits2 = await tracker.history();

    const result = await tracker.diff({
      file: "SOUL.md",
      from: commits1[0].oid,
      to: commits2[0].oid,
    });

    expect(result.additions).toBeGreaterThan(0);
    expect(result.deletions).toBeGreaterThan(0);
    expect(result.unified).toContain("-Be formal.");
    expect(result.unified).toContain("+Be friendly.");
  });
});

describe("Tracker.rollback", () => {
  it("restores file content and creates a rollback commit", async () => {
    await writeFile("SOUL.md", "Original content");
    await tracker.init();
    const initial = (await tracker.history())[0];

    await writeFile("SOUL.md", "Modified content");
    await tracker.snapshot({ message: "Modify soul" });

    const rollbackCommit = await tracker.rollback({
      file: "SOUL.md",
      to: initial.oid,
    });

    const content = await readFile("SOUL.md");
    expect(content).toBe("Original content");
    expect(rollbackCommit.message).toContain("[rollback]");
    expect(rollbackCommit.message).toContain("SOUL.md");
  });
});

describe("Tracker.status", () => {
  it("counts tracked files in a clean workspace", async () => {
    await writeFile("AGENTS.md", "initial");
    await tracker.init();

    const status = await tracker.status();
    expect(status.trackedFileCount).toBe(1);
  });

  it("reports pending changes", async () => {
    await writeFile("AGENTS.md", "initial");
    await tracker.init();

    await writeFile("AGENTS.md", "changed");
    const status = await tracker.status();

    expect(status.initialized).toBe(true);
    expect(status.pendingChanges.length).toBeGreaterThan(0);
    expect(status.pendingChanges[0].filepath).toBe("AGENTS.md");
  });

  it("reports deleted tracked files as pending changes", async () => {
    await writeFile("AGENTS.md", "initial");
    await tracker.init();

    await fs.unlink(path.join(tempDir, "AGENTS.md"));
    const status = await tracker.status();

    expect(status.pendingChanges).toContainEqual({
      filepath: "AGENTS.md",
      status: "deleted",
    });
  });

  it("loads workspace config for a fresh tracker instance", async () => {
    await writeFile(
      ".mindkeeper.json",
      JSON.stringify({
        tracking: { include: ["CUSTOM.md"], exclude: [] },
        snapshot: { debounceMs: 1000 },
        commitMessage: { mode: "template" },
      }),
    );
    await writeFile("CUSTOM.md", "v1");

    await tracker.init();
    await writeFile("CUSTOM.md", "v2");

    const freshTracker = new Tracker({ workDir: tempDir });
    const status = await freshTracker.status();

    expect(status.pendingChanges).toContainEqual({
      filepath: "CUSTOM.md",
      status: "modified",
    });
  });
});

describe("Tracker deletion snapshots", () => {
  it("records deletions in a snapshot commit", async () => {
    await writeFile("AGENTS.md", "initial");
    await tracker.init();

    await fs.unlink(path.join(tempDir, "AGENTS.md"));
    await tracker.snapshot({ message: "Delete agents" });

    const history = await tracker.history();
    expect(history[0]?.message).toBe("Delete agents");

    const status = await tracker.status();
    expect(status.pendingChanges).toHaveLength(0);
  });
});

describe("Tracker: files created after init are auto-committed", () => {
  it("case 1 — file in include list not present at init, later created, appears as added and is auto-committed", async () => {
    // MEMORY.md is in the default include list but does NOT exist at init time
    await tracker.init();

    // Verify: no history for MEMORY.md yet
    const historyBefore = await tracker.history({ file: "MEMORY.md" });
    expect(historyBefore).toHaveLength(0);

    // Simulate: agent creates the file after init
    await writeFile("MEMORY.md", "# Memory\nFirst entry.");

    // status() should report it as pending 'added'
    const statusPending = await tracker.status();
    expect(statusPending.pendingChanges).toContainEqual({
      filepath: "MEMORY.md",
      status: "added",
    });

    // Watcher calls autoSnapshot() when it detects the 'add' fs event.
    // Call autoSnapshot() directly here — Watcher integration is tested separately.
    const commit = await tracker.autoSnapshot();

    expect(commit).not.toBeNull();
    expect(commit!.message).toContain("MEMORY.md");

    // File now has commit history
    const historyAfter = await tracker.history({ file: "MEMORY.md" });
    expect(historyAfter.length).toBeGreaterThanOrEqual(1);

    // No more pending changes
    const status = await tracker.status();
    expect(status.pendingChanges).toHaveLength(0);
  });

  it("case 2 — glob-pattern files (memory/**/*.md) created after init are auto-committed", async () => {
    // memory/ directory and daily notes don't exist at init time
    await tracker.init();

    // Simulate: agent creates the memory/ directory and a daily note
    await fs.mkdir(path.join(tempDir, "memory"), { recursive: true });
    await writeFile("memory/2026-03-10.md", "# Daily notes\n- Resolved issue #42");

    // Verify pending as 'added'
    const statusPending = await tracker.status();
    expect(statusPending.pendingChanges).toContainEqual({
      filepath: "memory/2026-03-10.md",
      status: "added",
    });

    const commit = await tracker.autoSnapshot();

    expect(commit).not.toBeNull();
    expect(commit!.message).toContain("memory/2026-03-10.md");

    const history = await tracker.history({ file: "memory/2026-03-10.md" });
    expect(history.length).toBeGreaterThanOrEqual(1);

    const status = await tracker.status();
    expect(status.pendingChanges).toHaveLength(0);
  });

  it("case 3 — file present at init but never committed is picked up on next modification", async () => {
    // First init with no tracked files → repo initialized but no initial commit content
    await tracker.init();

    // Create MEMORY.md without triggering watcher (simulates file written
    // between sessions while watcher was not running)
    await writeFile("MEMORY.md", "# Memory v1");

    // status() should report it as pending 'added'
    const statusBefore = await tracker.status();
    expect(statusBefore.pendingChanges).toContainEqual({
      filepath: "MEMORY.md",
      status: "added",
    });

    // Next write triggers autoSnapshot (via watcher in real usage)
    await writeFile("MEMORY.md", "# Memory v1\n- New entry");
    const commit = await tracker.autoSnapshot();

    expect(commit).not.toBeNull();

    // File is now clean
    const statusAfter = await tracker.status();
    expect(statusAfter.pendingChanges).toHaveLength(0);

    // And has version history
    const history = await tracker.history({ file: "MEMORY.md" });
    expect(history.length).toBeGreaterThanOrEqual(1);
  });
});
