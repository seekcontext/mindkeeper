import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 15_000,
    // Unit tests and integration tests are run as two sequential vitest
    // invocations (see package.json "test" script) to avoid FSEvents resource
    // contention on macOS: concurrent chokidar watchers across vitest workers
    // can exhaust the per-process FSEvents file descriptor budget, causing
    // integration tests that rely on fs-watch events to flake.
    projects: [
      {
        test: {
          name: "unit",
          include: ["test/**/*.test.ts"],
          exclude: ["test/**/*.integration.test.ts"],
        },
      },
      {
        test: {
          name: "integration",
          include: ["test/**/*.integration.test.ts"],
          pool: "forks",
          testTimeout: 15_000,
        },
      },
    ],
  },
});
