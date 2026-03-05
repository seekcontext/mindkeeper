import { watch, type FSWatcher } from "chokidar";
import fsPromises from "node:fs/promises";
import path from "node:path";
import type { Vault } from "./vault.js";

const LOCKFILE_NAME = "watcher.lock";

export interface WatcherOptions {
  vault: Vault;
  debounceMs?: number;
  onSnapshot?: (commit: { oid: string; message: string }) => void;
  onError?: (error: Error) => void;
}

export class VaultWatcher {
  private vault: Vault;
  private debounceMs: number;
  private watcher: FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingChanges = new Set<string>();
  private lockfilePath: string;
  private onSnapshot?: WatcherOptions["onSnapshot"];
  private onError?: WatcherOptions["onError"];

  constructor(options: WatcherOptions) {
    this.vault = options.vault;
    this.debounceMs = options.debounceMs ?? options.vault.getConfig().snapshot.debounceMs;
    this.lockfilePath = path.join(options.vault.gitDir, LOCKFILE_NAME);
    this.onSnapshot = options.onSnapshot;
    this.onError = options.onError;
  }

  async start(): Promise<void> {
    await this.acquireLock();

    const config = this.vault.getConfig();
    const watchPaths = config.tracking.include.map((pattern) =>
      path.join(this.vault.workDir, pattern),
    );

    this.watcher = watch(watchPaths, {
      ignoreInitial: true,
      persistent: true,
      ignored: [
        path.join(this.vault.workDir, ".mindkeeper/**"),
        path.join(this.vault.workDir, ".git/**"),
      ],
    });

    this.watcher.on("change", (filePath) => this.handleChange(filePath));
    this.watcher.on("add", (filePath) => this.handleChange(filePath));
    this.watcher.on("unlink", (filePath) => this.handleChange(filePath));
    this.watcher.on("error", (err) => this.onError?.(err instanceof Error ? err : new Error(String(err))));
  }

  async stop(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.pendingChanges.size > 0) {
      await this.flush();
    }

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    await this.releaseLock();
  }

  private handleChange(filePath: string): void {
    const relative = path.relative(this.vault.workDir, filePath);
    this.pendingChanges.add(relative);

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      void this.flush();
    }, this.debounceMs);
  }

  private async flush(): Promise<void> {
    if (this.pendingChanges.size === 0) return;

    const changes = [...this.pendingChanges];
    this.pendingChanges.clear();
    this.debounceTimer = null;

    try {
      const commit = await this.vault.autoSnapshot();
      if (commit) {
        this.onSnapshot?.({ oid: commit.oid, message: commit.message });
      }
    } catch (err) {
      this.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async acquireLock(): Promise<void> {
    try {
      const content = await fsPromises.readFile(this.lockfilePath, "utf-8");
      const pid = parseInt(content.trim(), 10);
      if (!isNaN(pid) && isProcessRunning(pid)) {
        throw new Error(
          `Another watcher is already running (PID: ${pid}). ` +
            `Stop it first or remove ${this.lockfilePath} if the process is dead.`,
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("Another watcher")) {
        throw err;
      }
    }

    await fsPromises.mkdir(path.dirname(this.lockfilePath), { recursive: true });
    await fsPromises.writeFile(this.lockfilePath, String(process.pid), "utf-8");
  }

  private async releaseLock(): Promise<void> {
    try {
      await fsPromises.unlink(this.lockfilePath);
    } catch {
      // ignore
    }
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
