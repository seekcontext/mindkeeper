import { createTwoFilesPatch, structuredPatch } from "diff";

export interface DiffLine {
  type: "added" | "removed" | "context";
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffResult {
  file: string;
  fromVersion: string;
  toVersion: string;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
  unified: string;
}

export function computeDiff(params: {
  file: string;
  fromVersion: string;
  toVersion: string;
  oldContent: string;
  newContent: string;
}): DiffResult {
  const { file, fromVersion, toVersion, oldContent, newContent } = params;

  const unified = createTwoFilesPatch(
    `a/${file}`,
    `b/${file}`,
    oldContent,
    newContent,
    fromVersion,
    toVersion,
    { context: 3 },
  );

  const patches = structuredPatch(
    `a/${file}`,
    `b/${file}`,
    oldContent,
    newContent,
    fromVersion,
    toVersion,
    { context: 3 },
  );

  let additions = 0;
  let deletions = 0;
  const hunks: DiffHunk[] = [];

  for (const hunk of patches.hunks) {
    const diffLines: DiffLine[] = [];
    let oldLine = hunk.oldStart;
    let newLine = hunk.newStart;

    for (const line of hunk.lines) {
      if (line.startsWith("+")) {
        additions++;
        diffLines.push({ type: "added", content: line.slice(1), newLineNumber: newLine });
        newLine++;
      } else if (line.startsWith("-")) {
        deletions++;
        diffLines.push({ type: "removed", content: line.slice(1), oldLineNumber: oldLine });
        oldLine++;
      } else {
        diffLines.push({
          type: "context",
          content: line.startsWith(" ") ? line.slice(1) : line,
          oldLineNumber: oldLine,
          newLineNumber: newLine,
        });
        oldLine++;
        newLine++;
      }
    }

    hunks.push({
      oldStart: hunk.oldStart,
      oldLines: hunk.oldLines,
      newStart: hunk.newStart,
      newLines: hunk.newLines,
      lines: diffLines,
    });
  }

  return { file, fromVersion, toVersion, hunks, additions, deletions, unified };
}
