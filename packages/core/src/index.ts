export { Vault, type VaultOptions, type VaultStatus, type SnapshotOptions, type HistoryOptions, type DiffOptions, type RollbackOptions } from "./vault.js";
export { VaultWatcher, type WatcherOptions } from "./watcher.js";
export { loadConfig, getDefaultConfig, getGlobalConfigPath, getWorkspaceConfigPath, SensitiveFieldError, type VaultConfig, type TrackingConfig, type CommitMessageConfig } from "./config.js";
export { computeDiff, type DiffResult, type DiffHunk, type DiffLine } from "./diff.js";
export { generateTemplateMessage } from "./message/template.js";
export { generateLlmMessage, type LlmProvider } from "./message/llm.js";
export type { CommitInfo, FileStatusEntry, FileVersion } from "./store/types.js";
