import * as vscode from "vscode";
import * as path from "path";
import { Git, Worktree } from "./git";

/**
 * A tree item representing a single git worktree in the sidebar.
 */
export class WorktreeItem extends vscode.TreeItem {
  constructor(public readonly worktree: Worktree) {
    const label = path.basename(worktree.path);
    super(label, vscode.TreeItemCollapsibleState.None);

    // contextValue drives which menu actions show (see package.json menus).
    // We build a composite value so `when` clauses can match on:
    //   - whether it's a worktree at all      -> starts with "worktree"
    //   - whether it's the main worktree       -> contains "main" (no Remove)
    //   - whether it's locked or unlocked      -> contains "locked"/"unlocked"
    // e.g. "worktree.unlocked", "worktree.main.locked".
    const parts = ["worktree"];
    if (worktree.isMain) {
      parts.push("main");
    }
    parts.push(worktree.locked ? "locked" : "unlocked");
    this.contextValue = parts.join(".");
    this.resourceUri = vscode.Uri.file(worktree.path);

    const branchLabel = worktree.detached
      ? `detached @ ${worktree.head.substring(0, 7)}`
      : worktree.branch ?? "unknown";

    // Description: branch, plus subtle status badges.
    const badges: string[] = [];
    if (worktree.isMain) {
      badges.push("main");
    }
    if (worktree.dirty) {
      badges.push("● uncommitted");
    }
    if (worktree.prunable) {
      badges.push("⚠ missing");
    }
    if (worktree.locked) {
      badges.push("🔒 locked");
    }
    this.description =
      badges.length > 0 ? `${branchLabel}  ·  ${badges.join("  ")}` : branchLabel;

    // Rich Markdown tooltip.
    const tip = new vscode.MarkdownString(undefined, true);
    tip.appendMarkdown(`**${path.basename(worktree.path)}**\n\n`);
    tip.appendMarkdown(
      `$(git-branch) Branch: \`${branchLabel}\`\n\n`
    );
    tip.appendMarkdown(`$(folder) \`${worktree.path}\`\n\n`);
    if (worktree.head) {
      tip.appendMarkdown(`$(git-commit) HEAD: \`${worktree.head.substring(0, 10)}\`\n\n`);
    }
    if (worktree.isMain) {
      tip.appendMarkdown(`$(root-folder) Main worktree\n\n`);
    }
    if (worktree.dirty) {
      tip.appendMarkdown(`$(circle-filled) Has uncommitted changes\n\n`);
    }
    if (worktree.prunable) {
      tip.appendMarkdown(`$(warning) Prunable — the folder appears to be missing\n\n`);
    }
    if (worktree.locked) {
      const reason = worktree.lockReason ? `: ${worktree.lockReason}` : "";
      tip.appendMarkdown(`$(lock) Locked${reason}\n\n`);
    }
    this.tooltip = tip;

    // Icon: prunable is most urgent, then locked, then main/detached/dirty/clean.
    if (worktree.prunable) {
      this.iconPath = new vscode.ThemeIcon(
        "warning",
        new vscode.ThemeColor("problemsWarningIcon.foreground")
      );
    } else if (worktree.locked) {
      this.iconPath = new vscode.ThemeIcon(
        "lock",
        new vscode.ThemeColor("charts.yellow")
      );
    } else if (worktree.isMain) {
      this.iconPath = new vscode.ThemeIcon(
        "root-folder",
        new vscode.ThemeColor("charts.blue")
      );
    } else if (worktree.detached) {
      this.iconPath = new vscode.ThemeIcon("git-commit");
    } else if (worktree.dirty) {
      this.iconPath = new vscode.ThemeIcon(
        "git-branch",
        new vscode.ThemeColor("gitDecoration.modifiedResourceForeground")
      );
    } else {
      this.iconPath = new vscode.ThemeIcon("git-branch");
    }
  }
}

/**
 * A placeholder item used to surface errors (e.g. git failures) in the tree.
 */
export class MessageItem extends vscode.TreeItem {
  constructor(message: string, icon = "info") {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "message";
    this.iconPath = new vscode.ThemeIcon(icon);
  }
}

export class WorktreeProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    vscode.TreeItem | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly getGit: () => Git | undefined) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    // Flat list: only top-level items.
    if (element) {
      return [];
    }

    const git = this.getGit();
    if (!git) {
      // No folder open / not a repo: viewsWelcome content handles the empty case,
      // so return nothing to let that show.
      return [];
    }

    try {
      const worktrees = await git.listWorktrees();
      if (worktrees.length === 0) {
        return [];
      }
      // Enrich each worktree with dirty status in parallel. Prunable ones are
      // skipped since their folder is gone.
      await Promise.all(
        worktrees.map(async (wt) => {
          if (!wt.prunable && !wt.bare) {
            wt.dirty = await git.isDirty(wt.path);
          }
        })
      );
      return worktrees.map((wt) => new WorktreeItem(wt));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return [new MessageItem(`Error: ${msg}`, "error")];
    }
  }
}
