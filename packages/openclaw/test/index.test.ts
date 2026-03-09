import { afterEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  registerTrackerTools: vi.fn(),
  registerTrackerCli: vi.fn(),
  createWatcherService: vi.fn(() => ({ id: "mindkeeper-watcher" })),
  ensureWorkspaceSkillMirror: vi.fn(),
}));

vi.mock("../src/tools.js", () => ({
  registerTrackerTools: mocked.registerTrackerTools,
}));

vi.mock("../src/cli.js", () => ({
  registerTrackerCli: mocked.registerTrackerCli,
}));

vi.mock("../src/service.js", () => ({
  createWatcherService: mocked.createWatcherService,
}));

vi.mock("../src/skill-mirror.js", () => ({
  ensureWorkspaceSkillMirror: mocked.ensureWorkspaceSkillMirror,
}));

import mindkeeperPlugin from "../src/index.js";

afterEach(() => {
  mocked.registerTrackerTools.mockClear();
  mocked.registerTrackerCli.mockClear();
  mocked.createWatcherService.mockClear();
  mocked.ensureWorkspaceSkillMirror.mockClear();
});

describe("mindkeeperPlugin", () => {
  it("registers tools, CLI, and watcher service", () => {
    const registerService = vi.fn();
    const info = vi.fn();
    const getWorkspaceDir = vi.fn(() => "/tmp/openclaw-workspace");

    mindkeeperPlugin({
      getWorkspaceDir,
      registerService,
      logger: { info },
    });

    expect(mocked.registerTrackerTools).toHaveBeenCalledOnce();
    expect(mocked.registerTrackerCli).toHaveBeenCalledOnce();
    expect(mocked.createWatcherService).toHaveBeenCalledOnce();
    expect(mocked.registerTrackerTools.mock.calls[0]?.[1]).toBe(
      mocked.registerTrackerCli.mock.calls[0]?.[1],
    );
    expect(mocked.ensureWorkspaceSkillMirror).toHaveBeenCalledWith("/tmp/openclaw-workspace", {
      log: { info },
    });
    expect(registerService).toHaveBeenCalledOnce();
    expect(registerService.mock.calls[0]?.[0]?.id).toBe("mindkeeper-watcher");
    expect(info).toHaveBeenCalledWith("[mindkeeper] Plugin loaded.");
  });

  it("merges missing tools into tools.allow without duplicates", async () => {
    const writeConfigFile = vi.fn().mockResolvedValue(undefined);

    mindkeeperPlugin({
      config: {
        tools: {
          allow: ["mind_status", "custom_tool"],
        },
      },
      runtime: {
        config: { writeConfigFile },
      },
    } as unknown as Parameters<typeof mindkeeperPlugin>[0]);

    await Promise.resolve();

    expect(writeConfigFile).toHaveBeenCalledOnce();
    expect(writeConfigFile).toHaveBeenCalledWith({
      tools: {
        allow: ["mind_status", "custom_tool", "mind_history", "mind_diff", "mind_rollback", "mind_snapshot"],
      },
    });
  });

  it("preserves an explicitly empty tools.allow list", async () => {
    const writeConfigFile = vi.fn().mockResolvedValue(undefined);

    mindkeeperPlugin({
      config: {
        tools: {
          allow: [],
          alsoAllow: ["existing_tool"],
        },
      },
      runtime: {
        config: { writeConfigFile },
      },
    } as unknown as Parameters<typeof mindkeeperPlugin>[0]);

    await Promise.resolve();

    expect(writeConfigFile).toHaveBeenCalledOnce();
    expect(writeConfigFile).toHaveBeenCalledWith({
      tools: {
        allow: ["mind_status", "mind_history", "mind_diff", "mind_rollback", "mind_snapshot"],
        alsoAllow: ["existing_tool"],
      },
    });
  });

  it("warns when config auto-update fails", async () => {
    const warn = vi.fn();
    const writeConfigFile = vi.fn().mockRejectedValue(new Error("boom"));

    mindkeeperPlugin({
      config: {
        tools: {
          alsoAllow: [],
        },
      },
      runtime: {
        config: { writeConfigFile },
      },
      logger: { warn },
    } as unknown as Parameters<typeof mindkeeperPlugin>[0]);

    await Promise.resolve();
    await Promise.resolve();

    expect(warn).toHaveBeenCalledWith(
      "[mindkeeper] Failed to auto-update tools.alsoAllow:",
      "Error: boom",
    );
  });
});
