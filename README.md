<p align="center">
  <h1 align="center">mindkeeper</h1>
  <p align="center"><strong>Time Machine for Your AI's Brain</strong></p>
  <p align="center">
    Every personality tweak, every rule change, every memory — tracked, diffable, and reversible.
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/mindkeeper-openclaw"><img src="https://img.shields.io/npm/v/mindkeeper-openclaw?label=openclaw%20plugin&color=blue" alt="npm (openclaw plugin)"></a>
  <a href="https://www.npmjs.com/package/mindkeeper"><img src="https://img.shields.io/npm/v/mindkeeper?label=core%20cli&color=blue" alt="npm (core)"></a>
  <a href="https://www.npmjs.com/package/mindkeeper-openclaw"><img src="https://img.shields.io/npm/dm/mindkeeper-openclaw?color=brightgreen" alt="npm downloads"></a>
  <a href="https://github.com/seekcontext/mindkeeper/stargazers"><img src="https://img.shields.io/github/stars/seekcontext/mindkeeper?style=flat&color=yellow" alt="GitHub Stars"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="License"></a>
</p>

<p align="center">
  <a href="#why-mindkeeper">Why Mindkeeper</a> •
  <a href="#choose-your-mode">Choose Your Mode</a> •
  <a href="#openclaw-plugin">OpenClaw Plugin</a> •
  <a href="#standalone-cli">Standalone CLI</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#roadmap">Roadmap</a>
</p>

---

## Why Mindkeeper

Your AI's behavior lives in markdown files like `SOUL.md`, `AGENTS.md`, `MEMORY.md`, and `skills/**/*.md`.

Those files are not just notes. They define how your AI thinks, responds, remembers, and acts. A small edit can make your assistant dramatically better, or quietly make it worse.

**mindkeeper** gives those files a time machine:

- **Automatic snapshots** — Changes are captured in the background, so history exists even when you forget to checkpoint.
- **Readable history** — See what changed, when it changed, and how your agent evolved over time.
- **Fast diffs for agent files** — Compare any two versions and inspect the exact wording changes that shaped behavior.
- **Safe rollback** — Restore a file to an earlier version without losing the ability to undo that rollback later.
- **Named checkpoints** — Save milestones like `stable-v2` before major prompt, rule, or memory experiments.
- **LLM-powered summaries in OpenClaw mode** — Turn raw diffs into readable changelog-style entries.

If your AI configuration matters, it deserves version control.

## Choose Your Mode

Pick the setup that matches how you work:

| If you want to... | Use | Why |
|-------------------|-----|-----|
| Ask your AI to inspect history, show diffs, and roll back its own context | **OpenClaw Plugin** | Registers `mind_*` tools, auto-starts a watcher, and supports LLM-generated commit messages |
| Track agent markdown files in any directory, even without OpenClaw | **Standalone CLI** | Gives you the same history, diff, snapshot, and rollback engine with simple terminal commands |

Both modes use the same core engine and the same shadow-repository design. Your files stay where they are; mindkeeper stores history separately in `.mindkeeper/`.

## OpenClaw Plugin

This is the best experience if you want your AI to inspect history, show diffs, create checkpoints, and guide rollback in natural language.

Once installed, your AI can work with its own history directly:

- show recent changes to `SOUL.md`
- compare the current `AGENTS.md` to an earlier version
- create checkpoints before risky edits
- preview rollback diffs before restoring a file

### Install

#### Option 1 — Install the plugin directly

```bash
openclaw plugins install mindkeeper-openclaw
```

Then restart your Gateway once.

After that, mindkeeper auto-starts with Gateway and keeps tracking your agent context files in the background.

#### Option 2 — Install the skill and let the AI guide setup

If you prefer guided setup, install the `mindkeeper` skill:

```bash
clawhub install mindkeeper
```

On first use, the AI checks whether `mindkeeper-openclaw` is available. If it is missing, the AI asks for your confirmation before installing the plugin and before restarting Gateway. If automatic restart is unavailable, it tells you to restart Gateway manually.

