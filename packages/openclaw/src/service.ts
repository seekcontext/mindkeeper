import { Tracker, Watcher } from "mindkeeper";
import type { TrackerConfig } from "mindkeeper";
import { createOpenClawLlmProvider } from "./llm-provider.js";
import { ensureWorkspaceSkillMirror } from "./skill-mirror.js";

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
  pluginConfig?: Partial<TrackerConfig>;
  logger?: {
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
    info: (msg: string) => api.logger?.info?.(msg),
    warn: (msg: string) => api.logger?.warn?.(msg),
    error: (msg: string) => api.logger?.error?.(msg),
  };

  return {
    id: "mindkeeper-watcher",

    async start(ctx: ServiceContext) {
      const workspaceDir = ctx.workspaceDir ?? process.env.OPENCLAW_WORKSPACE;
      if (!workspaceDir) {
        log.warn("[mindkeeper] No workspace directory in service context. Watcher disabled.");
        return;
      }

      ensureWorkspaceSkillMirror(workspaceDir, { log: api.logger });

      log.info(
        `[mindkeeper] Service starting: ctx.config=${ctx.config ? "present" : "missing"}, ` +
        `pluginConfig=${api.pluginConfig ? JSON.stringify(api.pluginConfig) : "none"}`,
      );

      const llmProvider = await createOpenClawLlmProvider({
        config: ctx.config as Record<string, unknown> | undefined,
        log,
      });

      log.info(
        `[mindkeeper] LLM provider: ${llmProvider ? "created successfully" : "null (will use template)"}`,
      );

      const tracker = new Tracker({
        workDir: workspaceDir,
        llmProvider: llmProvider ?? undefined,
        configOverrides: api.pluginConfig,
        log,
      });
      await tracker.init();
      trackerRef.current = tracker;

      log.info(
        `[mindkeeper] Tracker config: commitMessage.mode=${tracker.getConfig().commitMessage.mode}`,
      );

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
