import type { Tracker } from "mindkeeper";
import { registerTrackerTools } from "./tools.js";
import { registerTrackerCli } from "./cli.js";
import { createWatcherService } from "./service.js";
import { ensureWorkspaceSkillMirror } from "./skill-mirror.js";

const MINDKEEPER_TOOLS = [
  "mind_status",
  "mind_history",
  "mind_diff",
  "mind_rollback",
  "mind_snapshot",
];

/**
 * OpenClaw Plugin entry point.
 * MUST be a synchronous function — OpenClaw discards async register return values.
 * All async work (LLM provider init, workspace dir, tracker init) is deferred to service.start().
 */
export default function mindkeeperPlugin(api: OpenClawPluginApi) {
  // Lazy tracker ref — populated by the watcher service on start
  const trackerRef: { current: Tracker | null } = { current: null };

  registerTrackerTools(api, trackerRef);
  registerTrackerCli(api, trackerRef);

  // Some OpenClaw flows look for skills inside the workspace instead of the
  // installed extension directory. Mirror the built-in skill so `/new` sessions
  // can still find the mindkeeper bootstrap instructions.
  ensureWorkspaceSkillMirror(api.getWorkspaceDir?.(), { log: api.logger });

  const watcherService = createWatcherService(api, trackerRef);
  api.registerService?.(watcherService);

  // Auto-add tools to config on first load (no separate setup command needed)
  ensureToolsInConfig(api);

  api.logger?.info?.("[mindkeeper] Plugin loaded.");
}

function ensureToolsInConfig(api: OpenClawPluginApi): void {
  const cfg = api.config as { tools?: { allow?: string[]; alsoAllow?: string[] } } | undefined;
  const writeConfigFile = (api as { runtime?: { config?: { writeConfigFile?: (c: unknown) => Promise<void> } } })
    .runtime?.config?.writeConfigFile;
  if (!cfg || !writeConfigFile) return;

  const allow = cfg.tools?.allow ?? [];
  const alsoAllow = cfg.tools?.alsoAllow ?? [];
  const hasAllow = Array.isArray(cfg.tools?.allow);
  const target = hasAllow ? allow : alsoAllow;
  const key = hasAllow ? "allow" : "alsoAllow";

  const existing = new Set(
    target.map((e) => String(e).trim().toLowerCase()).filter(Boolean),
  );
  const needed = MINDKEEPER_TOOLS.filter((t) => !existing.has(t));
  if (needed.length === 0) return;

  for (const t of needed) existing.add(t);
  const merged = Array.from(existing);
  void writeConfigFile({
    ...cfg,
    tools: { ...cfg.tools, [key]: merged },
  }).catch((err) => api.logger?.warn?.(`[mindkeeper] Failed to auto-update tools.${key}:`, String(err)));
}

/**
 * Minimal type definition for OpenClaw Plugin API.
 * Only the methods mindkeeper uses are declared here.
 * In a real build, this would import from openclaw/plugin-sdk.
 */
interface OpenClawPluginApi {
  config?: unknown;
  pluginConfig?: Record<string, unknown>;
  getWorkspaceDir?(): string;
  registerTool?(tool: PluginTool): void;
  registerCli?(registrar: (ctx: unknown) => void, opts?: { commands?: string[] }): void;
  registerService?(service: PluginService): void;
  registerHook?(events: string[], handler: (...args: unknown[]) => void): void;
  logger?: {
    info?(...args: unknown[]): void;
    warn?(...args: unknown[]): void;
    error?(...args: unknown[]): void;
  };
}

interface PluginTool {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute(toolCallId: string, params: Record<string, unknown>): Promise<unknown>;
}

interface PluginService {
  id: string;
  start(ctx?: unknown): Promise<void>;
  stop?(ctx?: unknown): Promise<void>;
}
