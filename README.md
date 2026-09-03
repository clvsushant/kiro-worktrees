# Kiro Worktrees

A sidebar extension for managing git worktrees without leaving your editor. Built as a standard VS Code extension, so it runs in Kiro (which uses the VS Code extension host) and in plain VS Code.

## Features

A **Worktrees** view in the activity bar that gives you:

- **List** — every worktree for the current repo, showing its folder name and branch, with a count badge on the view. Status is shown at a glance:
  - Main worktree: blue root-folder icon + `main` badge.
  - Uncommitted changes: colored branch icon + `● uncommitted` badge.
  - Detached HEAD: commit icon.
  - Prunable (folder missing): warning icon + `⚠ missing` badge.
  - Locked: yellow lock icon + `🔒 locked` badge (lock reason shown in the tooltip).
- **Inline hover actions** — hover a row to get one-click icons for *Open in New Window* and *Remove* (Remove is hidden on the main worktree). More actions live in the right-click menu.
- **Add Worktree** (`+` in the view title) — a guided flow:
  1. Choose **new branch** or **existing branch**.
  2. New branch: type the branch name, then optionally pick a start point (defaults to current HEAD). Existing branch: pick from a list of local branches.
  3. Confirm the target folder (defaults to a sibling folder next to the repo, named after the branch).
  4. Optionally open the new worktree in a new or current window.
- **Remove Worktree** (inline icon or right-click) — shows a confirmation dialog with the folder, branch, and a warning when there are uncommitted changes. Notes that the branch itself is kept. Offers a forced removal if git refuses. The main worktree is protected.
- **Prune Stale Worktrees** (trash icon in the view title) — runs `git worktree prune` and reports what it cleaned.
- **Lock / Unlock** (inline icon / right-click) — lock a worktree so git won't prune or move it (handy for worktrees on removable or network storage). Locking prompts for an optional reason; the row shows the correct action based on current state.
- **Move Worktree** (right-click) — relocate a worktree to a new folder, updating git's bookkeeping. Validates the destination, blocks the main worktree, and offers to reopen if you move the folder that's currently open. Locked worktrees must be unlocked first (the error hints this).
- **Repair Worktree Links** (overflow menu in the view title) — runs `git worktree repair` to fix administrative links after folders were moved by hand.
- **Open in New Window** / **Open in Current Window** (inline icon / right-click) — jump into any worktree.
- **Reveal in File Explorer** (right-click) — open the worktree folder in the OS file manager.
- **Copy Path** (right-click) — copy a worktree's absolute path.
- **Refresh** — re-read the worktree list.

Everything shells out to your installed `git`, so behavior matches the command line exactly.

## Requirements

- `git` on your PATH (2.5+ for worktree support; tested against 2.55).
- Node.js and npm only for building, not at runtime.

## Run it in development (F5)

1. Open this folder (`kiro-worktrees-extension`) in Kiro or VS Code.
2. Install dependencies and build:
   ```bash
   npm install
   npm run compile
   ```
3. Press `F5` (or Run > Start Debugging). This launches an **Extension Development Host** window with the extension loaded.
4. In that new window, open any git repository that has (or can have) worktrees. The **Worktrees** icon appears in the activity bar.

Use `npm run watch` instead of `compile` if you want incremental rebuilds while editing.

## Package as a .vsix and install

To install it permanently rather than running the dev host:

1. Install the packaging tool (one time):
   ```bash
   npm install -g @vscode/vsce
   ```
2. Package:
   ```bash
   npm run compile
   vsce package
   ```
   This produces `kiro-worktrees-0.1.0.vsix`.
3. Install the `.vsix`:
   - **VS Code:** `code --install-extension kiro-worktrees-0.1.0.vsix`, or the Extensions view > `...` menu > *Install from VSIX*.
   - **Kiro:** use the Extensions view's *Install from VSIX* option if present, or the equivalent CLI for your Kiro build.

### Note on installing into Kiro

The extension is standard VS Code extension code and compiles cleanly, but I have not verified `.vsix` installation on your specific Kiro build. If Kiro exposes *Install from VSIX* (Extensions view or command palette), it should load like any other extension. If it doesn't, the F5 Extension Development Host route above is the reliable way to run it. If you hit a snag installing into Kiro, tell me what you see and we'll adapt.

## Project layout

```
kiro-worktrees-extension/
├── package.json          # manifest: view container, view, commands, menus
├── tsconfig.json
├── media/worktree.svg    # activity-bar icon
├── src/
│   ├── extension.ts      # activation + command handlers
│   ├── git.ts            # git CLI wrapper + worktree parsing
│   └── worktreeView.ts   # TreeDataProvider + tree items
└── out/                  # compiled JS (generated)
```

## How it works

- `git.ts` runs `git worktree list --porcelain` and parses it into a typed `Worktree[]`. It also wraps `worktree add/remove/prune` and lists branches for the pickers.
- `worktreeView.ts` turns that list into tree items with branch labels, tooltips, and status icons.
- `extension.ts` registers the view and commands, drives the add/remove/prune flows with native Quick Pick and Input Box prompts, and uses the built-in `vscode.openFolder` command to open worktrees in a new or current window.
