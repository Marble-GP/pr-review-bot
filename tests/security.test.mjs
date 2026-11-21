import test from "node:test";
import assert from "node:assert/strict";

import { buildOpencodeEnv } from "../src/review.mjs";
import { sh } from "../lib/shell.mjs";

test("buildOpencodeEnv never passes GitHub tokens", () => {
  const env = buildOpencodeEnv("p/m", {
    PATH: "/usr/bin",
    HOME: "/home/x",
    GH_TOKEN: "ghs_secret",
    GITHUB_TOKEN: "ghs_secret2",
    GITHUB_REPOSITORY: "o/r",
    OPENCODE_API_KEY: "sk-provider",
    ANTHROPIC_API_KEY: "sk-ant",
    AWS_SECRET_ACCESS_KEY: "aws-secret",
  });
  assert.equal(env.GH_TOKEN, undefined);
  assert.equal(env.GITHUB_TOKEN, undefined);
  assert.equal(env.GITHUB_REPOSITORY, undefined);
  assert.equal(env.AWS_SECRET_ACCESS_KEY, undefined);
  assert.equal(env.OPENCODE_API_KEY, "sk-provider");
  assert.equal(env.ANTHROPIC_API_KEY, "sk-ant");
  assert.equal(env.PATH, "/usr/bin");
  assert.equal(env.OPENCODE_MODEL, "p/m");
});

test("buildOpencodeEnv sets model even when OPENCODE_MODEL is stale", () => {
  const env = buildOpencodeEnv("opencode-go/kimi-k3", { OPENCODE_MODEL: "old/model" });
  assert.equal(env.OPENCODE_MODEL, "opencode-go/kimi-k3");
});

test("sh forwards explicitly provided env values", () => {
  const r = sh("node", [
    "-e",
    "console.log(process.env.PRBOT_TEST_ONLY)",
  ], { env: { PATH: process.env.PATH, PRBOT_TEST_ONLY: "ok" } });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "ok");
});

test("sh does not leak process.env when env is provided", () => {
  process.env.PRBOT_PARENT_ONLY = "parent-secret";
  try {
    const r = sh("node", [
      "-e",
      "console.log(process.env.PRBOT_PARENT_ONLY===undefined?'absent':'present')",
    ], { env: { PATH: process.env.PATH } });
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), "absent");
  } finally {
    delete process.env.PRBOT_PARENT_ONLY;
  }
});
