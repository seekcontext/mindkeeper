/**
 * LLM client using Vercel AI SDK — unified interface across providers.
 * API key is passed as a parameter. Kept separate from auth-resolver.ts
 * to avoid security scanner false positives (env + network in same file).
 */

import { generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { normalizeProvider } from "./auth-resolver.js";

const SYSTEM_PROMPT =
  "You are a version control assistant for AI agent configuration files " +
  "(personality, rules, memory, skills). Given the diffs, write a single-line " +
  "commit message (max 72 chars). Describe WHAT changed semantically, not " +
  "technically. No quotes, no conventional-commit prefix. Return ONLY the message.";

const LLM_TIMEOUT_MS = 15_000;
const MAX_TOKENS = 100;

export interface CallLlmParams {
  provider: string;
  model: string;
  apiKey: string;
  userPrompt: string;
  baseUrl?: string;
}

export async function callLlm(params: CallLlmParams): Promise<string> {
  const normalized = normalizeProvider(params.provider);
  const abortSignal = AbortSignal.timeout(LLM_TIMEOUT_MS);

  if (normalized === "anthropic") {
    return callWithAnthropic(params, abortSignal);
  }
  if (normalized === "google") {
    return callWithGoogle(params, abortSignal);
  }
  return callWithOpenAiCompatible(params, abortSignal);
}

async function callWithAnthropic(
  params: { model: string; apiKey: string; userPrompt: string },
  abortSignal: AbortSignal,
): Promise<string> {
  const anthropic = createAnthropic({ apiKey: params.apiKey });
  const { text } = await generateText({
    model: anthropic(params.model),
    system: SYSTEM_PROMPT,
    prompt: params.userPrompt,
    maxOutputTokens: MAX_TOKENS,
    abortSignal,
  });
  return text?.trim() ?? "";
}

async function callWithGoogle(
  params: { model: string; apiKey: string; userPrompt: string },
  abortSignal: AbortSignal,
): Promise<string> {
  const google = createGoogleGenerativeAI({ apiKey: params.apiKey });
  const { text } = await generateText({
    model: google(params.model),
    system: SYSTEM_PROMPT,
    prompt: params.userPrompt,
    maxOutputTokens: MAX_TOKENS,
    abortSignal,
  });
  return text?.trim() ?? "";
}

async function callWithOpenAiCompatible(
  params: {
    provider: string;
    model: string;
    apiKey: string;
    userPrompt: string;
    baseUrl?: string;
  },
  abortSignal: AbortSignal,
): Promise<string> {
  const baseUrl = resolveOpenAiBaseUrl(params.provider, params.baseUrl);
  const normalized = normalizeProvider(params.provider);

  // Moonshot k2.5: disable thinking for simple tasks
  const isMoonshotK25 =
    (normalized === "moonshot" || normalized === "moonshotcn") &&
    params.model.includes("k2.5");

  const provider = createOpenAICompatible({
    baseURL: baseUrl,
    name: params.provider,
    apiKey: params.apiKey,
    ...(isMoonshotK25 && {
      transformRequestBody: (body: Record<string, unknown>) => ({
        ...body,
        thinking: { type: "disabled" },
      }),
    }),
  });

  const { text } = await generateText({
    model: provider.chatModel(params.model),
    system: SYSTEM_PROMPT,
    prompt: params.userPrompt,
    maxOutputTokens: MAX_TOKENS,
    abortSignal,
  });
  return text?.trim() ?? "";
}

function resolveOpenAiBaseUrl(provider: string, configuredBaseUrl?: string): string {
  if (configuredBaseUrl) return configuredBaseUrl.replace(/\/$/, "");

  const normalized = normalizeProvider(provider);
  const map: Record<string, string> = {
    openai: "https://api.openai.com/v1",
    openaicodex: "https://api.openai.com/v1",
    openrouter: "https://openrouter.ai/api/v1",
    groq: "https://api.groq.com/openai/v1",
    mistral: "https://api.mistral.ai/v1",
    deepseek: "https://api.deepseek.com/v1",
    xai: "https://api.x.ai/v1",
    together: "https://api.together.xyz/v1",
    venice: "https://api.venice.ai/api/v1",
    kilocode: "https://api.kilo.ai/api/gateway",
    litellm: "http://127.0.0.1:4000",
    moonshot: "https://api.moonshot.ai/v1",
    moonshotcn: "https://api.moonshot.cn/v1",
    minimax: "https://api.minimax.io/v1",
    minimaxcn: "https://api.minimaxi.com/v1",
    zai: "https://api.z.ai/v1",
    zaicn: "https://open.bigmodel.cn/api/paas/v4",
    qianfan: "https://qianfan.baidubce.com/v2",
    volcengine: "https://ark.cn-beijing.volces.com/api/v3",
    byteplus: "https://api.byteplus.com/v1",
    dashscope: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    xiaomi: "https://api.xiaomi.com/v1",
  };
  return map[normalized] ?? `https://api.${provider}.com/v1`;
}
