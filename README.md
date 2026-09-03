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

## Install a prebuilt release (no build needed)

The quickest way to test:

1. Download the latest `kiro-worktrees-<version>.vsix` from the [Releases page](https://github.com/clvsushant/kiro-worktrees/releases).
2. Install it:
   - **VS Code:** `code --install-extension kiro-worktrees-<version>.vsix`, or the Extensions view > `...` menu > *Install from VSIX*.
   - **Kiro:** use the Extensions view's *Install from VSIX* option, or the equivalent CLI for your Kiro build.

## Package a .vsix yourself

To build your own package instead of downloading a release:

```bash
npm install
npm run package
```

This runs the packaging tool (`@vscode/vsce`, already a dev dependency) and produces `kiro-worktrees-<version>.vsix` in the project root. Install it the same way as a released `.vsix` above.

### Note on installing into Kiro

The extension is standard VS Code extension code. Kiro uses the VS Code extension host, so if it exposes *Install from VSIX* (Extensions view or command palette), the extension loads like any other. If that option is not available on your build, the F5 Extension Development Host route above is the reliable way to run it.

## Project layout

```
kiro-worktrees-extension/
├── package.json          # manifest: view container, view, commands, menus
├── tsconfig.json
├── media/worktree.svg    # activity-bar icon
├── .github/workflows/    # CI (build + test) and release (package + attach vsix)
├── src/
│   ├── extension.ts      # activation + command handlers
│   ├── git.ts            # git CLI wrapper + worktree parsing
│   ├── worktreeView.ts   # TreeDataProvider + tree items
│   └── test/             # unit tests (node:test)
└── out/                  # compiled JS (generated)
```

## How it works

- `git.ts` runs `git worktree list --porcelain` and parses it into a typed `Worktree[]`. It also wraps `worktree add/remove/prune` and lists branches for the pickers.
- `worktreeView.ts` turns that list into tree items with branch labels, tooltips, and status icons.
- `extension.ts` registers the view and commands, drives the add/remove/prune flows with native Quick Pick and Input Box prompts, and uses the built-in `vscode.openFolder` command to open worktrees in a new or current window.

## Contributing

Contributions are welcome. To get set up:

1. Fork and clone the repo.
2. Install dependencies: `npm install`.
3. Make your changes in `src/`.
4. Build and test: `npm run compile && npm test`.
5. Try it live with F5 (Extension Development Host).
6. Open a pull request against `main`. CI will compile and run the tests on your branch.

Keep the code style consistent with the surrounding files, and add or update tests when you change parsing or git-interaction logic.

## Testing

Unit tests use Node's built-in test runner (`node:test`), so there is no extra test framework to install.

```bash
npm test
```

This compiles the project and runs everything under `src/test/`. The current suite focuses on `parseWorktreePorcelain` in `git.ts` — the parser that turns `git worktree list --porcelain` output into typed records — covering main/linked worktrees, detached HEAD, locked (with and without a reason), prunable, bare, CRLF line endings, and empty output.

The parser is deliberately a pure function (no I/O), which keeps these tests fast and free of any dependency on a real git repository or the VS Code API. Command handlers that drive VS Code UI (Quick Pick, Input Box, `openFolder`) are not unit tested, since exercising them would require a full Extension Host harness; they are verified manually via the F5 dev host.

## Continuous integration

Two GitHub Actions workflows live in `.github/workflows/`:

- **CI** (`ci.yml`) — runs on every push and pull request to `main`. Installs dependencies, compiles, and runs the test suite.
- **Release** (`release.yml`) — runs when a `v*` tag is pushed. It tests, packages the `.vsix`, and creates a GitHub Release with the `.vsix` attached and auto-generated release notes.

To cut a release:

```bash
# bump the version in package.json first, then:
git tag v1.0.0
git push origin v1.0.0
```

The workflow builds and publishes the release automatically.
