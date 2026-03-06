import fsPromises from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export interface TrackingConfig {
  include: string[];
  exclude: string[];
}

export interface SnapshotConfig {
  debounceMs: number;
}

export interface LlmConfig {
  apiKey?: string;
  model?: string;
}

export interface CommitMessageConfig {
  mode: "template" | "llm";
  llm?: LlmConfig;
}

export interface TrackerConfig {
  tracking: TrackingConfig;
  snapshot: SnapshotConfig;
  commitMessage: CommitMessageConfig;
}

const SENSITIVE_FIELDS = ["commitMessage.llm.apiKey"] as const;

const DEFAULT_CONFIG: TrackerConfig = {
  tracking: {
    include: [
      "AGENTS.md",
      "SOUL.md",
      "USER.md",
      "IDENTITY.md",
      "TOOLS.md",
      "HEARTBEAT.md",
      "MEMORY.md",
      "memory/**/*.md",
      "skills/**/*.md",
    ],
    exclude: ["BOOTSTRAP.md", "canvas/**"],
  },
  snapshot: {
    debounceMs: 30_000,
  },
  commitMessage: {
    mode: "llm",
  },
};

export class SensitiveFieldError extends Error {
  constructor(field: string, configPath: string) {
    super(
      `"${field}" is not allowed in workspace config (${configPath}). ` +
        `Move it to global config (~/.config/mindkeeper/config.json). ` +
        `Workspace config is tracked and may be shared.`,
    );
    this.name = "SensitiveFieldError";
  }
}

function getNested(obj: Record<string, unknown>, dotPath: string): unknown {
  const parts = dotPath.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function validateNoSensitiveFields(
  config: Record<string, unknown>,
  configPath: string,
): void {
  for (const field of SENSITIVE_FIELDS) {
    const value = getNested(config, field);
    if (value !== undefined && value !== null) {
      throw new SensitiveFieldError(field, configPath);
    }
  }
}

async function readJsonFile(filepath: string): Promise<Record<string, unknown> | null> {
  try {
    const content = await fsPromises.readFile(filepath, "utf-8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = target[key];
    if (
      sourceVal != null &&
      typeof sourceVal === "object" &&
      !Array.isArray(sourceVal) &&
      targetVal != null &&
      typeof targetVal === "object" &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
    } else {
      result[key] = sourceVal;
    }
  }
  return result;
}

export function getGlobalConfigPath(): string {
  return path.join(os.homedir(), ".config", "mindkeeper", "config.json");
}

export function getWorkspaceConfigPath(workDir: string): string {
  return path.join(workDir, ".mindkeeper.json");
}

export async function loadConfig(
  workDir: string,
  overrides?: Partial<TrackerConfig>,
): Promise<TrackerConfig> {
  let merged: Record<string, unknown> = structuredClone(
    DEFAULT_CONFIG as unknown as Record<string, unknown>,
  );

  const globalPath = getGlobalConfigPath();
  const globalConfig = await readJsonFile(globalPath);
  if (globalConfig) {
    merged = deepMerge(merged, globalConfig);
  }

  const workspacePath = getWorkspaceConfigPath(workDir);
  const workspaceConfig = await readJsonFile(workspacePath);
  if (workspaceConfig) {
    validateNoSensitiveFields(workspaceConfig, workspacePath);
    merged = deepMerge(merged, workspaceConfig);
  }

  if (overrides && Object.keys(overrides).length > 0) {
    merged = deepMerge(merged, overrides as unknown as Record<string, unknown>);
  }

  return merged as unknown as TrackerConfig;
}

export function getDefaultConfig(): TrackerConfig {
  return structuredClone(DEFAULT_CONFIG);
}
