import fsPromises from "node:fs/promises";
import path from "node:path";
import { minimatch } from "minimatch";
import { IsomorphicGitStore } from "./store/git-store.js";
import type { CommitInfo, FileStatusEntry } from "./store/types.js";
import { loadConfig, getDefaultConfig, type TrackerConfig } from "./config.js";
import { computeDiff, type DiffResult } from "./diff.js";
import { generateTemplateMessage } from "./message/template.js";
import { generateLlmMessage, type LlmProvider } from "./message/llm.js";

const ALWAYS_EXCLUDED = [".mindkeeper/**", ".git/**"];
const GITDIR_NAME = ".mindkeeper";

export interface TrackerOptions {
  workDir: string;
  gitDir?: string;
  config?: TrackerConfig;
  /** Overrides merged on top of loaded config (e.g. from OpenClaw plugin) */
  configOverrides?: Partial<TrackerConfig>;
  llmProvider?: LlmProvider;
}

export interface TrackerStatus {
  initialized: boolean;
  workDir: string;
  gitDir: string;
  trackedFileCount: number;
  pendingChanges: FileStatusEntry[];
  snapshots: Array<{ name: string; oid: string }>;
}

export interface SnapshotOptions {
  message?: string;
  name?: string;
}

export interface HistoryOptions {
  file?: string;
  limit?: number;
  since?: Date;
}

export interface DiffOptions {
  file: string;
  from: string;
  to?: string;
}

export interface RollbackOptions {
  file: string;
  to: string;
}

export class Tracker {
  private store: IsomorphicGitStore;
  private config: TrackerConfig;
  private configLoaded: boolean;
  private llmProvider?: LlmProvider;
  readonly workDir: string;
  readonly gitDir: string;

  private configOverrides?: Partial<TrackerConfig>;

  constructor(options: TrackerOptions) {
    this.workDir = path.resolve(options.workDir);
    this.gitDir = options.gitDir
      ? path.resolve(options.gitDir)
      : path.join(this.workDir, GITDIR_NAME);
    this.config = options.config ?? getDefaultConfig();
    this.configLoaded = options.config !== undefined;
    this.configOverrides = options.configOverrides;
    this.llmProvider = options.llmProvider;

    this.store = new IsomorphicGitStore({
      workDir: this.workDir,
      gitDir: this.gitDir,
    });
  }

  async init(): Promise<{ initialFiles: string[] }> {
    await this.ensureConfigLoaded();
    await this.store.init();
    await this.ensureGitignore();

    const changed = await this.getTrackedChangedFiles();
    if (changed.length > 0) {
      await this.store.addFiles(changed.map((e) => e.filepath));
      const msg = generateTemplateMessage(changed.map((e) => e.filepath));
      await this.store.commit(msg);
    }

    return { initialFiles: changed.map((e) => e.filepath) };
  }

  async snapshot(options?: SnapshotOptions): Promise<CommitInfo> {
    await this.ensureConfigLoaded();
    const changed = await this.getTrackedChangedFiles();
    const filesToCommit = changed.map((e) => e.filepath);

    if (filesToCommit.length > 0) {
      await this.store.addFiles(filesToCommit);
    }

    const message =
      options?.message ??
      generateTemplateMessage(filesToCommit.length > 0 ? filesToCommit : ["(no changes)"]);

    const oid = await this.store.commit(message);

    if (options?.name) {
      await this.store.createTag(options.name, oid);
    }

    return {
      oid,
      message,
      timestamp: Math.floor(Date.now() / 1000),
      date: new Date(),
      author: "mindkeeper",
    };
  }

  async history(options?: HistoryOptions): Promise<CommitInfo[]> {
    const limit = options?.limit ?? 20;
    let commits = await this.store.log({
      filepath: options?.file,
      depth: limit * 3,
    });

    if (options?.since) {
      const sinceTs = Math.floor(options.since.getTime() / 1000);
      commits = commits.filter((c) => c.timestamp >= sinceTs);
    }

    return commits.slice(0, limit);
  }

  async diff(options: DiffOptions): Promise<DiffResult> {
    const to = options.to ?? "HEAD";

    const fromOid = await this.resolveOid(options.from);
    const toOid = await this.resolveOid(to);

    if (!fromOid || !toOid) {
      throw new Error("Could not resolve commit references");
    }

    const oldContent = (await this.store.readFile(options.file, fromOid)) ?? "";
    const newContent = (await this.store.readFile(options.file, toOid)) ?? "";

    return computeDiff({
      file: options.file,
      fromVersion: options.from.slice(0, 8),
      toVersion: to.slice(0, 8),
      oldContent,
      newContent,
    });
  }

  async rollback(options: RollbackOptions): Promise<CommitInfo> {
    const toOid = await this.resolveOid(options.to);
    if (!toOid) {
      throw new Error(`Could not resolve commit: ${options.to}`);
    }
    await this.store.restoreFile(options.file, toOid);
    await this.store.addFiles([options.file]);

    const shortHash = options.to.slice(0, 8);
    const message = generateTemplateMessage([options.file], {
      isRollback: true,
      rollbackTarget: shortHash,
    });

    const oid = await this.store.commit(message);

    return {
      oid,
      message,
      timestamp: Math.floor(Date.now() / 1000),
      date: new Date(),
      author: "mindkeeper",
    };
  }

