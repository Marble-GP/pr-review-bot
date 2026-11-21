import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// wizard は import 時の cwd を ROOT として使うため、先に一時ディレクトリへ移動する
const dir = mkdtempSync(join(tmpdir(), "prbot-wf-"));
const originalCwd = process.cwd();
process.chdir(dir);

const { writeWorkflow, writeOpencodeConfig } = await import("../src/wizard.mjs");

after(() => {
  process.chdir(originalCwd);
  rmSync(dir, { recursive: true, force: true });
});

test("generated workflow runs the trusted base commit only", () => {
  writeWorkflow({
    workflowMode: "actions",
    secretName: "OPENCODE_API_KEY",
    model: "opencode-go/kimi-k3",
  });
  const wf = readFileSync(join(dir, ".github/workflows/prbot-review.yml"), "utf8");

  assert.match(wf, /pull_request_target:/);
  assert.match(wf, /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.match(wf, /persist-credentials: false/);
  assert.match(wf, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  // PR 側のコードをチェックアウトしない
  assert.doesNotMatch(wf, /ref: \$\{\{ github\.event\.pull_request\.head/);
  assert.doesNotMatch(wf, /github\.head_ref/);
  assert.match(wf, /secrets\.OPENCODE_API_KEY/);
});

test("generated opencode config denies shell/network/edit/execute", () => {
  writeOpencodeConfig();
  const cfg = readFileSync(join(dir, "opencode.jsonc"), "utf8");

  for (const action of ["external_directory", "shell", "webfetch", "websearch", "edit", "subagent", "skill", "execute"]) {
    assert.match(
      cfg,
      new RegExp(`"action": "${action}", "resource": "\\*", "effect": "deny"`),
      `permissions must deny ${action}`,
    );
  }
  assert.match(cfg, /"action": "read", "resource": "\*\.env", "effect": "deny"/);
});
