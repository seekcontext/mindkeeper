/**
 * Watcher integration tests.
 *
 * Strategy:
 * - Real temp directory, real chokidar, real isomorphic-git — no mocks needed.
 * - Watcher.start() now awaits chokidar's "ready" event before resolving, so
 *   files written immediately after start() are guaranteed to be observed.
 * - Watcher watches the workDir root (not per-pattern globs) so "add" events
 *   fire reliably for newly-created files on macOS.
 * - Small debounceMs (100ms) + promise-based onSnapshot keep tests fast.
 *
 * Covered cases:
 *   1. File in include list (MEMORY.md) not present at init → auto-committed after creation.
 *   2. Glob-pattern file (memory/2026-03-10.md) not present at init → auto-committed.
 *   3. File present at init but never committed → committed on next write.
 *   4. Multiple rapid writes debounced into a single commit.
 *   5. stop() flushes pending changes before closing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Tracker } from "../src/tracker.js";
import { Watcher } from "../src/watcher.js";

const DEBOUNCE_MS = 100;

let tempDir: string;
let tracker: Tracker;
let watcher: Watcher | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function writeFile(relativePath: string, content: string): Promise<void> {
  const fullPath = path.join(tempDir, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, "utf-8");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Create a promise + resolver pair for awaiting the first onSnapshot call. */
function makeSnapshotWaiter(): {
  promise: Promise<{ oid: string; message: string }>;
  resolve: (v: { oid: string; message: string }) => void;
} {
  let resolve!: (v: { oid: string; message: string }) => void;
  const promise = new Promise<{ oid: string; message: string }>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mindkeeper-watcher-it-"));
  tracker = new Tracker({
    workDir: tempDir,
    configOverrides: {
      snapshot: { debounceMs: DEBOUNCE_MS },
      commitMessage: { mode: "template" },
    },
  });
  await tracker.init();
});

afterEach(async () => {
  if (watcher) {
    await watcher.stop();
    watcher = null;
  }
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Watcher integration: files created after init", () => {
  it("case 1 — MEMORY.md created after init triggers an auto-commit", async () => {
    const { promise, resolve } = makeSnapshotWaiter();
    watcher = new Watcher({ tracker, debounceMs: DEBOUNCE_MS, onSnapshot: resolve });

    // start() awaits chokidar "ready" — safe to write files immediately after
    await watcher.start();

    await writeFile("MEMORY.md", "# Memory\nFirst entry.");

    const commit = await promise;
    expect(commit.message).toContain("MEMORY.md");

    const history = await tracker.history({ file: "MEMORY.md" });
    expect(history.length).toBeGreaterThanOrEqual(1);

    const status = await tracker.status();
    expect(status.pendingChanges).toHaveLength(0);
  }, 15_000);

  it("case 2 — memory/2026-03-10.md created after init triggers an auto-commit", async () => {
    const { promise, resolve } = makeSnapshotWaiter();
    watcher = new Watcher({ tracker, debounceMs: DEBOUNCE_MS, onSnapshot: resolve });
    await watcher.start();

    await writeFile("memory/2026-03-10.md", "# Daily notes\n- Resolved issue #42");

    const commit = await promise;
    expect(commit.message).toContain("memory/2026-03-10.md");

    const history = await tracker.history({ file: "memory/2026-03-10.md" });
    expect(history.length).toBeGreaterThanOrEqual(1);
  }, 15_000);

  it("case 3 — file present at init but never committed is committed on next write", async () => {
    // Write MEMORY.md before starting the watcher (simulates a file created
    // between sessions while no watcher was running).
    await writeFile("MEMORY.md", "# Memory v1");

    const statusBefore = await tracker.status();
    expect(statusBefore.pendingChanges).toContainEqual({
      filepath: "MEMORY.md",
      status: "added",
    });

    const { promise, resolve } = makeSnapshotWaiter();
    watcher = new Watcher({ tracker, debounceMs: DEBOUNCE_MS, onSnapshot: resolve });
    await watcher.start();

    // Another write triggers the watcher; autoSnapshot picks up the pending
    // 'added' state alongside the new change.
    await writeFile("MEMORY.md", "# Memory v1\n- New entry");

    await promise;

    const statusAfter = await tracker.status();
    expect(statusAfter.pendingChanges).toHaveLength(0);

    const history = await tracker.history({ file: "MEMORY.md" });
    expect(history.length).toBeGreaterThanOrEqual(1);
  }, 15_000);

  it("multiple rapid writes are debounced into a single commit", async () => {
    const snapshots: Array<{ oid: string; message: string }> = [];
    const autoSnapshotSpy = vi.spyOn(tracker, "autoSnapshot");
    const { promise, resolve } = makeSnapshotWaiter();

    watcher = new Watcher({
      tracker,
      debounceMs: DEBOUNCE_MS,
      onSnapshot: (c) => {
        snapshots.push(c);
        resolve(c);
      },
    });
    await watcher.start();

    // Three rapid writes — all within the 100ms debounce window
    await writeFile("SOUL.md", "v1");
    await writeFile("SOUL.md", "v2");
    await writeFile("SOUL.md", "v3");

    await promise;

    // Despite three writes, autoSnapshot should have been called exactly once
    expect(autoSnapshotSpy).toHaveBeenCalledOnce();
    expect(snapshots).toHaveLength(1);

    const content = await fs.readFile(path.join(tempDir, "SOUL.md"), "utf-8");
    expect(content).toBe("v3");
  }, 15_000);

  it("stop() flushes pending changes before closing", async () => {
    const snapshots: Array<{ oid: string; message: string }> = [];
    const autoSnapshotSpy = vi.spyOn(tracker, "autoSnapshot");

    watcher = new Watcher({
      tracker,
      debounceMs: DEBOUNCE_MS,
      onSnapshot: (c) => snapshots.push(c),
    });
    await watcher.start();

    // Write a file and stop before the 100ms debounce fires naturally.
    await writeFile("AGENTS.md", "# Rules v1");

    // Give chokidar just enough time to detect the event and queue the pending
    // change (but less than the 100ms debounce).
    await sleep(40);

    await watcher.stop();
    watcher = null; // prevent afterEach double-stop

    // stop() must have flushed the pending change synchronously
    expect(autoSnapshotSpy).toHaveBeenCalledOnce();
    expect(snapshots).toHaveLength(1);
  }, 15_000);
});
