import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { Git } from "./git";
import { WorktreeItem, WorktreeProvider } from "./worktreeView";

/**
 * Determine the git repo to operate on, based on the first workspace folder.
 * Returns a Git helper scoped to the repo root, or undefined if there is no
 * folder open or it is not a git repository.
 */
async function resolveGit(): Promise<Git | undefined> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }
  const git = new Git(folders[0].uri.fsPath);
  const root = await git.repoRoot();
  if (!root) {
    return undefined;
  }
  return new Git(root);
}

export function activate(context: vscode.ExtensionContext): void {
  // Cache the current Git handle; recomputed on refresh and folder changes.
  let git: Git | undefined;

  const provider = new WorktreeProvider(() => git);
  const treeView = vscode.window.createTreeView("kiroWorktreesView", {
    treeDataProvider: provider,
    showCollapseAll: false,
  });
  context.subscriptions.push(treeView);

  // Keep a badge on the view showing how many worktrees exist.
  const updateBadge = async () => {
    if (!git) {
      treeView.badge = undefined;
      treeView.message = undefined;
      return;
    }
    try {
      const list = await git.listWorktrees();
      treeView.badge =
        list.length > 0
          ? { value: list.length, tooltip: `${list.length} worktree(s)` }
          : undefined;
      treeView.message = undefined;
    } catch {
      treeView.badge = undefined;
    }
  };

  const refresh = async () => {
    git = await resolveGit();
    provider.refresh();
    await updateBadge();
  };

  // Initial load and reload when the set of workspace folders changes.
  void refresh();
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => void refresh())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("kiroWorktrees.refresh", () => refresh())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("kiroWorktrees.add", () =>
      addWorktree(git, refresh)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "kiroWorktrees.remove",
      (item?: WorktreeItem) => removeWorktree(git, item, refresh)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("kiroWorktrees.prune", () =>
      pruneWorktrees(git, refresh)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "kiroWorktrees.openInNewWindow",
      (item?: WorktreeItem) => openWorktree(item, true)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "kiroWorktrees.openInCurrentWindow",
      (item?: WorktreeItem) => openWorktree(item, false)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "kiroWorktrees.copyPath",
      async (item?: WorktreeItem) => {
        if (!item) {
          return;
        }
        await vscode.env.clipboard.writeText(item.worktree.path);
        vscode.window.setStatusBarMessage(
          "$(check) Worktree path copied",
          2000
        );
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "kiroWorktrees.revealInOS",
      async (item?: WorktreeItem) => {
        if (!item) {
          return;
        }
        await vscode.commands.executeCommand(
          "revealFileInOS",
          vscode.Uri.file(item.worktree.path)
        );
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "kiroWorktrees.lock",
      (item?: WorktreeItem) => lockWorktree(git, item, refresh)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "kiroWorktrees.unlock",
      (item?: WorktreeItem) => unlockWorktree(git, item, refresh)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "kiroWorktrees.move",
      (item?: WorktreeItem) => moveWorktree(git, item, refresh)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("kiroWorktrees.repair", () =>
      repairWorktrees(git, refresh)
    )
  );
}

export function deactivate(): void {
  // Nothing to clean up beyond disposables registered in activate().
}

/**
 * Add a worktree. Walks the user through: pick new-vs-existing branch, name/select
 * the branch, then choose a target folder. Runs git and refreshes the view.
 */
async function addWorktree(
  git: Git | undefined,
  refresh: () => Promise<void>
): Promise<void> {
  if (!git) {
    vscode.window.showErrorMessage(
      "No git repository found in the current workspace."
    );
    return;
  }

  const mode = await vscode.window.showQuickPick(
    [
      {
        label: "$(git-branch) Create new branch",
        detail: "Add a worktree on a brand-new branch",
        value: "new" as const,
      },
      {
        label: "$(git-commit) Use existing branch",
        detail: "Add a worktree that checks out an existing branch",
        value: "existing" as const,
      },
    ],
    { placeHolder: "How should the new worktree get its branch?" }
  );
  if (!mode) {
    return;
  }

  let branchArgNew: string | undefined;
  let branchArgExisting: string | undefined;
  let startPoint: string | undefined;
  let defaultFolderName: string;

  if (mode.value === "new") {
    const newBranch = await vscode.window.showInputBox({
      prompt: "Name for the new branch",
      placeHolder: "feature/my-thing",
      validateInput: (v) =>
        v.trim().length === 0 ? "Branch name cannot be empty" : undefined,
    });
    if (!newBranch) {
      return;
    }
    branchArgNew = newBranch.trim();
    defaultFolderName = branchArgNew.replace(/[\/\\]/g, "-");

    // Optionally choose a start point; blank means current HEAD.
    let branches: string[] = [];
    try {
      branches = await git.listBranches();
    } catch {
      // Non-fatal; we can still branch from HEAD.
    }
    const startChoice = await vscode.window.showQuickPick(
      [
        { label: "$(git-commit) Current HEAD", value: "" },
        ...branches.map((b) => ({ label: `$(git-branch) ${b}`, value: b })),
      ],
      { placeHolder: "Start the new branch from... (default: current HEAD)" }
    );
    // Cancelling the start-point step cancels the whole flow.
    if (startChoice === undefined) {
      return;
    }
    startPoint = startChoice.value || undefined;
  } else {
    let branches: string[];
    try {
      branches = await git.listBranches();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Could not list branches: ${msg}`);
      return;
    }
    if (branches.length === 0) {
      vscode.window.showErrorMessage("No local branches found.");
      return;
    }
    const picked = await vscode.window.showQuickPick(branches, {
      placeHolder: "Select an existing branch to check out",
    });
    if (!picked) {
      return;
    }
    branchArgExisting = picked;
    defaultFolderName = picked.replace(/[\/\\]/g, "-");
  }

  // Suggest a sibling folder next to the repo root as the default location.
  const repoRoot = (await git.repoRoot()) ?? "";
  const parent = repoRoot ? path.dirname(repoRoot) : "";
  const repoName = repoRoot ? path.basename(repoRoot) : "worktree";
  const suggested = parent
    ? path.join(parent, `${repoName}-${defaultFolderName}`)
    : "";

  const targetInput = await vscode.window.showInputBox({
    prompt: "Folder path for the new worktree",
    value: suggested,
    validateInput: (v) => {
      const trimmed = v.trim();
      if (trimmed.length === 0) {
        return "Path cannot be empty";
      }
      if (fs.existsSync(trimmed)) {
        return "Path already exists; choose a location that does not exist yet";
      }
      return undefined;
    },
  });
  if (!targetInput) {
    return;
  }
  const target = targetInput.trim();

  try {
    await vscode.window.withProgress(
      { location: { viewId: "kiroWorktreesView" }, title: "Adding worktree..." },
      async () => {
        if (mode.value === "new") {
          await git.addNewBranch(target, branchArgNew!, startPoint);
        } else {
          await git.addExisting(target, branchArgExisting!);
        }
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to add worktree: ${msg}`);
    return;
  }

  await refresh();

  const openChoice = await vscode.window.showInformationMessage(
    `Worktree created at ${target}`,
    "Open in New Window",
    "Open in Current Window"
  );
  if (openChoice === "Open in New Window") {
    await vscode.commands.executeCommand(
      "vscode.openFolder",
      vscode.Uri.file(target),
      { forceNewWindow: true }
    );
  } else if (openChoice === "Open in Current Window") {
    await vscode.commands.executeCommand(
      "vscode.openFolder",
      vscode.Uri.file(target),
      { forceNewWindow: false }
    );
  }
}

/**
 * Remove a worktree via context menu. Confirms first, and retries with --force
 * if git reports the worktree is dirty/locked.
 */
async function removeWorktree(
  git: Git | undefined,
  item: WorktreeItem | undefined,
  refresh: () => Promise<void>
): Promise<void> {
  if (!git || !item) {
    return;
  }
  if (item.worktree.isMain) {
    vscode.window.showWarningMessage(
      "The main worktree cannot be removed with this command."
    );
    return;
  }

  const wtName = path.basename(item.worktree.path);
  const branch = item.worktree.detached
    ? "detached HEAD"
    : item.worktree.branch ?? "unknown branch";
  const dirtyWarning = item.worktree.dirty
    ? "\n\n⚠ This worktree has uncommitted changes that will be lost."
    : "";

  const confirm = await vscode.window.showWarningMessage(
    `Remove worktree "${wtName}"?`,
    {
      modal: true,
      detail:
        `Folder: ${item.worktree.path}\n` +
        `Branch: ${branch}\n\n` +
        `The folder will be removed. The branch itself will NOT be deleted.` +
        dirtyWarning,
    },
    "Remove Worktree"
  );
  if (confirm !== "Remove Worktree") {
    return;
  }

  try {
    await git.remove(item.worktree.path, false);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // git refuses to remove dirty/locked worktrees without --force.
    const force = await vscode.window.showWarningMessage(
      `Could not remove cleanly: ${msg}\n\nForce removal? Uncommitted changes will be lost.`,
      { modal: true },
      "Force Remove"
    );
    if (force !== "Force Remove") {
      return;
    }
    try {
      await git.remove(item.worktree.path, true);
    } catch (err2) {
      const msg2 = err2 instanceof Error ? err2.message : String(err2);
      vscode.window.showErrorMessage(`Failed to force-remove: ${msg2}`);
      return;
    }
  }

  await refresh();
  vscode.window.setStatusBarMessage(`$(check) Worktree "${wtName}" removed`, 2500);
}

async function pruneWorktrees(
  git: Git | undefined,
  refresh: () => Promise<void>
): Promise<void> {
  if (!git) {
    return;
  }
  try {
    const out = await git.prune();
    await refresh();
    const trimmed = out.trim();
    vscode.window.showInformationMessage(
      trimmed ? `Pruned:\n${trimmed}` : "Nothing to prune."
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Prune failed: ${msg}`);
  }
}

async function openWorktree(
  item: WorktreeItem | undefined,
  newWindow: boolean
): Promise<void> {
  if (!item) {
    return;
  }
  await vscode.commands.executeCommand(
    "vscode.openFolder",
    vscode.Uri.file(item.worktree.path),
    { forceNewWindow: newWindow }
  );
}

/**
 * Lock a worktree, optionally with a reason. Locking prevents git from pruning
 * or moving it (handy for worktrees on removable/network storage).
 */
async function lockWorktree(
  git: Git | undefined,
  item: WorktreeItem | undefined,
  refresh: () => Promise<void>
): Promise<void> {
  if (!git || !item) {
    return;
  }
  const wtName = path.basename(item.worktree.path);

  // Reason is optional; an empty/cancelled input still locks (without a reason).
  const reason = await vscode.window.showInputBox({
    prompt: `Lock reason for "${wtName}" (optional)`,
    placeHolder: "e.g. on external drive, keep for release",
  });
  // showInputBox returns undefined when cancelled with Esc. Treat that as
  // "cancel the whole action" so an accidental Esc doesn't silently lock.
  if (reason === undefined) {
    return;
  }

  try {
    await git.lock(item.worktree.path, reason);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to lock worktree: ${msg}`);
    return;
  }
  await refresh();
  vscode.window.setStatusBarMessage(`$(lock) Worktree "${wtName}" locked`, 2500);
}

/** Unlock a previously locked worktree. */
async function unlockWorktree(
  git: Git | undefined,
  item: WorktreeItem | undefined,
  refresh: () => Promise<void>
): Promise<void> {
  if (!git || !item) {
    return;
  }
  const wtName = path.basename(item.worktree.path);
  try {
    await git.unlock(item.worktree.path);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to unlock worktree: ${msg}`);
    return;
  }
  await refresh();
  vscode.window.setStatusBarMessage(
    `$(unlock) Worktree "${wtName}" unlocked`,
    2500
  );
}

/**
 * Move a worktree to a new folder, updating git's bookkeeping. Prompts for the
 * destination and validates it does not already exist. Offers to reopen if the
 * moved worktree is the one currently open.
 */
async function moveWorktree(
  git: Git | undefined,
  item: WorktreeItem | undefined,
  refresh: () => Promise<void>
): Promise<void> {
  if (!git || !item) {
    return;
  }
  if (item.worktree.isMain) {
    vscode.window.showWarningMessage(
      "The main worktree cannot be moved with this command."
    );
    return;
  }

  const currentPath = item.worktree.path;
  const parent = path.dirname(currentPath);
  const suggested = path.join(parent, path.basename(currentPath) + "-moved");

  const destInput = await vscode.window.showInputBox({
    prompt: "New folder path for the worktree",
    value: suggested,
    validateInput: (v) => {
      const trimmed = v.trim();
      if (trimmed.length === 0) {
        return "Path cannot be empty";
      }
      if (path.resolve(trimmed) === path.resolve(currentPath)) {
        return "Destination is the same as the current location";
      }
      if (fs.existsSync(trimmed)) {
        return "Path already exists; choose a location that does not exist yet";
      }
      return undefined;
    },
  });
  if (!destInput) {
    return;
  }
  const dest = destInput.trim();

  try {
    await git.move(currentPath, dest);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // A locked worktree cannot be moved; give a clear hint.
    const hint = item.worktree.locked
      ? "\n\nThis worktree is locked. Unlock it first, then move."
      : "";
    vscode.window.showErrorMessage(`Failed to move worktree: ${msg}${hint}`);
    return;
  }
  await refresh();

  // If the moved worktree is the folder currently open, offer to reopen it.
  const openFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (openFolder && path.resolve(openFolder) === path.resolve(currentPath)) {
    const choice = await vscode.window.showInformationMessage(
      `Worktree moved to ${dest}. Reopen it at the new location?`,
      "Reopen"
    );
    if (choice === "Reopen") {
      await vscode.commands.executeCommand(
        "vscode.openFolder",
        vscode.Uri.file(dest),
        { forceNewWindow: false }
      );
    }
  } else {
    vscode.window.setStatusBarMessage(`$(check) Worktree moved to ${dest}`, 2500);
  }
}

/**
 * Repair worktree administrative links. Useful after folders were moved by hand
 * outside of git. Repairs the whole set for the current repo.
 */
async function repairWorktrees(
  git: Git | undefined,
  refresh: () => Promise<void>
): Promise<void> {
  if (!git) {
    return;
  }
  try {
    const out = await git.repair();
    await refresh();
    const trimmed = out.trim();
    vscode.window.showInformationMessage(
      trimmed ? `Repair:\n${trimmed}` : "Worktree links repaired (nothing to report)."
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Repair failed: ${msg}`);
  }
}
