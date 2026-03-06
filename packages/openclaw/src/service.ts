import { Tracker, Watcher } from "mindkeeper";
import type { LlmProvider } from "mindkeeper";
import { createOpenClawLlmProvider } from "./llm-provider.js";

interface ServiceContext {
  config?: unknown;
  workspaceDir?: string;
  stateDir?: string;
  logger?: {
    info?(msg: string): void;
    warn?(msg: string): void;
    error?(msg: string): void;
  };
}

interface PluginService {
  id: string;
  start(ctx: ServiceContext): Promise<void>;
  stop?(ctx: ServiceContext): Promise<void>;
}

interface PluginApi {
  pluginConfig?: Record<string, unknown>;
  log?: {
    info?(...args: unknown[]): void;
    warn?(...args: unknown[]): void;
    error?(...args: unknown[]): void;
  };
}

export function createWatcherService(
  api: PluginApi,
  trackerRef: { current: Tracker | null },
): PluginService {
  let watcher: Watcher | null = null;

  const log = {
    info: (msg: string) => api.log?.info?.(msg),
    warn: (msg: string) => api.log?.warn?.(msg),
    error: (msg: string) => api.log?.error?.(msg),
  };

  return {
    id: "mindkeeper-watcher",

    async start(ctx: ServiceContext) {
      const workspaceDir = ctx.workspaceDir ?? process.env.OPENCLAW_WORKSPACE;
      if (!workspaceDir) {
        log.warn("[mindkeeper] No workspace directory in service context. Watcher disabled.");
        return;
      }

      const llmProvider = await createOpenClawLlmProvider({
        config: ctx.config as Record<string, unknown> | undefined,
        log,
      });

      const configOverrides = api.pluginConfig as
        | { commitMessage?: { mode?: "template" | "llm" } }
        | undefined;
      const tracker = new Tracker({
        workDir: workspaceDir,
        llmProvider: llmProvider ?? undefined,
        configOverrides: configOverrides ?? undefined,
      });
      await tracker.init();
      trackerRef.current = tracker;

      watcher = new Watcher({
        tracker,
        onSnapshot: (commit) => {
          log.info(`[mindkeeper] Auto-snapshot ${commit.oid.slice(0, 8)}: ${commit.message}`);
        },
        onError: (err) => {
          log.error(`[mindkeeper] Watcher error: ${err.message}`);
        },
      });

      await watcher.start();
      log.info(
        `[mindkeeper] Watching ${workspaceDir} (debounce: ${tracker.getConfig().snapshot.debounceMs}ms)`,
      );
    },

    async stop() {
      if (watcher) {
        await watcher.stop();
        watcher = null;
        log.info("[mindkeeper] Watcher stopped.");
      }
      trackerRef.current = null;
    },
  };
}
