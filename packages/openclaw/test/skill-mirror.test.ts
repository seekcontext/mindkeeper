import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureWorkspaceSkillMirror } from "../src/skill-mirror.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function writeSkillFixture(sourceDir: string) {
  writeFileSync(path.join(sourceDir, "SKILL.md"), "# skill\n", "utf8");
  writeFileSync(path.join(sourceDir, "README.md"), "# readme\n", "utf8");
  writeFileSync(path.join(sourceDir, "clawhub.json"), '{ "name": "Mindkeeper" }\n', "utf8");
}

describe("ensureWorkspaceSkillMirror", () => {
  it("copies the built-in skill into the workspace when missing", () => {
    const workspaceDir = makeTempDir("mindkeeper-workspace-");
    const sourceDir = makeTempDir("mindkeeper-skill-");
    writeSkillFixture(sourceDir);

    ensureWorkspaceSkillMirror(workspaceDir, { sourceDir });

    const targetDir = path.join(workspaceDir, "skills", "mindkeeper");
    expect(existsSync(path.join(targetDir, "SKILL.md"))).toBe(true);
    expect(existsSync(path.join(targetDir, "README.md"))).toBe(true);
    expect(existsSync(path.join(targetDir, "clawhub.json"))).toBe(true);
  });

  it("does not overwrite an existing workspace skill file", () => {
    const workspaceDir = makeTempDir("mindkeeper-workspace-");
    const sourceDir = makeTempDir("mindkeeper-skill-");
    writeSkillFixture(sourceDir);

    const targetDir = path.join(workspaceDir, "skills", "mindkeeper");
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(path.join(targetDir, "SKILL.md"), "# existing\n", "utf8");
    writeFileSync(path.join(targetDir, "README.md"), "# existing readme\n", "utf8");
    writeFileSync(path.join(targetDir, "clawhub.json"), '{ "name": "Existing" }\n', "utf8");

    ensureWorkspaceSkillMirror(workspaceDir, { sourceDir });

    expect(readFileSync(path.join(targetDir, "SKILL.md"), "utf8")).toBe("# existing\n");
    expect(readFileSync(path.join(targetDir, "README.md"), "utf8")).toBe("# existing readme\n");
    expect(readFileSync(path.join(targetDir, "clawhub.json"), "utf8")).toBe('{ "name": "Existing" }\n');
  });
});
