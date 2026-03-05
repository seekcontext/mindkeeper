import fsPromises from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { LlmProvider, DiffResult } from "mindkeeper";

const SYSTEM_PROMPT =
  "You are a version control assistant for AI agent configuration files " +
  "(personality, rules, memory, skills). Given the diffs, write a single-line " +
  "commit message (max 72 chars). Describe WHAT changed semantically, not " +
  "technically. No quotes, no conventional-commit prefix. Return ONLY the message.";

const LLM_TIMEOUT_MS = 15_000;
const MAX_DIFF_CHARS = 4_000;
const MAX_TOKENS = 100;

// --------------------------------------------------------------------------
// Types (subset of OpenClaw's auth-profiles.json schema)
// --------------------------------------------------------------------------

interface AuthProfileStore {
  version: number;
  profiles: Record<string, AuthProfileCredential>;
}

interface AuthProfileCredential {
  type: string;
  provider: string;
  key?: string;
  token?: string;
  keyRef?: { source: string; key?: string; path?: string };
  tokenRef?: { source: string; key?: string; path?: string };
}

interface PluginApi {
  config?: Record<string, unknown>;
  pluginConfig?: Record<string, unknown>;
  log?: {
    info?(...args: unknown[]): void;
    warn?(...args: unknown[]): void;
    error?(...args: unknown[]): void;
  };
}

// --------------------------------------------------------------------------
// Public entry
// --------------------------------------------------------------------------

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

  // OAuth-based providers don't carry an extractable API key
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

// --------------------------------------------------------------------------
// Model resolution
// --------------------------------------------------------------------------

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

  // Read baseUrl from models.providers[provider] if configured by the user
  const providers = (config?.models as Record<string, unknown> | undefined)
    ?.providers as Record<string, unknown> | undefined;
  const providerCfg = providers?.[provider] as Record<string, unknown> | undefined;
  const baseUrl =
    typeof providerCfg?.baseUrl === "string" ? providerCfg.baseUrl.trim() : undefined;

  return { provider, model, baseUrl };
}

// --------------------------------------------------------------------------
// API key resolution (3-tier)
// --------------------------------------------------------------------------

async function resolveApiKey(provider: string): Promise<string | null> {
  // Tier 1 & 2: auth-profiles.json (key field + keyRef env resolution)
  const profileKey = await readAuthProfileKey(provider);
  if (profileKey) return profileKey;

  // Tier 3: environment variables
  return readEnvApiKey(provider);
}

