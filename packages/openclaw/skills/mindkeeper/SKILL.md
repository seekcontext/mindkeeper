---
name: mindkeeper
description: Version control for agent context files — view history, compare versions, and rollback changes
version: 1.0.0
metadata:
  openclaw:
    requires:
      config: ["workspace.dir"]
---

# Mindkeeper — Version Control for Agent Context

Use the vault tools when the user asks about changes, history, or versions of their agent context files (AGENTS.md, SOUL.md, USER.md, IDENTITY.md, TOOLS.md, MEMORY.md, memory/, skills/).

## Available Tools

- **mind_history** — View change history of context files
- **mind_diff** — Compare two versions of a file
- **mind_rollback** — Restore a file to a previous version (always preview first)
- **mind_snapshot** — Create a named checkpoint before major changes
- **mind_status** — Show current tracking status

## When to Use

Use these tools when the user:
- Asks what changed in their agent configuration ("what changed in SOUL.md?")
- Wants to compare versions ("show me the diff from last week")
- Wants to undo a change ("rollback AGENTS.md to yesterday")
- Wants to save a checkpoint ("save a snapshot called stable-v1")
- Asks about the state of their agent context files

## Rollback Procedure

Always follow this sequence for rollbacks:
1. Call `mind_history` to find the target version
2. Call `mind_rollback` with `preview=true` to show the user what will change
3. Only after user confirms, call `mind_rollback` with `preview=false`
4. After successful rollback, tell the user to run `/new` to apply changes

## Important Notes

- Rollback only affects the specified file, not all files
- Every rollback is recorded as a new commit (can be undone)
- Auto-snapshots happen in the background; the user does not need to manually save
- Named snapshots (via mind_snapshot) are useful before significant personality or rule changes
