import type { Tracker } from "mindkeeper";

function getTracker(ref: { current: Tracker | null }): Tracker {
  if (!ref.current) {
    throw new Error("mindkeeper: tracker not ready — workspace not initialized yet.");
  }
  return ref.current;
}

interface CliContext {
  program: CommandBuilder;
}

interface CommandBuilder {
  command(name: string): CommandBuilder;
  description(desc: string): CommandBuilder;
  action(fn: (...args: unknown[]) => Promise<void>): CommandBuilder;
}

export function registerTrackerCli(
  api: { registerCli?(registrar: (ctx: CliContext) => void, opts?: { commands?: string[] }): void },
  trackerRef: { current: Tracker | null },
): void {
  if (!api.registerCli) return;

  api.registerCli(
    (ctx: CliContext) => {
      const mindCmd = ctx.program.command("mind").description("mindkeeper version control");

      mindCmd
        .command("status")
        .description("Show tracking status")
        .action(async () => {
          const status = await getTracker(trackerRef).status();
          console.log(`Workspace: ${status.workDir}`);
          console.log(`Pending changes: ${status.pendingChanges.length}`);
          console.log(`Named snapshots: ${status.snapshots.length}`);
        });

      mindCmd
        .command("history [file]")
        .description("View change history")
        .action(async (...args: unknown[]) => {
          const file = args[0] as string | undefined;
          const commits = await getTracker(trackerRef).history({ file, limit: 20 });
          if (commits.length === 0) {
            console.log("No history found.");
            return;
          }
          for (const c of commits) {
            const date = c.date.toLocaleString("sv-SE", { hour12: false });
            console.log(`${c.oid.slice(0, 8)}  ${date}  ${c.message}`);
          }
        });

      mindCmd
        .command("snapshot [name]")
        .description("Create a named snapshot")
        .action(async (...args: unknown[]) => {
          const name = args[0] as string | undefined;
          const commit = await getTracker(trackerRef).snapshot({ name });
          console.log(`Snapshot created: ${commit.oid.slice(0, 8)} ${commit.message}`);
          if (name) console.log(`Tagged as: ${name}`);
        });
    },
    { commands: ["mind"] },
  );
}
