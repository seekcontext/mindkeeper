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
  log?: { warn?: (msg: string) => void },
): Promise<string | null> {
  if (!provider) return null;

  try {
    return await provider.generateCommitMessage(diffs);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : String(err);
    log?.warn?.(`[mindkeeper] LLM commit message error: ${msg}`);
    return null;
  }
}
