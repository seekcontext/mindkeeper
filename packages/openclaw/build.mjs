import * as esbuild from "esbuild";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Type-check only (no emit) via tsc
console.log("Type checking...");
execSync("npx tsc --noEmit", { stdio: "inherit" });

// Bundle everything (including mindkeeper core) into a single file
console.log("Bundling...");
await esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: "dist/index.js",
  // Node built-ins are external; nothing else should be
  external: [
    "node:fs",
    "node:fs/promises",
    "node:path",
    "node:os",
    "node:child_process",
    "node:url",
    "node:util",
    "node:events",
    "node:stream",
    "node:buffer",
    "node:crypto",
    "node:http",
    "node:https",
    "node:net",
    "node:tls",
    "node:zlib",
    "node:assert",
    "node:timers",
    "node:worker_threads",
    "fs",
    "path",
    "os",
    "child_process",
    "url",
    "util",
    "events",
    "stream",
    "buffer",
    "crypto",
    "http",
    "https",
    "net",
    "tls",
    "zlib",
    "assert",
    "timers",
  ],
  // isomorphic-git does dynamic requires for some optional things — suppress warnings
  logLevel: "warning",
});

// Copy openclaw.plugin.json and skills into dist/
// (they're already listed in `files` so npm will pick them up from root)
console.log("Done. dist/index.js created.");
