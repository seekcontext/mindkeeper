# Publishing mindkeeper Skill to ClawHub

This guide walks through publishing the mindkeeper skill to [ClawHub](https://clawhub.ai/) — the official marketplace for OpenClaw skills.

## Prerequisites

- [ClawHub CLI](https://www.npmjs.com/package/clawhub) installed globally
- ClawHub developer account (create at [clawhub.ai](https://clawhub.ai))
- mindkeeper skill directory ready at `packages/openclaw/skills/mindkeeper/`

## Skill Directory Structure

The skill package for ClawHub includes:

```
packages/openclaw/skills/mindkeeper/
├── SKILL.md        # Main skill instructions (required)
├── clawhub.json    # ClawHub metadata (required)
├── README.md       # User-facing documentation (required)
└── screenshots/    # Optional: 3-5 screenshots (1920x1080 or 1280x720 PNG)
```

## Step-by-Step Publishing Guide

### Step 1: Prepare the Skill

1. **Verify files exist:**
   ```bash
   cd mindkeeper
   ls packages/openclaw/skills/mindkeeper/
   # Should show: SKILL.md, clawhub.json, README.md
   ```

2. **Sync version numbers:**
   - Update `version` in `packages/openclaw/skills/mindkeeper/clawhub.json`
   - Update `version` in `packages/openclaw/skills/mindkeeper/SKILL.md` frontmatter
   - Use [semantic versioning](https://semver.org/): `1.0.0` → `1.0.1` for fixes, `1.1.0` for features

3. **Pre-publish checklist:**
   - [ ] Test the skill with the mindkeeper-openclaw plugin
   - [ ] README clearly states plugin requirement
   - [ ] No debug code or sensitive data in SKILL.md

### Step 2: Create ClawHub Account

1. Go to [https://clawhub.ai](https://clawhub.ai)
2. Click **Sign Up** or **Publish a Skill**
3. Choose **Developer Account**
4. Complete profile: display name, bio, GitHub (recommended)
5. Verify email

### Step 3: Install ClawHub CLI and Login

```bash
npm install -g clawhub
# or
pnpm add -g clawhub

clawhub login
# Follow browser flow to authenticate

clawhub whoami
# Verify you're logged in
```

### Step 4: Add Screenshots (Recommended)

ClawHub reviewers prefer 3–5 high-quality screenshots. See **[SCREENSHOT_GUIDELINE.md](packages/openclaw/skills/mindkeeper/SCREENSHOT_GUIDELINE.md)** for full preparation steps and demo data setup.

```bash
mkdir -p packages/openclaw/skills/mindkeeper/screenshots
```

**Screenshot requirements:**
- Resolution: 1920×1080 or 1280×720
- Format: PNG
- Content ideas:
  1. Hero: AI showing `mind_history` output
  2. `mind_diff` side-by-side comparison
  3. `mind_status` or `mind_snapshot` result
  4. Natural language conversation example

### Step 5: Publish via CLI

From the project root:

```bash
cd mindkeeper

# Publish the skill (replace version with your release)
clawhub publish ./packages/openclaw/skills/mindkeeper \
  --slug mindkeeper \
  --name "Mindkeeper" \
  --version 1.1.0 \
  --changelog "Initial ClawHub release. Version control for agent context files."
```

**CLI options:**
- `--slug` — URL identifier (e.g. `mindkeeper`)
- `--name` — Display name
- `--version` — Must match clawhub.json
- `--changelog` — Short description of this release
- `--tags` — Optional: e.g. `latest`

### Step 6: Web Dashboard (Alternative)

If the CLI path differs, you can package and upload manually:

```bash
cd mindkeeper
tar -czf mindkeeper-skill.tar.gz -C packages/openclaw/skills mindkeeper
```

Then:
1. Go to ClawHub Dashboard → **Publish New Skill**
2. Upload `mindkeeper-skill.tar.gz`
3. Fill metadata (auto-filled from clawhub.json)
4. Upload screenshots
5. Add demo video URL (optional, 30–90 seconds)
6. **Permission justification** — if your skill requests permissions, explain each one
7. Click **Submit for Review**

### Step 7: Review Process

- Review typically takes **2–5 business days**
- Check status: ClawHub Dashboard → **My Skills** → View Status
- If rejected: address all feedback, bump version, add CHANGELOG entry, resubmit

### Step 8: Post-Publish

After approval:

1. **Update workflow** — For future releases:
   ```bash
   # Update version in clawhub.json and SKILL.md
   clawhub publish ./packages/openclaw/skills/mindkeeper \
     --slug mindkeeper \
     --name "Mindkeeper" \
     --version 1.2.0 \
     --changelog "Added X, fixed Y"
   ```

2. **User installation** — Users install only the skill:
   ```bash
   clawhub install mindkeeper
   ```
   **Guided setup:** On first use, the AI checks whether the `mindkeeper-openclaw` plugin is available. If not, it asks for confirmation before installing the plugin and before restarting Gateway. If automatic restart is unavailable, the AI tells the user to restart Gateway manually.

3. **Keep in sync** — When releasing new mindkeeper-openclaw plugin versions, consider publishing a matching skill version if SKILL.md changes.

## Quick Reference

| Action | Command |
|--------|---------|
| Login | `clawhub login` |
| Check auth | `clawhub whoami` |
| Publish | `clawhub publish ./path --slug mindkeeper --name "Mindkeeper" --version X.Y.Z --changelog "..."` |
| Search (user) | `clawhub search "mindkeeper"` |
| Install (user) | `clawhub install mindkeeper` |

## Troubleshooting

- **"Skill already exists"** — Use a new version number or contact ClawHub support if you own the slug
- **Rejection: insufficient docs** — Expand README.md with examples and troubleshooting
- **Rejection: permissions** — Document why each permission is needed in README
- **Registry override** — Use `--registry https://clawhub.ai` or `CLAWHUB_REGISTRY` if default differs

## References

- [How to Publish a Skill to ClawHub](https://www.openclawexperts.io/guides/custom-dev/how-to-publish-a-skill-to-clawhub) — OpenClaw Experts guide
- [ClawHub](https://clawhub.ai) — Marketplace
- [OpenClaw ClawHub docs](https://docs.openclaw.ai/tools/clawhub) — Official documentation
