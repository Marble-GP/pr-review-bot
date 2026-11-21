import test from "node:test";
import assert from "node:assert/strict";
import { buildInstructions, buildReviewBody, MARKER } from "../lib/prompt.mjs";

const meta = { number: 42, title: "Fix bug", body: "fixes #1", author: { login: "alice" }, headRefName: "feat", baseRefName: "main", additions: 10, deletions: 2, changedFiles: 3 };

test("buildInstructions includes PR meta", () => {
  const out = buildInstructions({ language: "ja", meta, truncated: false, excludedFiles: 0 });
  assert.ok(out.includes("PR #42: Fix bug"));
  assert.ok(out.includes("alice"));
  assert.ok(out.includes("ファイルは編集しないでください"));
});

test("buildInstructions english", () => {
  const out = buildInstructions({ language: "en", meta, truncated: true, excludedFiles: 2 });
  assert.ok(out.includes("Do not edit any files"));
  assert.ok(out.includes("truncated") || out.includes("omitted") || out.includes("exceeded"));
  assert.ok(!out.includes("切り捨て"));
});

test("buildReviewBody includes marker and model", () => {
  const out = buildReviewBody({ model: "anthropic/claude", review: "LGTM", truncated: false, excludedFiles: 0 });
  assert.ok(out.startsWith(MARKER));
  assert.ok(out.includes("anthropic/claude"));
  assert.ok(out.includes("LGTM"));
});
