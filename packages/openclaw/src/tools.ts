import type { Vault, DiffResult, CommitInfo, VaultStatus } from "mindkeeper";

type RegisterTool = (tool: PluginTool, opts?: Record<string, unknown>) => void;

interface PluginTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler(args: Record<string, unknown>): Promise<unknown>;
}

export function registerVaultTools(
  api: { registerTool?: RegisterTool },
  vault: Vault,
): void {
  if (!api.registerTool) return;

  api.registerTool({
    name: "mind_history",
    description:
      "View version history of agent context files. " +
      "Optionally filter by a specific file. Returns commit hashes, dates, and messages.",
    parameters: {
      type: "object",
      properties: {
        file: {
          type: "string",
          description: "File path to filter history (e.g. 'SOUL.md'). Omit for all files.",
        },
        limit: {
          type: "number",
          description: "Maximum number of entries to return (default: 10).",
        },
      },
    },
    handler: async (args) => {
      const commits = await vault.history({
        file: args.file as string | undefined,
        limit: (args.limit as number | undefined) ?? 10,
      });
      return formatHistoryResult(commits);
    },
  });

  api.registerTool({
    name: "mind_diff",
    description:
      "Compare two versions of an agent context file. " +
      "Shows additions, deletions, and a unified diff.",
    parameters: {
      type: "object",
      properties: {
        file: { type: "string", description: "File path to compare (e.g. 'SOUL.md')." },
        from: { type: "string", description: "Source commit hash." },
        to: { type: "string", description: "Target commit hash (defaults to HEAD)." },
      },
      required: ["file", "from"],
    },
    handler: async (args) => {
      const result = await vault.diff({
        file: args.file as string,
        from: args.from as string,
        to: args.to as string | undefined,
      });
      return formatDiffResult(result);
    },
  });

  api.registerTool({
    name: "mind_rollback",
    description:
      "Rollback an agent context file to a previous version. " +
      "First call with preview=true to see the diff, then call again without preview to execute.",
    parameters: {
      type: "object",
      properties: {
        file: { type: "string", description: "File path to rollback (e.g. 'SOUL.md')." },
        to: { type: "string", description: "Commit hash to rollback to." },
        preview: {
          type: "boolean",
          description: "If true, show diff preview without executing rollback. Default: true.",
        },
      },
      required: ["file", "to"],
    },
    handler: async (args) => {
      const file = args.file as string;
      const to = args.to as string;
      const preview = (args.preview as boolean | undefined) ?? true;

      if (preview) {
        const diff = await vault.diff({ file, from: to, to: "HEAD" });
        return {
          preview: true,
          diff: formatDiffResult(diff),
          instruction:
            "Show this diff to the user. If they confirm, call mind_rollback again with preview=false.",
        };
      }

      const commit = await vault.rollback({ file, to });
      return {
        preview: false,
        success: true,
        commit: { oid: commit.oid.slice(0, 8), message: commit.message },
        note: "Tell the user to run /new to apply the changes to the current session.",
      };
    },
  });

  api.registerTool({
    name: "mind_snapshot",
    description:
      "Create a named checkpoint of the current state of all agent context files. " +
      "Useful before making significant changes.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Snapshot name (e.g. 'personality-v2')." },
        message: { type: "string", description: "Optional description of this snapshot." },
      },
      required: ["name"],
    },
    handler: async (args) => {
      const commit = await vault.snapshot({
        name: args.name as string,
        message: args.message as string | undefined,
      });
      return {
        success: true,
        snapshot: args.name,
        commit: { oid: commit.oid.slice(0, 8), message: commit.message },
      };
    },
  });

  api.registerTool({
    name: "mind_status",
    description: "Show the current status of the context vault: tracked files, pending changes, and named snapshots.",
    parameters: { type: "object", properties: {} },
    handler: async () => {
      const status = await vault.status();
      return formatStatusResult(status);
    },
  });
}

function formatHistoryResult(commits: CommitInfo[]) {
  return {
    count: commits.length,
    entries: commits.map((c) => ({
      oid: c.oid.slice(0, 8),
      date: c.date.toISOString().replace("T", " ").slice(0, 19),
      message: c.message,
    })),
  };
}

function formatDiffResult(result: DiffResult) {
  return {
    file: result.file,
    from: result.fromVersion,
    to: result.toVersion,
    additions: result.additions,
    deletions: result.deletions,
    unified: result.unified,
  };
}

function formatStatusResult(status: VaultStatus) {
  return {
    initialized: status.initialized,
    workDir: status.workDir,
    pendingChanges: status.pendingChanges.map((e) => ({
      file: e.filepath,
      status: e.status,
    })),
    snapshots: status.snapshots.map((s) => ({
      name: s.name,
      oid: s.oid.slice(0, 8),
    })),
  };
}
