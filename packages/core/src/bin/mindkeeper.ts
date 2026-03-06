#!/usr/bin/env node

import { Command } from "commander";
import path from "node:path";
import { Tracker } from "../tracker.js";
import { Watcher } from "../watcher.js";

const program = new Command();

program
  .name("mindkeeper")
  .description("Time machine for your AI's brain — version control for agent context files")
  .version("0.2.5");

function resolveWorkDir(dir?: string): string {
  return path.resolve(dir ?? process.cwd());
}

async function createTracker(dir?: string): Promise<Tracker> {
  const workDir = resolveWorkDir(dir);
  return new Tracker({ workDir });
}

program
  .command("init")
  .description("Initialize mindkeeper for a directory")
  .option("--dir <dir>", "Directory to track", ".")
  .action(async (opts: { dir: string }) => {
    const tracker = await createTracker(opts.dir);
    const { initialFiles } = await tracker.init();
    console.log(`Initialized mindkeeper in ${tracker.workDir}`);
    console.log(`History data: ${tracker.gitDir}`);

    if (initialFiles.length > 0) {
      console.log(`Initial snapshot created with ${initialFiles.length} tracked files.`);
    }
  });

program
  .command("status")
  .description("Show tracking status and pending changes")
  .option("--dir <dir>", "Workspace directory", ".")
  .action(async (opts: { dir: string }) => {
    const tracker = await createTracker(opts.dir);
    const status = await tracker.status();

    if (!status.initialized) {
      console.log("Not initialized. Run `mindkeeper init` first.");
      return;
    }

    console.log(`Workspace: ${status.workDir}`);
    console.log(`History:   ${status.gitDir}`);
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
    const tracker = await createTracker(opts.dir);
    const commits = await tracker.history({ file, limit: parseInt(opts.limit, 10) });

    if (commits.length === 0) {
      console.log("No history found.");
      return;
    }

    console.log("COMMIT      DATE                  MESSAGE");
    console.log("─".repeat(72));
    for (const c of commits) {
      const short = c.oid.slice(0, 8);
      const date = c.date.toLocaleString("sv-SE", { hour12: false });
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
    const tracker = await createTracker(opts.dir);
    const result = await tracker.diff({ file, from, to });
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
    const tracker = await createTracker(opts.dir);

    if (!opts.yes) {
      const diff = await tracker.diff({ file, from: to, to: "HEAD" });
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

    const commit = await tracker.rollback({ file, to });
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
    const tracker = await createTracker(opts.dir);
    const commit = await tracker.snapshot({
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
    const tracker = await createTracker(opts.dir);
    await tracker.init();

    const watcher = new Watcher({
      tracker,
      onSnapshot: (commit) => {
        const time = new Date().toLocaleString("sv-SE", { hour12: false });
        console.log(`[${time}] Snapshot ${commit.oid.slice(0, 8)}: ${commit.message}`);
      },
      onError: (err) => {
        console.error(`[error] ${err.message}`);
      },
    });

    await watcher.start();
    console.log(`Watching ${tracker.workDir} for changes (debounce: ${tracker.getConfig().snapshot.debounceMs}ms)...`);
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
