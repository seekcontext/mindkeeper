import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const SKILL_DIR_NAME = "mindkeeper";
const SKILL_FILES = ["SKILL.md", "README.md", "clawhub.json"] as const;

type Logger = {
  info?(...args: unknown[]): void;
  warn?(...args: unknown[]): void;
};

type EnsureWorkspaceSkillMirrorOptions = {
  sourceDir?: string;
  log?: Logger;
};

export function ensureWorkspaceSkillMirror(
  workspaceDir: string | undefined,
  options: EnsureWorkspaceSkillMirrorOptions = {},
): void {
  if (!workspaceDir) return;

  const sourceDir = options.sourceDir ?? resolveBundledSkillDir();
  const targetDir = path.join(workspaceDir, "skills", SKILL_DIR_NAME);

  if (!existsSync(sourceDir)) {
    options.log?.warn?.(`[mindkeeper] Built-in skill directory not found: ${sourceDir}`);
    return;
  }

  try {
    mkdirSync(targetDir, { recursive: true });

    const copied: string[] = [];
    for (const file of SKILL_FILES) {
      const sourceFile = path.join(sourceDir, file);
      const targetFile = path.join(targetDir, file);

      if (!existsSync(sourceFile)) {
        options.log?.warn?.(`[mindkeeper] Built-in skill file missing: ${sourceFile}`);
        continue;
      }

      // Do not overwrite an existing workspace skill install.
      if (existsSync(targetFile)) continue;

      copyFileSync(sourceFile, targetFile);
      copied.push(file);
    }

    if (copied.length > 0) {
      options.log?.info?.(
        `[mindkeeper] Mirrored built-in skill files to ${targetDir}: ${copied.join(", ")}`,
      );
    }
  } catch (err) {
    options.log?.warn?.(`[mindkeeper] Failed to mirror built-in skill: ${String(err)}`);
  }
}

function resolveBundledSkillDir(): string {
  if (typeof __dirname !== "string" || __dirname.length === 0) {
    throw new Error("mindkeeper: __dirname is unavailable while resolving the built-in skill");
  }

  return path.resolve(__dirname, "..", "skills", SKILL_DIR_NAME);
}
