# Changelog

All notable changes to the Kiro Worktrees extension are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0]

### Added

- Marketplace icon and richer listing metadata (keywords, gallery banner) so the
  extension is easier to find and recognize.
- Live auto-refresh: the Worktrees view now updates automatically when worktrees
  are added, removed, or change branch outside the extension (for example from the
  terminal), by watching the repository's git worktree metadata.
- `CHANGELOG.md`.

## [1.0.1]

### Changed

- Activate lazily via view and command contributions instead of on startup, so
  windows that never open the Worktrees view pay no activation cost.
- The view badge now reuses the worktree count from the tree load instead of
  running `git worktree list` a second time on every refresh.

## [1.0.0]

### Added

- Worktrees sidebar view listing every worktree for the current repository, with a
  count badge and at-a-glance status (main, uncommitted changes, detached HEAD,
  prunable, locked).
- Add Worktree flow: choose a new or existing branch, optional start point, target
  folder, and optionally open the new worktree.
- Remove, Prune, and Refresh actions.
- Lock / Unlock, Move, and Repair worktree actions.
- Open in New Window / Open in Current Window, Reveal in File Explorer, and Copy Path.
- Unit tests for the `git worktree list --porcelain` parser.
- GitHub Actions CI (build + test) and release automation (package, publish to
  Open VSX and the VS Code Marketplace, and attach the `.vsix` to a GitHub Release).

[1.1.0]: https://github.com/clvsushant/kiro-worktrees/releases/tag/v1.1.0
[1.0.1]: https://github.com/clvsushant/kiro-worktrees/releases/tag/v1.0.1
[1.0.0]: https://github.com/clvsushant/kiro-worktrees/releases/tag/v1.0.0