async function readAuthProfileKey(provider: string): Promise<string | null> {
  const candidates = buildAuthProfilePaths();

  for (const filepath of candidates) {
    try {
      const content = await fsPromises.readFile(filepath, "utf-8");
      const store = JSON.parse(content) as AuthProfileStore;
      if (!store.profiles || typeof store.profiles !== "object") continue;

      const normalized = normalizeProvider(provider);

      for (const credential of Object.values(store.profiles)) {
        if (normalizeProvider(credential.provider) !== normalized) continue;

        // Tier 1: plain-text key in file
        if (credential.type === "api_key" && credential.key) {
          return credential.key;
        }
        if (credential.type === "token" && credential.token) {
          return credential.token;
        }

        // Tier 2: keyRef / tokenRef with source=env
        const ref = credential.keyRef ?? credential.tokenRef;
        if (ref?.source === "env" && ref.key) {
          const envVal = process.env[ref.key];
          if (envVal) return envVal;
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}

function buildAuthProfilePaths(): string[] {
  const home = os.homedir();
  const paths: string[] = [];

  const envHome = process.env.OPENCLAW_HOME;
  if (envHome) {
    paths.push(path.join(envHome, "auth-profiles.json"));
  }

  paths.push(
    path.join(home, ".openclaw", "auth-profiles.json"),
    path.join(home, ".config", "openclaw", "auth-profiles.json"),
  );
  return paths;
}

function readEnvApiKey(provider: string): string | null {
  const normalized = normalizeProvider(provider);
  const map: Record<string, string[]> = {
    // International
    anthropic:        ["ANTHROPIC_API_KEY"],
    openai:           ["OPENAI_API_KEY"],
    openaicodex:      ["OPENAI_API_KEY"],
    openrouter:       ["OPENROUTER_API_KEY"],
    google:           ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
    groq:             ["GROQ_API_KEY"],
    mistral:          ["MISTRAL_API_KEY"],
    deepseek:         ["DEEPSEEK_API_KEY"],
    xai:              ["XAI_API_KEY"],
    together:         ["TOGETHER_API_KEY"],
    venice:           ["VENICE_API_KEY"],
    // Chinese providers
    moonshot:         ["MOONSHOT_API_KEY"],            // Kimi (international)
    moonshotcn:       ["MOONSHOT_API_KEY"],            // Kimi (CN endpoint)
    minimax:          ["MINIMAX_API_KEY"],
    minimaxcn:        ["MINIMAX_API_KEY"],
    zai:              ["ZAI_API_KEY", "Z_AI_API_KEY"], // Zhipu ZAI
    qianfan:          ["QIANFAN_API_KEY"],             // Baidu Qianfan
    volcengine:       ["VOLCANO_ENGINE_API_KEY"],      // ByteDance Volcano (Doubao)
    byteplus:         ["BYTEPLUS_API_KEY"],
    dashscope:        ["DASHSCOPE_API_KEY"],           // Alibaba DashScope (Qwen API)
    xiaomi:           ["XIAOMI_API_KEY"],
    kilocode:         ["KILOCODE_API_KEY"],
    litellm:          ["LITELLM_API_KEY"],
  };

  const envKeys =
    map[normalized] ??
    [`${provider.toUpperCase().replace(/-/g, "_")}_API_KEY`];

  for (const envKey of envKeys) {
    const val = process.env[envKey];
    if (val) return val;
  }
  return null;
}

function normalizeProvider(provider: string): string {
  return provider.toLowerCase().replace(/-/g, "").replace(/_/g, "");
}

// --------------------------------------------------------------------------
// LLM HTTP calls
// --------------------------------------------------------------------------

async function callLlm(params: {
  provider: string;
  model: string;
  apiKey: string;
  userPrompt: string;
  baseUrl?: string;
}): Promise<string> {
  const normalized = normalizeProvider(params.provider);

  if (normalized === "anthropic") {
    return callAnthropic(params);
  }
  if (normalized === "google") {
    return callGoogle(params);
  }
  // Default: OpenAI-compatible (covers all Chinese providers)
  return callOpenAiCompatible(params);
}

async function callAnthropic(params: {
  model: string;
  apiKey: string;
  userPrompt: string;
}): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": params.apiKey,
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: params.userPrompt }],
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as { content?: Array<{ text?: string }> };
  return data.content?.[0]?.text?.trim() ?? "";
}

async function callOpenAiCompatible(params: {
  provider: string;
  model: string;
  apiKey: string;
  userPrompt: string;
  baseUrl?: string;
}): Promise<string> {
  const baseUrl = resolveOpenAiBaseUrl(params.provider, params.baseUrl);

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: params.userPrompt },
      ],
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`OpenAI-compatible API ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

async function callGoogle(params: {
  model: string;
  apiKey: string;
  userPrompt: string;
}): Promise<string> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateContent?key=${params.apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ parts: [{ text: params.userPrompt }] }],
      generationConfig: { maxOutputTokens: MAX_TOKENS },
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Google AI API ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}

function resolveOpenAiBaseUrl(provider: string, configuredBaseUrl?: string): string {
  // Highest priority: baseUrl explicitly set in OpenClaw's models.providers config
  if (configuredBaseUrl) return configuredBaseUrl.replace(/\/$/, "");

  const normalized = normalizeProvider(provider);
  const map: Record<string, string> = {
    // International
    openai:           "https://api.openai.com/v1",
    openaicodex:      "https://api.openai.com/v1",
    openrouter:       "https://openrouter.ai/api/v1",
    groq:             "https://api.groq.com/openai/v1",
    mistral:          "https://api.mistral.ai/v1",
    deepseek:         "https://api.deepseek.com/v1",
    xai:              "https://api.x.ai/v1",
    together:         "https://api.together.xyz/v1",
    venice:           "https://api.venice.ai/api/v1",
    kilocode:         "https://api.kilo.ai/api/gateway",
    litellm:          "http://127.0.0.1:4000",        // self-hosted default
    // Chinese providers
    moonshot:         "https://api.moonshot.ai/v1",   // Kimi (international)
    moonshotcn:       "https://api.moonshot.cn/v1",   // Kimi (CN)
    minimax:          "https://api.minimax.io/v1",    // MiniMax (international)
    minimaxcn:        "https://api.minimaxi.com/v1",  // MiniMax (CN)
    zai:              "https://api.z.ai/v1",          // Zhipu ZAI (international)
    zaicn:            "https://open.bigmodel.cn/api/paas/v4", // Zhipu (CN)
    qianfan:          "https://qianfan.baidubce.com/v2",      // Baidu Qianfan
    volcengine:       "https://ark.cn-beijing.volces.com/api/v3", // Volcano (Doubao)
    byteplus:         "https://api.byteplus.com/v1",
    dashscope:        "https://dashscope.aliyuncs.com/compatible-mode/v1", // Alibaba DashScope
    xiaomi:           "https://api.xiaomi.com/v1",
  };
  return map[normalized] ?? `https://api.${provider}.com/v1`;
}
