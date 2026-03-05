import { Vault, VaultWatcher } from "mindkeeper";

interface PluginService {
  name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
}

interface PluginApi {
  log?: {
    info?(...args: unknown[]): void;
    warn?(...args: unknown[]): void;
    error?(...args: unknown[]): void;
  };
}

export function createWatcherService(vault: Vault, api: PluginApi): PluginService {
  let watcher: VaultWatcher | null = null;

  return {
    name: "mindkeeper-watcher",

    async start() {
      await vault.init();

      watcher = new VaultWatcher({
        vault,
        onSnapshot: (commit) => {
          api.log?.info?.(
            `[mindkeeper] Auto-snapshot ${commit.oid.slice(0, 8)}: ${commit.message}`,
          );
        },
        onError: (err) => {
          api.log?.error?.(`[mindkeeper] Watcher error: ${err.message}`);
        },
      });

      await watcher.start();
      api.log?.info?.(
        `[mindkeeper] Watching ${vault.workDir} (debounce: ${vault.getConfig().snapshot.debounceMs}ms)`,
      );
    },

    async stop() {
      if (watcher) {
        await watcher.stop();
        watcher = null;
        api.log?.info?.("[mindkeeper] Watcher stopped.");
      }
    },
  };
}
