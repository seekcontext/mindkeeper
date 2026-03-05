# Publishing mindkeeper to npm

This monorepo publishes two packages:

| Package | npm name | Install command |
|---------|----------|-----------------|
| Core library + CLI | `mindkeeper` | `npm install -g mindkeeper` |
| OpenClaw plugin | `mindkeeper-openclaw` | `openclaw plugins install mindkeeper-openclaw` |

`mindkeeper-openclaw` depends on `mindkeeper`, so **always publish `core` first**.

---

## Prerequisites

- npm account with publish access (run `npm whoami` to verify)
- Node.js ≥ 22 installed
- pnpm installed (`npm install -g pnpm`)

---

## Release checklist

### 1. Update versions

Both packages share the same version number. Update them together:

```bash
# In packages/core/package.json
# In packages/openclaw/package.json
# Change "version": "0.1.0" → "0.x.x" (semver)
```

Rule of thumb:
- Bug fix → patch (`0.1.0` → `0.1.1`)
- New feature, backward compatible → minor (`0.1.0` → `0.2.0`)
- Breaking change → major (`0.1.0` → `1.0.0`)

### 2. Update CHANGELOG.md

Document what changed in this version. Users and the OpenClaw ecosystem rely on this.

### 3. Build and test

```bash
pnpm install
pnpm -r build          # build all packages
cd packages/core && pnpm test
```

### 4. Publish `mindkeeper` (core) first

```bash
cd packages/core
npm publish
```

Verify it is live:

```bash
npm view mindkeeper version
```

### 5. Update the dependency in the openclaw package

In `packages/openclaw/package.json`, make sure the `mindkeeper` dependency matches the version just published:

```json
"dependencies": {
  "mindkeeper": "workspace:*"
}
```

> pnpm publish 会自动把 `workspace:*` 替换为实际发布的版本号，无需手动改动。

```json
```

Then rebuild:

```bash
cd packages/openclaw
pnpm install
pnpm build
```

### 6. Publish `mindkeeper-openclaw`

```bash
cd packages/openclaw
npm publish
```

Verify:

```bash
npm view mindkeeper-openclaw version
```

### 7. Test the published plugin end-to-end

On a clean machine (or in a temp directory with a fresh OpenClaw config):

```bash
openclaw plugins install mindkeeper-openclaw
# restart Gateway
openclaw mind status
```

### 8. Tag the release in Git

```bash
git tag v0.x.x
git push origin v0.x.x
```

---

## Updating an existing release

For patch/minor updates, repeat steps 1–8. npm update reviews are not required — only ClawHub (Skill marketplace) has a review gate. npm publishes immediately.

If you need to **unpublish** within 72 hours of a bad publish:

```bash
npm unpublish mindkeeper-openclaw@0.x.x
```

---

## Making the plugin discoverable via OpenClaw catalog

After publishing to npm, you can also register the plugin in an external OpenClaw catalog so it appears in tooling/UI lists:

```json
{
  "entries": [
    {
      "name": "mindkeeper-openclaw",
      "openclaw": {
        "install": {
          "npmSpec": "mindkeeper-openclaw",
          "defaultChoice": "npm"
        }
      }
    }
  ]
}
```

Users can place this JSON at `~/.openclaw/plugins/catalog.json` or point `OPENCLAW_PLUGIN_CATALOG_PATHS` to it.
