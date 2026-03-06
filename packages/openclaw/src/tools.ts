import type { Tracker, DiffResult, CommitInfo, TrackerStatus } from "mindkeeper";

function Obj(props: Record<string, unknown>) {
  return { type: "object", properties: props, additionalProperties: false };
}
function Str(description: string) {
  return { type: "string", description };
}
function OptStr(description: string) {
  return { type: "string", description };
}
function OptNum(description: string) {
  return { type: "number", description };
}
function OptBool(description: string) {
  return { type: "boolean", description };
}

type AgentToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details?: unknown;
};

type AgentTool = {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute: (toolCallId: string, params: Record<string, unknown>) => Promise<AgentToolResult>;
};

type RegisterTool = (tool: AgentTool) => void;

function getTracker(ref: { current: Tracker | null }): Tracker {
  if (!ref.current) {
    throw new Error("mindkeeper: tracker not ready — workspace not initialized yet.");
  }
  return ref.current;
}

function jsonResult(payload: unknown): AgentToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

export function registerTrackerTools(
  api: { registerTool?: RegisterTool },
  trackerRef: { current: Tracker | null },
): void {
  if (!api.registerTool) return;

  api.registerTool({
    name: "mind_history",
    label: "Mind History",
    description:
      "View version history of agent context files. " +
      "Optionally filter by a specific file. Returns commit hashes, dates, and messages.",
    parameters: Obj({
      file: OptStr("File path to filter history (e.g. 'SOUL.md'). Omit for all files."),
      limit: OptNum("Maximum number of entries to return (default: 10)."),
    }),
    execute: async (_id, params) => {
      const commits = await getTracker(trackerRef).history({
        file: params.file as string | undefined,
        limit: (params.limit as number | undefined) ?? 10,
      });
      return jsonResult(formatHistoryResult(commits));
    },
  });

  api.registerTool({
    name: "mind_diff",
    label: "Mind Diff",
    description:
      "Compare two versions of an agent context file. " +
      "Shows additions, deletions, and a unified diff.",
    parameters: Obj({
      file: Str("File path to compare (e.g. 'SOUL.md')."),
      from: Str("Source commit hash."),
      to: OptStr("Target commit hash (defaults to HEAD)."),
    }),
    execute: async (_id, params) => {
      const result = await getTracker(trackerRef).diff({
        file: params.file as string,
        from: params.from as string,
        to: params.to as string | undefined,
      });
      return jsonResult(formatDiffResult(result));
    },
  });

  api.registerTool({
    name: "mind_rollback",
    label: "Mind Rollback",
    description:
      "Rollback an agent context file to a previous version. " +
      "First call with preview=true to see the diff, then call again with preview=false to execute.",
    parameters: Obj({
      file: Str("File path to rollback (e.g. 'SOUL.md')."),
      to: Str("Commit hash to rollback to."),
      preview: OptBool("If true, show diff preview without executing rollback. Default: true."),
    }),
    execute: async (_id, params) => {
      const file = params.file as string;
      const to = params.to as string;
      const preview = (params.preview as boolean | undefined) ?? true;
      const tracker = getTracker(trackerRef);

      if (preview) {
        const diff = await tracker.diff({ file, from: to, to: "HEAD" });
        return jsonResult({
          preview: true,
          diff: formatDiffResult(diff),
          instruction:
            "Show this diff to the user. If they confirm, call mind_rollback again with preview=false.",
        });
      }

      const commit = await tracker.rollback({ file, to });
      return jsonResult({
        preview: false,
        success: true,
        commit: { oid: commit.oid.slice(0, 8), message: commit.message },
        note: "Tell the user to run /new to apply the changes to the current session.",
      });
    },
  });

  api.registerTool({
    name: "mind_snapshot",
    label: "Mind Snapshot",
    description:
      "Create a named checkpoint of the current state of all agent context files. " +
      "Useful before making significant changes.",
    parameters: Obj({
      name: Str("Snapshot name (e.g. 'personality-v2')."),
      message: OptStr("Optional description of this snapshot."),
    }),
    execute: async (_id, params) => {
      const commit = await getTracker(trackerRef).snapshot({
        name: params.name as string,
        message: params.message as string | undefined,
      });
      return jsonResult({
        success: true,
        snapshot: params.name,
        commit: { oid: commit.oid.slice(0, 8), message: commit.message },
      });
    },
  });

  api.registerTool({
    name: "mind_status",
    label: "Mind Status",
    description:
      "Show the current tracking status: whether mindkeeper is initialized, tracked files, pending changes, and named snapshots.",
    parameters: Obj({}),
    execute: async () => {
      const status = await getTracker(trackerRef).status();
      return jsonResult(formatStatusResult(status));
    },
  });
}

function formatHistoryResult(commits: CommitInfo[]) {
  return {
    count: commits.length,
    entries: commits.map((c) => ({
      oid: c.oid.slice(0, 8),
      date: c.date.toLocaleString("sv-SE", { hour12: false }),
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

function formatStatusResult(status: TrackerStatus) {
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
