import * as esbuild from "esbuild";

const NODE_EXTERNALS = [
  "node:fs", "node:fs/promises", "node:path", "node:os", "node:child_process",
  "node:url", "node:util", "node:events", "node:stream", "node:buffer",
  "node:crypto", "node:http", "node:https", "node:net", "node:tls",
  "node:zlib", "node:assert", "node:timers", "node:worker_threads",
  "fs", "path", "os", "child_process", "url", "util", "events", "stream",
  "buffer", "crypto", "http", "https", "net", "tls", "zlib", "assert", "timers",
];

console.log("Bundling...");

// Resolve "mindkeeper" to the core package's built dist (sibling package in the monorepo)
const mindkeeperAlias = {
  name: "mindkeeper-alias",
  setup(build) {
    build.onResolve({ filter: /^mindkeeper$/ }, () => ({
      path: new URL("../core/src/index.ts", import.meta.url).pathname,
    }));
  },
};

// Bundle 1: llm-client — CJS format, fetch only, NO process.env
await esbuild.build({
  entryPoints: ["src/llm-client.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outfile: "dist/llm-client.cjs",
  external: NODE_EXTERNALS,
  plugins: [mindkeeperAlias],
  logLevel: "warning",
});

// Bundle 2: main plugin — CJS format so jiti loads it synchronously.
// jiti loads ESM via native import() which is async and causes OpenClaw to
// see a Promise return from register(), silently dropping all tool registrations.
// CJS is loaded synchronously by jiti, which is what OpenClaw expects.
// isomorphic-git, chokidar, diff, minimatch are listed as runtime dependencies
// so they are installed by npm and loaded at runtime instead of being bundled.
await esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outfile: "dist/index.js",
  external: [
    ...NODE_EXTERNALS,
    // Keep llm-client external so it stays in its own file with no process.env
    "./llm-client.cjs",
    // Large runtime deps: not bundled, installed by npm into plugin's node_modules
    "isomorphic-git",
    "chokidar",
    "diff",
    "minimatch",
  ],
  plugins: [mindkeeperAlias],
  logLevel: "warning",
});

console.log("Done. dist/index.js + dist/llm-client.js created.");
