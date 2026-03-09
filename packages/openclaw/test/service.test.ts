import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  trackerInstances: [] as Array<{
    options: Record<string, unknown>;
    init: ReturnType<typeof vi.fn>;
    getConfig: ReturnType<typeof vi.fn>;
  }>,
  watcherInstances: [] as Array<{
    options: Record<string, unknown>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  }>,
  createOpenClawLlmProvider: vi.fn(),
}));

vi.mock("mindkeeper", () => {
  class Tracker {
    options: Record<string, unknown>;
    init = vi.fn().mockResolvedValue(undefined);
    getConfig = vi.fn(() => ({ snapshot: { debounceMs: 30_000 }, commitMessage: { mode: "llm" } }));

    constructor(options: Record<string, unknown>) {
      this.options = options;
      mocked.trackerInstances.push(this);
    }
  }

  class Watcher {
    options: Record<string, unknown>;
    start = vi.fn().mockResolvedValue(undefined);
    stop = vi.fn().mockResolvedValue(undefined);

    constructor(options: Record<string, unknown>) {
      this.options = options;
      mocked.watcherInstances.push(this);
    }
  }

  return { Tracker, Watcher };
});

vi.mock("../src/llm-provider.js", () => ({
  createOpenClawLlmProvider: mocked.createOpenClawLlmProvider,
}));

import { createWatcherService } from "../src/service.js";

beforeEach(() => {
  mocked.trackerInstances.length = 0;
  mocked.watcherInstances.length = 0;
  mocked.createOpenClawLlmProvider.mockReset();
  mocked.createOpenClawLlmProvider.mockResolvedValue({
    generateCommitMessage: vi.fn(),
  });
  delete process.env.OPENCLAW_WORKSPACE;
});

describe("createWatcherService", () => {
  it("warns and skips startup when no workspace is available", async () => {
    const warn = vi.fn();
    const trackerRef = { current: null };
    const service = createWatcherService({ logger: { warn } }, trackerRef);

    await service.start({} as never);

    expect(warn).toHaveBeenCalledWith(
      "[mindkeeper] No workspace directory in service context. Watcher disabled.",
    );
    expect(mocked.trackerInstances).toHaveLength(0);
    expect(mocked.watcherInstances).toHaveLength(0);
    expect(trackerRef.current).toBeNull();
  });

  it("initializes tracker and watcher, then stops cleanly", async () => {
    const info = vi.fn();
    const error = vi.fn();
    const pluginConfig = {
      tracking: { include: ["CUSTOM.md"], exclude: ["ignore/**"] },
      snapshot: { debounceMs: 5000 },
      commitMessage: { mode: "template" as const },
    };
    const trackerRef = { current: null };
    const service = createWatcherService(
      { pluginConfig, logger: { info, error } },
      trackerRef,
    );

    await service.start({
      workspaceDir: "/tmp/workspace",
      config: { agents: { defaults: { model: "openai/gpt-4.1" } } },
    });

    expect(mocked.createOpenClawLlmProvider).toHaveBeenCalledOnce();
    expect(mocked.trackerInstances).toHaveLength(1);
    expect(mocked.trackerInstances[0]?.options).toMatchObject({
      workDir: "/tmp/workspace",
      configOverrides: pluginConfig,
    });
    expect(mocked.trackerInstances[0]?.init).toHaveBeenCalledOnce();

    expect(mocked.watcherInstances).toHaveLength(1);
    expect(mocked.watcherInstances[0]?.start).toHaveBeenCalledOnce();
    expect(trackerRef.current).toBe(mocked.trackerInstances[0]);
    expect(info).toHaveBeenCalledWith("[mindkeeper] Watching /tmp/workspace (debounce: 30000ms)");

    const watcher = mocked.watcherInstances[0];
    expect(watcher).toBeDefined();
    if (!watcher) {
      throw new Error("Expected watcher instance");
    }

    (watcher.options.onSnapshot as (commit: { oid: string; message: string }) => void)({
      oid: "1234567890abcdef",
      message: "Auto update",
    });
    expect(info).toHaveBeenCalledWith("[mindkeeper] Auto-snapshot 12345678: Auto update");

    (watcher.options.onError as (err: Error) => void)(new Error("watch failed"));
    expect(error).toHaveBeenCalledWith("[mindkeeper] Watcher error: watch failed");

    await service.stop({} as never);

    expect(watcher.stop).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith("[mindkeeper] Watcher stopped.");
    expect(trackerRef.current).toBeNull();
  });
});
