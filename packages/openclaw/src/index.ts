import type { Tracker } from "mindkeeper";
import { registerTrackerTools } from "./tools.js";
import { registerTrackerCli } from "./cli.js";
import { createWatcherService } from "./service.js";

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

  const watcherService = createWatcherService(api, trackerRef);
  api.registerService?.(watcherService);

  api.log?.info?.("[mindkeeper] Plugin loaded.");
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
  registerCli?(registrar: (program: unknown) => void): void;
  registerService?(service: PluginService): void;
  registerHook?(events: string[], handler: (...args: unknown[]) => void): void;
  log?: {
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
