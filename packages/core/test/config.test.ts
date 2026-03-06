import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { loadConfig, SensitiveFieldError } from "../src/config.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mindkeeper-config-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("loadConfig", () => {
  it("returns default config when no config files exist", async () => {
    const config = await loadConfig(tempDir);

    expect(config.tracking.include).toContain("AGENTS.md");
    expect(config.tracking.include).toContain("SOUL.md");
    expect(config.snapshot.debounceMs).toBe(30_000);
    expect(config.commitMessage.mode).toBe("llm");
  });

  it("merges workspace config with defaults", async () => {
    await fs.writeFile(
      path.join(tempDir, ".mindkeeper.json"),
      JSON.stringify({
        snapshot: { debounceMs: 30000 },
        commitMessage: { mode: "llm" },
      }),
      "utf-8",
    );

    const config = await loadConfig(tempDir);

    expect(config.snapshot.debounceMs).toBe(30000);
    expect(config.commitMessage.mode).toBe("llm");
    expect(config.tracking.include).toContain("AGENTS.md");
  });

  it("merges overrides on top of loaded config", async () => {
    const config = await loadConfig(tempDir, {
      commitMessage: { mode: "llm" },
    });

    expect(config.commitMessage.mode).toBe("llm");
    expect(config.tracking.include).toContain("AGENTS.md");
  });

  it("rejects sensitive fields in workspace config", async () => {
    await fs.writeFile(
      path.join(tempDir, ".mindkeeper.json"),
      JSON.stringify({
        commitMessage: {
          mode: "llm",
          llm: { apiKey: "sk-secret" },
        },
      }),
      "utf-8",
    );

    await expect(loadConfig(tempDir)).rejects.toThrow(SensitiveFieldError);
  });
});
