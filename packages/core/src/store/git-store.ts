import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import git from "isomorphic-git";
import type {
  CommitInfo,
  FileStatusEntry,
  GitStore,
  StoreOptions,
} from "./types.js";

const DEFAULT_AUTHOR = { name: "mindkeeper", email: "vault@local" };

export class IsomorphicGitStore implements GitStore {
  private readonly workDir: string;
  private readonly gitDir: string;
  private readonly author: { name: string; email: string };

  constructor(options: StoreOptions) {
    this.workDir = path.resolve(options.workDir);
    this.gitDir = path.resolve(options.gitDir);
    this.author = options.author ?? DEFAULT_AUTHOR;
  }

  async init(): Promise<void> {
    await fsPromises.mkdir(this.gitDir, { recursive: true });

    try {
      await git.resolveRef({ fs, dir: this.workDir, gitdir: this.gitDir, ref: "HEAD" });
    } catch {
      await git.init({ fs, dir: this.workDir, gitdir: this.gitDir, defaultBranch: "main" });
    }
  }

  async addFiles(filepaths: string[]): Promise<void> {
    for (const filepath of filepaths) {
      const fullPath = path.join(this.workDir, filepath);
      try {
        await fsPromises.access(fullPath);
        await git.add({ fs, dir: this.workDir, gitdir: this.gitDir, filepath });
      } catch {
        await git.remove({ fs, dir: this.workDir, gitdir: this.gitDir, filepath });
      }
    }
  }

  async commit(message: string): Promise<string> {
    const oid = await git.commit({
      fs,
      dir: this.workDir,
      gitdir: this.gitDir,
      message,
      author: this.author,
    });
    return oid;
  }

  async log(options?: { filepath?: string; depth?: number }): Promise<CommitInfo[]> {
    const depth = options?.depth ?? 50;

    let commits: Awaited<ReturnType<typeof git.log>>;
    try {
      commits = await git.log({
        fs,
        dir: this.workDir,
        gitdir: this.gitDir,
        depth,
        ref: "main",
      });
    } catch {
      return [];
    }

    const results: CommitInfo[] = [];

    for (const entry of commits) {
      const { oid, commit } = entry;
      if (options?.filepath) {
        const touchesFile = await this.commitTouchesFile(oid, options.filepath, entry);
        if (!touchesFile) continue;
      }
      results.push({
        oid,
        message: commit.message.trimEnd(),
        timestamp: commit.author.timestamp,
        date: new Date(commit.author.timestamp * 1000),
        author: commit.author.name,
      });
    }

    return results;
  }

  private async commitTouchesFile(
    oid: string,
    filepath: string,
    logEntry: Awaited<ReturnType<typeof git.log>>[number],
  ): Promise<boolean> {
    const parentOids = logEntry.commit.parent;
    if (parentOids.length === 0) {
      const blob = await this.readBlobOid(oid, filepath);
      return blob !== null;
    }

    const currentBlob = await this.readBlobOid(oid, filepath);
    const parentBlob = await this.readBlobOid(parentOids[0], filepath);
    return currentBlob !== parentBlob;
  }

  private async readBlobOid(commitOid: string, filepath: string): Promise<string | null> {
    try {
      const { oid } = await git.readBlob({
        fs,
        dir: this.workDir,
        gitdir: this.gitDir,
        oid: commitOid,
        filepath,
      });
      return oid;
    } catch {
      return null;
    }
  }

  async readFile(filepath: string, commitOid: string): Promise<string | null> {
    try {
      const { blob } = await git.readBlob({
        fs,
        dir: this.workDir,
        gitdir: this.gitDir,
        oid: commitOid,
        filepath,
      });
      return new TextDecoder().decode(blob);
    } catch {
      return null;
    }
  }

  async restoreFile(filepath: string, commitOid: string): Promise<void> {
    const content = await this.readFile(filepath, commitOid);
    const fullPath = path.join(this.workDir, filepath);
    if (content === null) {
      await fsPromises.unlink(fullPath).catch(() => {});
    } else {
      await fsPromises.mkdir(path.dirname(fullPath), { recursive: true });
      await fsPromises.writeFile(fullPath, content, "utf-8");
    }
  }

