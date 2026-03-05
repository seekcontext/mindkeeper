export interface CommitInfo {
  oid: string;
  message: string;
  timestamp: number;
  date: Date;
  author: string;
  filesChanged?: string[];
}

export interface FileVersion {
  oid: string;
  content: string;
}

export interface FileStatusEntry {
  filepath: string;
  status: "unmodified" | "modified" | "added" | "deleted";
}

export interface StoreOptions {
  workDir: string;
  gitDir: string;
  author?: { name: string; email: string };
}

export interface GitStore {
  init(): Promise<void>;
  addFiles(filepaths: string[]): Promise<void>;
  commit(message: string): Promise<string>;
  log(options?: { filepath?: string; depth?: number }): Promise<CommitInfo[]>;
  readFile(filepath: string, commitOid: string): Promise<string | null>;
  restoreFile(filepath: string, commitOid: string): Promise<void>;
  createTag(name: string, commitOid?: string): Promise<void>;
  listTags(): Promise<Array<{ name: string; oid: string }>>;
  getChangedFiles(filepaths?: string[]): Promise<FileStatusEntry[]>;
  getCommitFiles(commitOid: string): Promise<string[]>;
}