The setup flow follows the behavior defined in [Mindkeeper Skill](https://github.com/seekcontext/mindkeeper/blob/main/packages/openclaw/skills/mindkeeper/SKILL.md).

> **Requirements:** Node.js ≥ 22, OpenClaw with Gateway running.

### Talk to Your AI About Its Own History

Once installed, just ask in natural language:

```
You:   "What changed in SOUL.md recently?"
AI:    Shows you a timeline of personality changes with summaries.

You:   "Compare my current AGENTS.md to last week's version."
AI:    Displays a clear diff highlighting what was added and removed.

You:   "I don't like how you've been responding. Roll back SOUL.md to yesterday."
AI:    Previews the diff, asks for confirmation, then restores the file.
       "Done. Run /new to apply the changes."

You:   "Save a checkpoint called 'perfect-personality' before I experiment."
AI:    Creates a named snapshot you can return to anytime.
```

### Agent Tools

The plugin registers 5 tools your AI can use autonomously:

| Tool | What It Does |
|------|-------------|
| `mind_history` | Browse change history for any tracked file |
| `mind_diff` | Compare any two versions with full unified diff |
| `mind_rollback` | Two-step rollback: preview first, then execute after confirmation |
| `mind_snapshot` | Create named checkpoints before risky changes |
| `mind_status` | Show what files are tracked and what's changed |

### OpenClaw CLI

```bash
openclaw mind status              # See what's tracked and pending
openclaw mind history SOUL.md     # Browse SOUL.md change history
openclaw mind snapshot stable-v2  # Save a named checkpoint
```

## Standalone CLI

mindkeeper also works independently — no OpenClaw required. This is ideal if you want version history for agent context files in scripts, local workflows, or non-OpenClaw environments.

### Install

```bash
npm install -g mindkeeper
```

### Usage

Every command accepts a `--dir <path>` option to point to the workspace you want to operate on. If you omit `--dir`, mindkeeper defaults to the **current working directory**. This means you either `cd` into the workspace first, or always pass `--dir` explicitly — both approaches work, just be consistent.

```bash
# Initialize mindkeeper for a specific workspace
mindkeeper init --dir ~/.nanobot/workspace

# Or cd in first, then omit --dir
cd ~/.nanobot/workspace
mindkeeper init

# View change history
mindkeeper history SOUL.md --dir ~/.nanobot/workspace

# Compare two versions
mindkeeper diff SOUL.md abc1234 def5678 --dir ~/.nanobot/workspace

# Rollback with preview and confirmation
mindkeeper rollback SOUL.md abc1234 --dir ~/.nanobot/workspace

# Create a named checkpoint
mindkeeper snapshot before-experiment --message "Saving current personality" --dir ~/.nanobot/workspace

# Start background watcher
mindkeeper watch --dir ~/.nanobot/workspace
```

### CLI Reference

All commands share a consistent `--dir <path>` option. There are no positional directory arguments — directory is always `--dir`.

| Command | Options | Description |
|---------|---------|-------------|
| `init` | `--dir <path>` | Initialize mindkeeper for a directory |
| `status` | `--dir <path>` | Show tracking status and pending changes |
| `history [file]` | `--dir <path>`, `-n <count>` | View change history (optionally filtered by file) |
| `diff <file> <from> [to]` | `--dir <path>` | Compare two versions of a file |
| `rollback <file> <to>` | `--dir <path>`, `-y` | Rollback a file with preview and confirmation |
| `snapshot [name]` | `--dir <path>`, `-m <msg>` | Create a named snapshot |
| `watch` | `--dir <path>` | Start file watcher daemon |

## How It Works

mindkeeper maintains a **shadow Git repository** alongside your workspace using [isomorphic-git](https://isomorphic-git.org/) (pure JavaScript, no system Git required). The Git data lives in `<workspace>/.mindkeeper/` while your files stay exactly where they are.

```
~/.openclaw/workspace/
├── AGENTS.md              ← tracked, stays in place
├── SOUL.md                ← tracked, stays in place
├── MEMORY.md              ← tracked, stays in place
├── memory/
│   └── 2026-03-04.md      ← tracked, stays in place
├── skills/
│   └── my-skill/SKILL.md  ← tracked, stays in place
└── .mindkeeper/           ← git history data (hidden, auto-managed)
```

### Why It Feels Native

mindkeeper is designed for AI context files, not for forcing you into a traditional Git workflow:

- **No file duplication** — files are tracked in-place, not copied
- **No conflicts** — the shadow repo is completely independent from any existing `.git` in your workspace
- **No dependencies** — pure JavaScript Git engine, works everywhere Node.js runs
- **Per-workspace isolation** — each workspace has its own `.mindkeeper/`, naturally supporting multiple profiles

### What Gets Tracked

By default, mindkeeper tracks the files that define your AI:

| Category | Files |
|----------|-------|
| Personality & Rules | `AGENTS.md`, `SOUL.md`, `IDENTITY.md` |
| User Context | `USER.md`, `TOOLS.md`, `HEARTBEAT.md` |
| Memory | `MEMORY.md`, `memory/**/*.md` |
| Skills | `skills/**/*.md` |

Excluded by default: `BOOTSTRAP.md`, `canvas/**`, `.git/`, `.mindkeeper/`.

All tracking patterns are [fully configurable](#configuration).

### Auto-Snapshot Flow

```
  File changed → Queue change → [30s debounce] → Stage files → Generate message → Commit
                      ↑                                               │
                 More changes reset                          Template or LLM
                   the timer                                   summary
```

Changes are batched with a 30-second debounce window. If you edit `SOUL.md` multiple times within 30 seconds, only one snapshot is created with the final state. A lockfile mechanism prevents duplicate watchers.

## Configuration

### Workspace config — `.mindkeeper.json`

Place this file in your workspace root. It is safe to share.

```json
{
  "tracking": {
    "include": [
      "AGENTS.md", "SOUL.md", "USER.md", "IDENTITY.md",
      "TOOLS.md", "HEARTBEAT.md", "MEMORY.md",
      "memory/**/*.md", "skills/**/*.md"
    ],
    "exclude": ["BOOTSTRAP.md", "canvas/**"]
  },
  "snapshot": {
    "debounceMs": 30000
  },
  "commitMessage": {
    "mode": "template"
  }
}
```

### Global config — `~/.config/mindkeeper/config.json`

This file is **never tracked** and never shared. Use it for machine-local overrides that should stay private.

```json
{
  "snapshot": {
    "debounceMs": 10000
  }
}
```

> **Current limitation:** OpenClaw Plugin mode is currently the only mode that supports LLM-generated commit messages. In standalone CLI mode, mindkeeper falls back to template messages even if you set `commitMessage.mode` to `llm`.
>
> **Security:** Sensitive fields (e.g., `commitMessage.llm.apiKey`) are **only allowed in global config**. If mindkeeper detects an API key in your workspace config, it refuses to start and tells you exactly what to move. This prevents accidental credential leakage when sharing workspace configs.

### OpenClaw plugin config

When using the mindkeeper-openclaw plugin, you can set `commitMessage.mode` in OpenClaw's config under `plugins.entries.mindkeeper-openclaw.config`:

```json
{
  "plugins": {
    "entries": {
      "mindkeeper-openclaw": {
        "config": {
          "commitMessage": {
            "mode": "llm"
          }
        }
      }
    }
  }
}
```

LLM mode uses OpenClaw's default model and API key — no extra setup. OpenClaw Plugin mode is currently the only mode that supports LLM-generated commit messages. If no model or API key is configured, mindkeeper falls back to template messages.

## Architecture

```
mindkeeper/
├── packages/
│   ├── core/              # npm: mindkeeper
│   │   ├── src/
│   │   │   ├── tracker.ts         # Core Tracker class (init, snapshot, history, diff, rollback)
│   │   │   ├── store/git-store.ts # isomorphic-git with gitdir separation
│   │   │   ├── watcher.ts         # chokidar + debounce + lockfile
│   │   │   ├── config.ts          # Layered config with sensitive field enforcement
│   │   │   ├── diff.ts            # Structured diff engine (jsdiff)
│   │   │   └── message/           # Template + LLM commit message generators
│   │   ├── bin/mindkeeper.ts      # CLI entry point
│   │   └── test/                  # Unit + integration tests
│   │
│   └── openclaw/          # npm: mindkeeper-openclaw
│       ├── src/
│       │   ├── tools.ts           # 5 agent tools for AI-driven version control (mind_*)
│       │   ├── cli.ts             # openclaw mind subcommands
│       │   ├── service.ts         # Auto-start watcher service
│       │   └── llm-provider.ts    # LLM commit messages via OpenClaw's auth
│       ├── skills/mindkeeper/SKILL.md
│       └── openclaw.plugin.json
│
├── pnpm-workspace.yaml
└── LICENSE                        # MIT
```

## Roadmap

### v0.2 — Visual

- [ ] **Web UI** — Visual timeline, side-by-side diff viewer, one-click rollback
- [ ] **Full snapshot rollback** — Restore all tracked files to a named checkpoint at once

### v0.3 — Cloud & Sync

- [ ] **Remote backup** — Push your history to a GitHub/GitLab private repo
- [ ] **Multi-device sync** — Pull/push history between machines
- [ ] **Export & share** — Portable history bundles for sharing agent configurations

### v0.4 — Smarter Automation

- [ ] **AI proactive mode** — Auto-checkpoint before the AI modifies core files
- [ ] **Session-immediate rollback** — Automatically clear OpenClaw bootstrap cache after rollback (no `/new` needed)
- [ ] **Layered debounce** — Different snapshot intervals for personality files vs. daily memories
- [ ] **Standalone LLM config** — Bring LLM-generated commit messages to the standalone CLI

### Future

- [ ] **Branching** — Experiment with personality variations on separate branches
- [ ] **Merge** — Combine the best parts of different agent configurations
- [ ] **Mindkeeper marketplace** — Discover and import community-shared agent's mind

## Contributing

Contributions are welcome! This is a pnpm monorepo with TypeScript.

```bash
git clone https://github.com/seekcontext/mindkeeper.git
cd mindkeeper
pnpm install
pnpm build
cd packages/core && pnpm test
```

## Publishing

- **npm packages** — See [PUBLISHING.md](./PUBLISHING.md) for the full release process.
- **ClawHub skill** — See [CLAWHUB_PUBLISH.md](./CLAWHUB_PUBLISH.md) for publishing the mindkeeper skill to [clawhub.ai](https://clawhub.ai).

```bash
# Publish both packages in order
cd packages/core && npm publish
cd ../openclaw && npm publish
```

## License

[MIT](./LICENSE) — Use it however you want.
