import { test } from "node:test";
import * as assert from "node:assert/strict";
import { parseWorktreePorcelain } from "../git";

// Sample outputs mirror the real `git worktree list --porcelain` format.

test("parses a single main worktree", () => {
  const out = [
    "worktree /repo",
    "HEAD abcdef1234567890abcdef1234567890abcdef12",
    "branch refs/heads/main",
    "",
  ].join("\n");

  const result = parseWorktreePorcelain(out);

  assert.equal(result.length, 1);
  assert.equal(result[0].path, "/repo");
  assert.equal(result[0].head, "abcdef1234567890abcdef1234567890abcdef12");
  assert.equal(result[0].branch, "main");
  assert.equal(result[0].isMain, true);
  assert.equal(result[0].detached, false);
  assert.equal(result[0].locked, false);
});

test("marks only the first worktree as main", () => {
  const out = [
    "worktree /repo",
    "HEAD 1111111111111111111111111111111111111111",
    "branch refs/heads/main",
    "",
    "worktree /repo-feature",
    "HEAD 2222222222222222222222222222222222222222",
    "branch refs/heads/feature/x",
    "",
  ].join("\n");

  const result = parseWorktreePorcelain(out);

  assert.equal(result.length, 2);
  assert.equal(result[0].isMain, true);
  assert.equal(result[1].isMain, false);
  // branch ref with a slash is preserved after stripping refs/heads/
  assert.equal(result[1].branch, "feature/x");
});

test("handles detached HEAD (no branch line)", () => {
  const out = [
    "worktree /repo-detached",
    "HEAD 3333333333333333333333333333333333333333",
    "detached",
    "",
  ].join("\n");

  const result = parseWorktreePorcelain(out);

  assert.equal(result.length, 1);
  assert.equal(result[0].detached, true);
  assert.equal(result[0].branch, undefined);
});

test("parses locked without a reason", () => {
  const out = [
    "worktree /repo-locked",
    "HEAD 4444444444444444444444444444444444444444",
    "branch refs/heads/wip",
    "locked",
    "",
  ].join("\n");

  const result = parseWorktreePorcelain(out);

  assert.equal(result[0].locked, true);
  assert.equal(result[0].lockReason, undefined);
});

test("parses locked with a reason", () => {
  const out = [
    "worktree /repo-locked",
    "HEAD 5555555555555555555555555555555555555555",
    "branch refs/heads/wip",
    "locked on external drive",
    "",
  ].join("\n");

  const result = parseWorktreePorcelain(out);

  assert.equal(result[0].locked, true);
  assert.equal(result[0].lockReason, "on external drive");
});

test("parses prunable worktrees", () => {
  const out = [
    "worktree /repo-gone",
    "HEAD 6666666666666666666666666666666666666666",
    "branch refs/heads/old",
    "prunable gitdir file points to non-existent location",
    "",
  ].join("\n");

  const result = parseWorktreePorcelain(out);

  assert.equal(result[0].prunable, true);
});

test("parses a bare main worktree", () => {
  const out = ["worktree /repo.git", "bare", ""].join("\n");

  const result = parseWorktreePorcelain(out);

  assert.equal(result.length, 1);
  assert.equal(result[0].bare, true);
  assert.equal(result[0].isMain, true);
});

test("handles CRLF line endings", () => {
  const out = [
    "worktree /repo",
    "HEAD 7777777777777777777777777777777777777777",
    "branch refs/heads/main",
    "",
  ].join("\r\n");

  const result = parseWorktreePorcelain(out);

  assert.equal(result.length, 1);
  assert.equal(result[0].branch, "main");
});

test("returns an empty array for empty output", () => {
  assert.deepEqual(parseWorktreePorcelain(""), []);
  assert.deepEqual(parseWorktreePorcelain("\n\n"), []);
});

test("tolerates missing trailing blank line", () => {
  const out = [
    "worktree /repo",
    "HEAD 8888888888888888888888888888888888888888",
    "branch refs/heads/main",
  ].join("\n");

  const result = parseWorktreePorcelain(out);

  assert.equal(result.length, 1);
  assert.equal(result[0].branch, "main");
});
