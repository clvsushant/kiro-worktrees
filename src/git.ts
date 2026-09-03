import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface Worktree {
  /** Absolute path to the worktree directory. */
  path: string;
  /** Full commit SHA the worktree is checked out at (empty if unknown). */
  head: string;
  /** Short branch name, e.g. "main". Undefined when detached. */
  branch?: string;
  /** True when the worktree is in detached HEAD state. */
  detached: boolean;
  /** True when git reports the worktree as bare. */
  bare: boolean;
  /** True when git reports the worktree entry as prunable (folder gone). */
  prunable: boolean;
  /** True when this is the main worktree (the one holding the .git dir). */
  isMain: boolean;
  /** True when the worktree has uncommitted changes. Undefined if not checked. */
  dirty?: boolean;
  /** True when the worktree is locked (protected from prune/move). */
  locked: boolean;
  /** Optional lock reason reported by git, if one was given. */
  lockReason?: string;
}

/**
 * A thin, promise-based wrapper around the `git` CLI, scoped to one repo root.
 * We shell out to git rather than depend on a library so behavior matches the
 * user's installed git exactly.
 */
export class Git {
  constructor(private readonly cwd: string) {}

  private async run(args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync("git", args, {
        cwd: this.cwd,
        // Worktree lists on big repos can be sizable; give room.
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
      });
      return stdout;
    } catch (err: unknown) {
      const e = err as { stderr?: string; message?: string };
      const detail = (e.stderr || e.message || String(err)).trim();
      throw new Error(detail);
    }
  }

  /** Resolve the repository top-level directory, or null if cwd is not a repo. */
  async repoRoot(): Promise<string | null> {
    try {
      const out = await this.run(["rev-parse", "--show-toplevel"]);
      return out.trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * List all worktrees using the stable porcelain format. Each record is
   * separated by a blank line; keys are space-delimited attributes.
   */
  async listWorktrees(): Promise<Worktree[]> {
    const out = await this.run(["worktree", "list", "--porcelain"]);
    const worktrees: Worktree[] = [];
    let current: Partial<Worktree> | null = null;

    const flush = () => {
      if (current && current.path) {
        worktrees.push({
          path: current.path,
          head: current.head ?? "",
          branch: current.branch,
          detached: current.detached ?? false,
          bare: current.bare ?? false,
          prunable: current.prunable ?? false,
          isMain: false,
          locked: current.locked ?? false,
          lockReason: current.lockReason,
        });
      }
      current = null;
    };

    for (const rawLine of out.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line === "") {
        flush();
        continue;
      }
      if (line.startsWith("worktree ")) {
        flush();
        current = { path: line.substring("worktree ".length) };
      } else if (current) {
        if (line.startsWith("HEAD ")) {
          current.head = line.substring("HEAD ".length);
        } else if (line.startsWith("branch ")) {
          // e.g. "branch refs/heads/main" -> "main"
          const ref = line.substring("branch ".length);
          current.branch = ref.replace(/^refs\/heads\//, "");
        } else if (line === "detached") {
          current.detached = true;
        } else if (line === "bare") {
          current.bare = true;
        } else if (line === "prunable" || line.startsWith("prunable ")) {
          current.prunable = true;
        } else if (line === "locked") {
          current.locked = true;
        } else if (line.startsWith("locked ")) {
          current.locked = true;
          current.lockReason = line.substring("locked ".length).trim();
        }
      }
    }
    flush();

    // The first entry from `git worktree list` is always the main worktree.
    if (worktrees.length > 0) {
      worktrees[0].isMain = true;
    }
    return worktrees;
  }

  /** List local branch names (no decorations). */
  async listBranches(): Promise<string[]> {
    const out = await this.run([
      "for-each-ref",
      "--format=%(refname:short)",
      "refs/heads",
    ]);
    return out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  }

  /** Add a worktree at `path` checking out an existing branch. */
  async addExisting(path: string, branch: string): Promise<string> {
    return this.run(["worktree", "add", path, branch]);
  }

  /** Add a worktree at `path`, creating a new branch `newBranch` from `startPoint`. */
  async addNewBranch(
    path: string,
    newBranch: string,
    startPoint?: string
  ): Promise<string> {
    const args = ["worktree", "add", "-b", newBranch, path];
    if (startPoint) {
      args.push(startPoint);
    }
    return this.run(args);
  }

  /** Remove a worktree. When force is true, discards uncommitted changes. */
  async remove(path: string, force: boolean): Promise<string> {
    const args = ["worktree", "remove"];
    if (force) {
      args.push("--force");
    }
    args.push(path);
    return this.run(args);
  }

  /** Prune stale worktree administrative entries. */
  async prune(): Promise<string> {
    return this.run(["worktree", "prune", "-v"]);
  }

  /**
   * Lock a worktree so git will not prune or move it. An optional reason is
   * stored and shown by `git worktree list`.
   */
  async lock(path: string, reason?: string): Promise<string> {
    const args = ["worktree", "lock"];
    if (reason && reason.trim().length > 0) {
      args.push("--reason", reason.trim());
    }
    args.push(path);
    return this.run(args);
  }

  /** Unlock a previously locked worktree. */
  async unlock(path: string): Promise<string> {
    return this.run(["worktree", "unlock", path]);
  }

  /**
   * Repair worktree administrative files. With no paths, repairs the current
   * repo's links; with paths, repairs those specific worktrees (useful after
   * a folder was moved manually).
   */
  async repair(paths?: string[]): Promise<string> {
    const args = ["worktree", "repair"];
    if (paths && paths.length > 0) {
      args.push(...paths);
    }
    return this.run(args);
  }

  /** Move a worktree to a new location, updating git's bookkeeping. */
  async move(path: string, newPath: string): Promise<string> {
    return this.run(["worktree", "move", path, newPath]);
  }

  /**
   * Report whether a given worktree has uncommitted changes. Runs
   * `git status --porcelain` scoped to that worktree directory. Returns false
   * on any error so a status check never blocks the list from rendering.
   */
  async isDirty(worktreePath: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["-C", worktreePath, "status", "--porcelain"],
        { cwd: this.cwd, maxBuffer: 10 * 1024 * 1024, windowsHide: true }
      );
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }
}