  async status(): Promise<TrackerStatus> {
    await this.ensureConfigLoaded();
    const initialized = await this.isInitialized();
    const pendingChanges = initialized ? await this.getTrackedChangedFiles() : [];
    const snapshots = initialized ? await this.store.listTags() : [];
    const trackedFileCount = initialized ? await this.getTrackedFileCount() : 0;

    return {
      initialized,
      workDir: this.workDir,
      gitDir: this.gitDir,
      trackedFileCount,
      pendingChanges,
      snapshots,
    };
  }

  async autoSnapshot(): Promise<CommitInfo | null> {
    await this.ensureConfigLoaded();
    const changed = await this.getTrackedChangedFiles();
    if (changed.length === 0) return null;

    const filesToCommit = changed.map((e) => e.filepath);
    await this.store.addFiles(filesToCommit);

    const diffs: DiffResult[] = [];
    let headOid: string | null = null;
    try {
      headOid = await this.resolveHead();
    } catch {
      // no commits yet — skip diff for message generation
    }

    if (headOid) {
      for (const file of filesToCommit) {
        try {
          const oldContent = (await this.store.readFile(file, headOid!)) ?? "";
          let newContent: string;
          try {
            newContent = await fsPromises.readFile(
              path.join(this.workDir, file),
              "utf-8",
            );
          } catch {
            newContent = ""; // file deleted
          }
          const d = computeDiff({
            file,
            fromVersion: headOid.slice(0, 8),
            toVersion: "(staged)",
            oldContent,
            newContent,
          });
          if (d.additions > 0 || d.deletions > 0) {
            diffs.push(d);
          }
        } catch {
          // no previous version — skip diff for message generation
        }
      }
    }

    let message: string | null = null;
    if (this.config.commitMessage.mode === "llm" && diffs.length > 0) {
      message = await generateLlmMessage(diffs, this.llmProvider);
    }
    if (!message) {
      message = generateTemplateMessage(filesToCommit);
    }

    const oid = await this.store.commit(message);

    return {
      oid,
      message,
      timestamp: Math.floor(Date.now() / 1000),
      date: new Date(),
      author: "mindkeeper",
    };
  }

  getConfig(): TrackerConfig {
    return this.config;
  }

  getStore(): IsomorphicGitStore {
    return this.store;
  }

  private async getTrackedChangedFiles(): Promise<FileStatusEntry[]> {
    const allChanged = await this.store.getChangedFiles();
    return allChanged.filter((entry) => this.isTracked(entry.filepath));
  }

  private async getTrackedFileCount(): Promise<number> {
    const files = new Set(await this.store.listWorkdirFiles());
    const headOid = await this.resolveHead().catch(() => null);
    if (headOid) {
      for (const filepath of await this.store.getCommitFiles(headOid)) {
        files.add(filepath);
      }
    }
    return Array.from(files).filter((filepath) => this.isTracked(filepath)).length;
  }

  private isTracked(filepath: string): boolean {
    const allExcluded = [...this.config.tracking.exclude, ...ALWAYS_EXCLUDED];
    for (const pattern of allExcluded) {
      if (minimatch(filepath, pattern)) return false;
    }
    for (const pattern of this.config.tracking.include) {
      if (minimatch(filepath, pattern)) return true;
    }
    return false;
  }

  private async ensureConfigLoaded(): Promise<void> {
    if (this.configLoaded) {
      return;
    }
    this.config = await loadConfig(this.workDir, this.configOverrides);
    this.configLoaded = true;
  }

  private async isInitialized(): Promise<boolean> {
    try {
      await fsPromises.access(path.join(this.gitDir, "HEAD"));
      return true;
    } catch {
      return false;
    }
  }

  private async resolveHead(): Promise<string> {
    const git = await import("isomorphic-git");
    const fs = await import("node:fs");
    return git.default.resolveRef({
      fs: fs.default,
      dir: this.workDir,
      gitdir: this.gitDir,
      ref: "HEAD",
    });
  }

  /**
   * Resolves a ref (HEAD, short hash, or full oid) to a full commit oid.
   * Uses expandOid for short hashes since isomorphic-git readBlob may not support them.
   */
  private async resolveOid(ref: string): Promise<string | null> {
    if (ref === "HEAD") {
      return this.resolveHead();
    }
    const git = await import("isomorphic-git");
    const fs = await import("node:fs");
    try {
      return await git.default.expandOid({
        fs: fs.default,
        dir: this.workDir,
        gitdir: this.gitDir,
        oid: ref,
      });
    } catch {
      return null;
    }
  }

  private async ensureGitignore(): Promise<void> {
    const gitignorePath = path.join(this.workDir, ".gitignore");
    const entry = ".mindkeeper/";

    try {
      const content = await fsPromises.readFile(gitignorePath, "utf-8");
      if (content.includes(entry)) return;
      const newContent = content.endsWith("\n")
        ? `${content}${entry}\n`
        : `${content}\n${entry}\n`;
      await fsPromises.writeFile(gitignorePath, newContent, "utf-8");
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      if (code !== "ENOENT") {
        throw err;
      }
      await fsPromises.writeFile(gitignorePath, `${entry}\n`, "utf-8");
    }
  }
}