  async createTag(name: string, commitOid?: string): Promise<void> {
    const ref = commitOid ?? await git.resolveRef({
      fs,
      dir: this.workDir,
      gitdir: this.gitDir,
      ref: "HEAD",
    });
    await git.tag({
      fs,
      dir: this.workDir,
      gitdir: this.gitDir,
      ref: name,
      object: ref,
    });
  }

  async listTags(): Promise<Array<{ name: string; oid: string }>> {
    const tags = await git.listTags({ fs, dir: this.workDir, gitdir: this.gitDir });
    const result: Array<{ name: string; oid: string }> = [];
    for (const name of tags) {
      try {
        const oid = await git.resolveRef({
          fs,
          dir: this.workDir,
          gitdir: this.gitDir,
          ref: `refs/tags/${name}`,
        });
        result.push({ name, oid });
      } catch {
        // skip unresolvable tags
      }
    }
    return result;
  }

  /**
   * Returns files that have changed compared to HEAD.
   * Uses content-hash comparison (git.hashBlob vs readBlob from HEAD tree)
   * rather than statusMatrix, because isomorphic-git's statusMatrix relies on
   * mtime/stat caching which is unreliable on macOS HFS+ (1s precision) and
   * when gitdir is separated from the work directory.
   */
  async getChangedFiles(filepaths?: string[]): Promise<FileStatusEntry[]> {
    const filesToCheck = filepaths ?? await this.listWorkdirFiles();

    let headOid: string | null = null;
    try {
      headOid = await git.resolveRef({ fs, dir: this.workDir, gitdir: this.gitDir, ref: "HEAD" });
    } catch {
      // no commits yet — everything is "added"
    }

    const entries: FileStatusEntry[] = [];

    for (const filepath of filesToCheck) {
      const fullPath = path.join(this.workDir, filepath);

      let workdirContent: Buffer | null = null;
      try {
        workdirContent = await fsPromises.readFile(fullPath);
      } catch {
        workdirContent = null;
      }

      let headBlobOid: string | null = null;
      if (headOid) {
        headBlobOid = await this.readBlobOid(headOid, filepath);
      }

      if (workdirContent === null && headBlobOid === null) {
        continue; // doesn't exist in either place
      }

      if (workdirContent === null) {
        entries.push({ filepath, status: "deleted" });
        continue;
      }

      if (headBlobOid === null) {
        entries.push({ filepath, status: "added" });
        continue;
      }

      // Both exist — compare hashes
      const workdirResult = await git.hashBlob({ object: workdirContent });
      const workdirOid = workdirResult.oid;

      if (workdirOid !== headBlobOid) {
        entries.push({ filepath, status: "modified" });
      }
    }

    return entries;
  }

  private async listWorkdirFiles(): Promise<string[]> {
    const files: string[] = [];
    await this.walkDir(this.workDir, this.workDir, files);
    return files;
  }

  private async walkDir(root: string, dir: string, results: string[]): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fsPromises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relative = path.relative(root, fullPath);
      if (relative.startsWith(".mindkeeper") || relative.startsWith(".git")) continue;
      if (entry.isDirectory()) {
        await this.walkDir(root, fullPath, results);
      } else if (entry.isFile()) {
        results.push(relative);
      }
    }
  }

  async getCommitFiles(commitOid: string): Promise<string[]> {
    const files: string[] = [];
    await git.walk({
      fs,
      dir: this.workDir,
      gitdir: this.gitDir,
      trees: [git.TREE({ ref: commitOid })],
      map: async (filepath, entries) => {
        if (!entries || entries.length === 0) return undefined;
        const entry = entries[0];
        if (!entry) return undefined;
        const type = await entry.type();
        if (type === "blob") {
          files.push(filepath);
        }
        return undefined;
      },
    });
    return files;
  }
}
