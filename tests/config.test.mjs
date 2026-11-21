import test from "node:test";
import assert from "node:assert/strict";
import { validateConfig, defaultConfig } from "../lib/config.mjs";

test("validateConfig accepts valid config", () => {
  const c = validateConfig({ repo: "owner/repo", model: "anthropic/claude-sonnet-5-5" });
  assert.equal(c.repo, "owner/repo");
  assert.equal(c.model, "anthropic/claude-sonnet-5-5");
  assert.equal(c.language, "ja");
  assert.equal(c.skipDrafts, true);
});

test("validateConfig rejects bad repo", () => {
  assert.throws(() => validateConfig({ repo: "bad", model: "a/b" }), /owner\/name/);
});

test("validateConfig rejects bad model", () => {
  assert.throws(() => validateConfig({ repo: "o/r", model: "no-slash" }), /provider\/model/);
});

test("validateConfig merges defaults", () => {
  const c = validateConfig({ repo: "o/r", model: "p/m", maxDiffChars: 5000 });
  assert.equal(c.maxDiffChars, 5000);
  assert.equal(c.timeoutMinutes, 15);
  assert.deepEqual(c.excludePaths, []);
});

test("validateConfig rejects bad excludePaths", () => {
  assert.throws(() => validateConfig({ repo: "o/r", model: "p/m", excludePaths: "bad" }), /excludePaths/);
  assert.throws(() => validateConfig({ repo: "o/r", model: "p/m", excludePaths: [123] }), /excludePaths/);
});

test("validateConfig rejects bad maxDiffChars/timeout", () => {
  assert.throws(() => validateConfig({ repo: "o/r", model: "p/m", maxDiffChars: 100 }), /maxDiffChars/);
  assert.throws(() => validateConfig({ repo: "o/r", model: "p/m", timeoutMinutes: 0 }), /timeoutMinutes/);
});

test("validateConfig accepts #variant model", () => {
  const c = validateConfig({ repo: "o/r", model: "anthropic/claude#high" });
  assert.equal(c.model, "anthropic/claude#high");
});

test("loadConfig reports JSON parse errors", async () => {
  const { writeFileSync, rmSync, mkdirSync } = await import("node:fs");
  const { join } = await import("node:path");
  const dir = "C:/Users/s.watanabe/AppData/Local/Temp/opencode/cfgtest";
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const p = join(dir, "bad.json");
  writeFileSync(p, "{not json", "utf8");
  const { loadConfig } = await import("../lib/config.mjs");
  assert.throws(() => loadConfig(p), /JSON が不正/);
});
