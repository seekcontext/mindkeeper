import { Vault, VaultWatcher } from "mindkeeper";
import { registerVaultTools } from "./tools.js";
import { registerVaultCli } from "./cli.js";
import { createWatcherService } from "./service.js";
import { createOpenClawLlmProvider } from "./llm-provider.js";

/**
 * OpenClaw Plugin entry point.
 * Called by OpenClaw's plugin loader with the Plugin API.
 */
export default async function mindkeeperPlugin(api: OpenClawPluginApi) {
  const workspaceDir = api.getWorkspaceDir?.() ?? process.env.OPENCLAW_WORKSPACE;
  if (!workspaceDir) {
    api.log?.warn?.("[mindkeeper] No workspace directory found. Plugin disabled.");
    return;
  }

  const llmProvider = await createOpenClawLlmProvider({
    config: api.config as Record<string, unknown> | undefined,
    pluginConfig: api.pluginConfig,
    log: api.log,
  });

  const vault = new Vault({
    workDir: workspaceDir,
    llmProvider: llmProvider ?? undefined,
  });

  registerVaultTools(api, vault);
  registerVaultCli(api, vault);

  const watcherService = createWatcherService(vault, api);
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
  registerTool?(tool: PluginTool, opts?: Record<string, unknown>): void;
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
  description: string;
  parameters: Record<string, unknown>;
  handler(args: Record<string, unknown>): Promise<unknown>;
}

interface PluginService {
  name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
}
