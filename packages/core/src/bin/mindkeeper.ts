#!/usr/bin/env node

import { Command } from "commander";
import path from "node:path";
import { Vault } from "../vault.js";
import { VaultWatcher } from "../watcher.js";

const program = new Command();

program
  .name("mindkeeper")
  .description("Time machine for your AI's brain — version control for agent context files")
  .version("0.1.0");

function resolveWorkDir(dir?: string): string {
  return path.resolve(dir ?? process.cwd());
}

async function createVault(dir?: string): Promise<Vault> {
  const workDir = resolveWorkDir(dir);
  const vault = new Vault({ workDir });
  return vault;
}

program
  .command("init")
  .description("Initialize a vault for a directory")
  .argument("[dir]", "Directory to track", ".")
  .action(async (dir: string) => {
    const vault = await createVault(dir);
    await vault.init();
    console.log(`Initialized mindkeeper in ${vault.workDir}`);
    console.log(`Git data: ${vault.gitDir}`);

    const status = await vault.status();
    if (status.pendingChanges.length > 0) {
      console.log(`Initial snapshot created with ${status.pendingChanges.length} tracked files.`);
    }
  });

program
  .command("status")
  .description("Show tracking status and pending changes")
  .argument("[dir]", "Workspace directory", ".")
  .action(async (dir: string) => {
    const vault = await createVault(dir);
    const status = await vault.status();

    if (!status.initialized) {
      console.log("Vault not initialized. Run `mindkeeper init` first.");
      return;
    }

    console.log(`Workspace: ${status.workDir}`);
    console.log(`Git data:  ${status.gitDir}`);
    console.log();

    if (status.pendingChanges.length === 0) {
      console.log("No pending changes.");
    } else {
      console.log("Pending changes:");
      for (const entry of status.pendingChanges) {
        const symbol =
          entry.status === "added" ? "+" : entry.status === "deleted" ? "-" : "~";
        console.log(`  ${symbol} ${entry.filepath}`);
      }
    }

    if (status.snapshots.length > 0) {
      console.log();
      console.log("Named snapshots:");
      for (const snap of status.snapshots) {
        console.log(`  * ${snap.name} (${snap.oid.slice(0, 8)})`);
      }
    }
  });

program
  .command("history")
  .description("View change history")
  .argument("[file]", "Filter history for a specific file")
  .option("-n, --limit <count>", "Number of entries to show", "20")
  .option("--dir <dir>", "Workspace directory", ".")
  .action(async (file: string | undefined, opts: { limit: string; dir: string }) => {
    const vault = await createVault(opts.dir);
    const commits = await vault.history({ file, limit: parseInt(opts.limit, 10) });

    if (commits.length === 0) {
      console.log("No history found.");
      return;
    }

    console.log("COMMIT      DATE                  MESSAGE");
    console.log("─".repeat(72));
    for (const c of commits) {
      const short = c.oid.slice(0, 8);
      const date = c.date.toISOString().replace("T", " ").slice(0, 19);
      console.log(`${short}    ${date}   ${c.message}`);
    }
  });

program
  .command("diff")
  .description("Compare two versions of a file")
  .argument("<file>", "File to compare")
  .argument("<from>", "Source commit hash")
  .argument("[to]", "Target commit hash (defaults to HEAD)")
  .option("--dir <dir>", "Workspace directory", ".")
  .action(async (file: string, from: string, to: string | undefined, opts: { dir: string }) => {
    const vault = await createVault(opts.dir);
    const result = await vault.diff({ file, from, to });
    console.log(result.unified);
  });

program
  .command("rollback")
  .description("Rollback a file to a previous version")
  .argument("<file>", "File to rollback")
  .argument("<to>", "Commit hash to rollback to")
  .option("--dir <dir>", "Workspace directory", ".")
  .option("-y, --yes", "Skip confirmation prompt")
  .action(async (file: string, to: string, opts: { dir: string; yes?: boolean }) => {
    const vault = await createVault(opts.dir);

    if (!opts.yes) {
      const diff = await vault.diff({ file, from: to, to: "HEAD" });
      console.log("Changes that will be reverted:");
      console.log(diff.unified);
      console.log();
      console.log(`Additions: +${diff.additions}, Deletions: -${diff.deletions}`);
      console.log();

      const readline = await import("node:readline");
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>((resolve) => {
        rl.question("Confirm rollback? (y/N) ", resolve);
      });
      rl.close();

      if (answer.toLowerCase() !== "y") {
        console.log("Rollback cancelled.");
        return;
      }
    }

    const commit = await vault.rollback({ file, to });
    console.log(`Rolled back ${file} to ${to.slice(0, 8)}.`);
    console.log(`Recorded as commit ${commit.oid.slice(0, 8)}: ${commit.message}`);
  });

program
  .command("snapshot")
  .description("Create a named snapshot")
  .argument("[name]", "Snapshot name")
  .option("-m, --message <msg>", "Snapshot message")
  .option("--dir <dir>", "Workspace directory", ".")
  .action(async (name: string | undefined, opts: { message?: string; dir: string }) => {
    const vault = await createVault(opts.dir);
    const commit = await vault.snapshot({
      name,
      message: opts.message,
    });

    console.log(`Snapshot created: ${commit.oid.slice(0, 8)}`);
    if (name) {
      console.log(`Tagged as: ${name}`);
    }
    console.log(`Message: ${commit.message}`);
  });

program
  .command("watch")
  .description("Start file watcher daemon")
  .option("--dir <dir>", "Workspace directory", ".")
  .action(async (opts: { dir: string }) => {
    const vault = await createVault(opts.dir);
    await vault.init();

    const watcher = new VaultWatcher({
      vault,
      onSnapshot: (commit) => {
        const time = new Date().toISOString().replace("T", " ").slice(0, 19);
        console.log(`[${time}] Snapshot ${commit.oid.slice(0, 8)}: ${commit.message}`);
      },
      onError: (err) => {
        console.error(`[error] ${err.message}`);
      },
    });

    await watcher.start();
    console.log(`Watching ${vault.workDir} for changes (debounce: ${vault.getConfig().snapshot.debounceMs}ms)...`);
    console.log("Press Ctrl+C to stop.");

    const shutdown = async () => {
      console.log("\nStopping watcher...");
      await watcher.stop();
      process.exit(0);
    };

    process.on("SIGINT", () => void shutdown());
    process.on("SIGTERM", () => void shutdown());
  });

program.parse();
