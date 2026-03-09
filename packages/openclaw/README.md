# mindkeeper-openclaw

**Time Machine for Your AI's Brain** — OpenClaw plugin that gives your AI version control for agent context files.

Every change to `AGENTS.md`, `SOUL.md`, `MEMORY.md`, `memory/**/*.md`, and `skills/**/*.md` can be tracked automatically. Your AI can inspect history, compare versions, create checkpoints, and guide rollback safely.

## Why Use It

This is the best experience if you want your AI to inspect history, show diffs, create checkpoints, and guide rollback in natural language:

- **Natural-language history** — ask your AI what changed and when
- **Preview-first rollback** — inspect the diff before restoring a file
- **Named checkpoints** — create safety points before risky edits
- **Background snapshots** — watcher starts with Gateway
- **LLM-powered commit messages** — reuse your existing OpenClaw model and auth settings

## Install

### Option 1 — Install the plugin directly

```bash
openclaw plugins install mindkeeper-openclaw
```

Then restart your Gateway once.

On startup, the plugin mirrors its built-in `mindkeeper` skill into `<workspace>/skills/mindkeeper/` (OpenClaw's standard workspace skills path) so new sessions can find the bootstrap instructions even if no separate ClawHub skill was installed.

### Option 2 — Install the skill and let the AI guide setup

```bash
clawhub install mindkeeper
```

On first use, the AI checks whether `mindkeeper-openclaw` is available. If it is missing, the AI asks for your confirmation before installing the plugin and before restarting Gateway. If automatic restart is unavailable, it tells you to restart Gateway manually.

## Talk to Your AI

Once installed, ask in natural language:

- *"What changed in SOUL.md recently?"*
- *"Compare my current AGENTS.md to last week's version"*
- *"Roll back SOUL.md to yesterday"*
- *"Save a checkpoint called 'perfect-personality' before I experiment"*

## Agent Tools

| Tool | What It Does |
|------|--------------|
| `mind_history` | Browse change history for one file or all tracked files |
| `mind_diff` | Compare two versions with a unified diff |
| `mind_rollback` | Preview rollback first, then execute after confirmation |
| `mind_snapshot` | Create named checkpoints before risky changes |
| `mind_status` | Show what files are tracked and what is pending |

## OpenClaw CLI

```bash
openclaw mind status
openclaw mind history SOUL.md
openclaw mind snapshot stable-v2
```

## Requirements

- Node.js >= 22
- OpenClaw with Gateway running

## Troubleshooting

- If a fresh `/new` session says the plugin is missing right after install, restart Gateway once and retry. Some OpenClaw flows do not expose plugin tools or the built-in skill until startup finishes.
- If tools still do not appear, verify that `mindkeeper-openclaw` is enabled in your OpenClaw config and that `mind_status`, `mind_history`, `mind_diff`, `mind_rollback`, and `mind_snapshot` are allowed tools.

## Commit Messages

OpenClaw Plugin mode is currently the only mode that supports LLM-generated commit messages. If no supported model or API key is available, mindkeeper falls back to template messages automatically.

## Links

- [GitHub](https://github.com/seekcontext/mindkeeper)
- [Core CLI](https://www.npmjs.com/package/mindkeeper) — Standalone version without OpenClaw
- [Mindkeeper Skill](https://github.com/seekcontext/mindkeeper/blob/main/packages/openclaw/skills/mindkeeper/SKILL.md)

## License

MIT
