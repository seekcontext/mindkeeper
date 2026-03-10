import { watch, type FSWatcher } from "chokidar";
import fsPromises from "node:fs/promises";
import path from "node:path";
import type { Tracker } from "./tracker.js";

const LOCKFILE_NAME = "watcher.lock";

export interface WatcherOptions {
  tracker: Tracker;
  debounceMs?: number;
  onSnapshot?: (commit: { oid: string; message: string }) => void;
  onError?: (error: Error) => void;
  /** Called once chokidar has finished its initial scan and is ready to receive events. */
  onReady?: () => void;
}

export class Watcher {
  private tracker: Tracker;
  private debounceMs: number;
  private watcher: FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingChanges = new Set<string>();
  private lockfilePath: string;
  private onSnapshot?: WatcherOptions["onSnapshot"];
  private onError?: WatcherOptions["onError"];
  private onReady?: WatcherOptions["onReady"];

  constructor(options: WatcherOptions) {
    this.tracker = options.tracker;
    this.debounceMs = options.debounceMs ?? options.tracker.getConfig().snapshot.debounceMs;
    this.lockfilePath = path.join(options.tracker.gitDir, LOCKFILE_NAME);
    this.onSnapshot = options.onSnapshot;
    this.onError = options.onError;
    this.onReady = options.onReady;
  }

  async start(): Promise<void> {
    await this.acquireLock();

    // Watch the whole workDir directory and filter events through isTracked()
    // rather than passing individual glob patterns to chokidar. Chokidar's
    // "add" event is unreliable for newly-created files when watching glob
    // paths directly; watching the directory root avoids this limitation.
    this.watcher = watch(this.tracker.workDir, {
      ignoreInitial: true,
      persistent: true,
      ignored: [
        path.join(this.tracker.workDir, ".mindkeeper/**"),
        path.join(this.tracker.workDir, ".git/**"),
      ],
    });

    this.watcher.on("change", (filePath) => this.handleChange(filePath));
    this.watcher.on("add", (filePath) => this.handleChange(filePath));
    this.watcher.on("unlink", (filePath) => this.handleChange(filePath));
    this.watcher.on("error", (err) => this.onError?.(err instanceof Error ? err : new Error(String(err))));
    this.watcher.on("ready", () => this.onReady?.());

    // Wait for the initial scan to complete so callers know the watcher is
    // fully active before they write any files.
    await new Promise<void>((resolve) => {
      this.watcher!.once("ready", resolve);
    });
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
    const relative = path.relative(this.tracker.workDir, filePath);
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

    this.pendingChanges.clear();
    this.debounceTimer = null;

    try {
      const commit = await this.tracker.autoSnapshot();
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
      if (!isNaN(pid)) {
        // Same PID = stale lock from previous in-process restart (e.g. Gateway SIGUSR1)
        if (pid === process.pid) {
          // Reclaim: remove stale lock and proceed
        } else if (isProcessRunning(pid)) {
          throw new Error(
            `Another watcher is already running (PID: ${pid}). ` +
              `Stop it first or remove ${this.lockfilePath} if the process is dead.`,
          );
        }
        // If pid != process.pid and process is dead, fall through to write our lock
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("Another watcher")) {
        throw err;
      }
      // ENOENT or other read error: no lock file, proceed
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
