import type { DiffResult } from "../diff.js";

export interface LlmProvider {
  generateCommitMessage(diff: DiffResult[]): Promise<string>;
}

/**
 * Default LLM commit message generator.
 * In standalone mode, this uses a configured API key.
 * In OpenClaw Plugin mode, the plugin injects its own provider that
 * delegates to OpenClaw's LLM infrastructure.
 */
export async function generateLlmMessage(
  diffs: DiffResult[],
  provider?: LlmProvider,
): Promise<string | null> {
  if (!provider) return null;

  try {
    return await provider.generateCommitMessage(diffs);
  } catch {
    return null;
  }
}
