import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Vault } from "../src/vault.js";

let tempDir: string;
let vault: Vault;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mindkeeper-test-"));
  vault = new Vault({ workDir: tempDir });
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

async function writeFile(name: string, content: string) {
  await fs.writeFile(path.join(tempDir, name), content, "utf-8");
}

async function readFile(name: string): Promise<string> {
  return fs.readFile(path.join(tempDir, name), "utf-8");
}

describe("Vault.init", () => {
  it("creates .mindkeeper directory and .gitignore", async () => {
    await writeFile("AGENTS.md", "# Agent rules");
    await vault.init();

    const gitDir = path.join(tempDir, ".mindkeeper");
    const stat = await fs.stat(gitDir);
    expect(stat.isDirectory()).toBe(true);

    const gitignore = await readFile(".gitignore");
    expect(gitignore).toContain(".mindkeeper/");
  });

  it("creates initial snapshot of existing files", async () => {
    await writeFile("AGENTS.md", "# Agent rules");
    await writeFile("SOUL.md", "# Personality");
    await vault.init();

    const commits = await vault.history();
    expect(commits.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Vault.snapshot", () => {
  it("creates a commit with the given message", async () => {
    await writeFile("AGENTS.md", "# Rules v1");
    await vault.init();

    await writeFile("AGENTS.md", "# Rules v2");
    const commit = await vault.snapshot({ message: "Update rules" });

    expect(commit.oid).toBeTruthy();
    expect(commit.message).toBe("Update rules");
  });

  it("creates a named tag when name is provided", async () => {
    await writeFile("AGENTS.md", "# Rules");
    await vault.init();

    const commit = await vault.snapshot({ name: "checkpoint-1", message: "First checkpoint" });
    const status = await vault.status();

    expect(status.snapshots.some((s) => s.name === "checkpoint-1")).toBe(true);
  });
});

describe("Vault.history", () => {
  it("returns commits in reverse chronological order", async () => {
    await writeFile("SOUL.md", "v1");
    await vault.init();

    await writeFile("SOUL.md", "v2");
    await vault.snapshot({ message: "Second version" });

    await writeFile("SOUL.md", "v3");
    await vault.snapshot({ message: "Third version" });

    const commits = await vault.history();
    expect(commits.length).toBeGreaterThanOrEqual(3);
    expect(commits[0].message).toBe("Third version");
  });

  it("filters by file when specified", async () => {
    await writeFile("SOUL.md", "soul v1");
    await writeFile("AGENTS.md", "agents v1");
    await vault.init();

    await writeFile("SOUL.md", "soul v2");
    await vault.snapshot({ message: "Update soul" });

    await writeFile("AGENTS.md", "agents v2");
    await vault.snapshot({ message: "Update agents" });

    const soulHistory = await vault.history({ file: "SOUL.md" });
    const soulMessages = soulHistory.map((c) => c.message);
    expect(soulMessages).toContain("Update soul");
    expect(soulMessages).not.toContain("Update agents");
  });
});

describe("Vault.diff", () => {
  it("shows additions and deletions between versions", async () => {
    await writeFile("SOUL.md", "Be formal.\n");
    await vault.init();
    const commits1 = await vault.history();

    await writeFile("SOUL.md", "Be friendly.\nUse humor.\n");
    await vault.snapshot({ message: "Change tone" });
    const commits2 = await vault.history();

    const result = await vault.diff({
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

describe("Vault.rollback", () => {
  it("restores file content and creates a rollback commit", async () => {
    await writeFile("SOUL.md", "Original content");
    await vault.init();
    const initial = (await vault.history())[0];

    await writeFile("SOUL.md", "Modified content");
    await vault.snapshot({ message: "Modify soul" });

    const rollbackCommit = await vault.rollback({
      file: "SOUL.md",
      to: initial.oid,
    });

    const content = await readFile("SOUL.md");
    expect(content).toBe("Original content");
    expect(rollbackCommit.message).toContain("[rollback]");
    expect(rollbackCommit.message).toContain("SOUL.md");
  });
});

describe("Vault.status", () => {
  it("reports pending changes", async () => {
    await writeFile("AGENTS.md", "initial");
    await vault.init();

    await writeFile("AGENTS.md", "changed");
    const status = await vault.status();

    expect(status.initialized).toBe(true);
    expect(status.pendingChanges.length).toBeGreaterThan(0);
    expect(status.pendingChanges[0].filepath).toBe("AGENTS.md");
  });
});
