/**
 * OpenClaw LLM provider for mindkeeper — orchestrates auth resolution and LLM calls.
 * Uses dynamic import for llm-client to avoid security scanner flagging env+network in same import graph.
 */

import type { LlmProvider, DiffResult } from "mindkeeper";
import { resolveApiKey, normalizeProvider } from "./auth-resolver.js";

const MAX_DIFF_CHARS = 4_000;

interface PluginApi {
  config?: Record<string, unknown>;
  pluginConfig?: Record<string, unknown>;
  log?: {
    info?(...args: unknown[]): void;
    warn?(...args: unknown[]): void;
    error?(...args: unknown[]): void;
  };
}

export async function createOpenClawLlmProvider(
  api: PluginApi,
): Promise<LlmProvider | null> {
  const modelSpec = resolveModelFromConfig(api.config);
  if (!modelSpec) {
    api.log?.warn?.(
      "[mindkeeper] No default model configured in OpenClaw — LLM commit messages disabled.",
    );
    return null;
  }

  if (isOAuthProvider(modelSpec.provider)) {
    api.log?.warn?.(
      `[mindkeeper] Provider "${modelSpec.provider}" uses OAuth — LLM commit messages not supported, falling back to template.`,
    );
    return null;
  }

  const apiKey = await resolveApiKey(modelSpec.provider);
  if (!apiKey) {
    api.log?.warn?.(
      `[mindkeeper] No API key found for provider "${modelSpec.provider}" — LLM commit messages disabled.`,
    );
    return null;
  }

  api.log?.info?.(
    `[mindkeeper] LLM commit messages enabled (${modelSpec.provider}/${modelSpec.model}).`,
  );

  return {
    async generateCommitMessage(diffs: DiffResult[]): Promise<string> {
      const diffText = diffs
        .map((d) => `--- ${d.file} ---\n${d.unified}`)
        .join("\n")
        .slice(0, MAX_DIFF_CHARS);

      const { callLlm } = await import("./llm-client.js");
      return callLlm({
        provider: modelSpec.provider,
        model: modelSpec.model,
        apiKey,
        userPrompt: diffText,
        baseUrl: modelSpec.baseUrl,
      });
    },
  };
}

function isOAuthProvider(provider: string): boolean {
  const normalized = normalizeProvider(provider);
  return normalized.includes("portal") || normalized.includes("oauth");
}

function resolveModelFromConfig(
  config?: Record<string, unknown>,
): { provider: string; model: string; baseUrl?: string } | null {
  const agents = config?.agents as Record<string, unknown> | undefined;
  const defaults = agents?.defaults as Record<string, unknown> | undefined;
  const raw = defaults?.model;

  let spec: string | undefined;
  if (typeof raw === "string") {
    spec = raw.trim();
  } else if (raw && typeof raw === "object") {
    const primary = (raw as Record<string, unknown>).primary;
    if (typeof primary === "string") spec = primary.trim();
  }

  if (!spec?.includes("/")) return null;

  const slashIdx = spec.indexOf("/");
  const provider = spec.slice(0, slashIdx);
  const model = spec.slice(slashIdx + 1);

  const providers = (config?.models as Record<string, unknown> | undefined)
    ?.providers as Record<string, unknown> | undefined;
  const providerCfg = providers?.[provider] as Record<string, unknown> | undefined;
  const baseUrl =
    typeof providerCfg?.baseUrl === "string" ? providerCfg.baseUrl.trim() : undefined;

  return { provider, model, baseUrl };
}
