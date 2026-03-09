# mindkeeper

**Time Machine for Your AI's Brain** — version control for agent context files like `AGENTS.md`, `SOUL.md`, `MEMORY.md`, and `skills/**/*.md`.

Every personality tweak, every rule change, every memory — tracked, diffable, and reversible.

## Why Use It

Use `mindkeeper` when you want a lightweight history system for AI context files without forcing your workspace into a normal Git workflow.

- **Automatic snapshots** — capture changes in the background
- **Readable history** — inspect how your prompts, rules, and memories evolved
- **Fast diffs** — compare exact wording between versions
- **Safe rollback** — restore earlier file versions with a preview-first flow
- **Named checkpoints** — save milestones before risky experiments

## Install

```bash
npm install -g mindkeeper
```

## Quick Start

```bash
# Initialize for a workspace
mindkeeper init --dir ~/.openclaw/workspace

# View history
mindkeeper history SOUL.md --dir ~/.openclaw/workspace

# Compare versions
mindkeeper diff SOUL.md abc1234 def5678 --dir ~/.openclaw/workspace

# Roll back with preview and confirmation
mindkeeper rollback SOUL.md abc1234 --dir ~/.openclaw/workspace

# Save a named checkpoint
mindkeeper snapshot stable-v2 --dir ~/.openclaw/workspace

# Start background watching
mindkeeper watch --dir ~/.openclaw/workspace
```

All commands accept `--dir <path>`.

## CLI Commands

| Command | Description |
|---------|-------------|
| `init` | Initialize mindkeeper for a directory |
| `status` | Show tracking status and pending changes |
| `history [file]` | View change history |
| `diff <file> <from> [to]` | Compare two versions of a file |
| `rollback <file> <to>` | Roll back a file with preview and confirmation |
| `snapshot [name]` | Create a named checkpoint |
| `watch` | Start the file watcher daemon |

## Programmatic API

```javascript
import { Tracker, Watcher } from "mindkeeper";

const tracker = new Tracker({ workDir: "/path/to/workspace" });
await tracker.init();

const commits = await tracker.history({ file: "SOUL.md", limit: 10 });
const diff = await tracker.diff({ file: "SOUL.md", from: "abc1234" });
await tracker.snapshot({ name: "stable-v2" });
await tracker.rollback({ file: "SOUL.md", to: "abc1234" });
```

## How It Works

mindkeeper maintains a shadow Git repository in `<workspace>/.mindkeeper/` using [isomorphic-git](https://isomorphic-git.org/) (pure JavaScript, no system Git required).

Your files stay where they are. History is stored separately.

## Configuration

- **Workspace**: `.mindkeeper.json` in the workspace root
- **Global**: `~/.config/mindkeeper/config.json` for machine-local overrides

## Commit Messages

The standalone CLI currently uses template-based commit messages.

OpenClaw Plugin mode is currently the only mode that supports LLM-generated commit messages. In standalone CLI mode, setting `commitMessage.mode` to `llm` still falls back to template messages.

## Looking for the AI-integrated version?

See [`mindkeeper-openclaw`](https://www.npmjs.com/package/mindkeeper-openclaw) if you want your AI to inspect history, show diffs, create checkpoints, and guide rollback in natural language.

## Links

- [GitHub](https://github.com/seekcontext/mindkeeper)
- [OpenClaw Plugin](https://www.npmjs.com/package/mindkeeper-openclaw)

## License

MIT
