import test, { after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// wizard は import 時の cwd を ROOT として使うため、先に一時ディレクトリへ移動する
const dir = mkdtempSync(join(tmpdir(), "prbot-wf-"));
const originalCwd = process.cwd();
process.chdir(dir);

const { writeWorkflow, writeAgentFile } = await import("../src/wizard.mjs");

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

test("review permissions live in a dedicated agent file, not project config", () => {
  writeAgentFile({ language: "ja" });
  const agent = readFileSync(join(dir, ".opencode/agents/prbot-review.md"), "utf8");

  assert.match(agent, /^---\n/);
  assert.match(agent, /mode: primary/);
  for (const action of [
    "external_directory", "shell", "webfetch", "websearch",
    "edit", "subagent", "skill", "question", "execute",
  ]) {
    assert.match(
      agent,
      new RegExp(`action: ${action}\\s*\\n\\s*resource: "\\*"\\s*\\n\\s*effect: deny`),
      `prbot-review agent must deny ${action}`,
    );
  }
  assert.match(agent, /resource: "\*\.env"/);
  assert.match(agent, /resource: "\*\.pem"/);

  // 開発セッションに影響するルート直下の設定ファイルは生成しない
  // （旧版はルートの opencode.jsonc に permissions を書き、開発セッションから
  //   shell / edit / execute を奪う事故を起こしていた）
  assert.equal(existsSync(join(dir, "opencode.jsonc")), false, "must not create root opencode.jsonc");
  assert.equal(existsSync(join(dir, "AGENTS.md")), false, "must not create root AGENTS.md");
});

test("runner launches the dedicated prbot-review agent", () => {
  const src = readFileSync(new URL("../src/review.mjs", import.meta.url), "utf8");
  assert.match(src, /"prbot-review"/);
  assert.doesNotMatch(src, /--agent", "plan"/);
  // エージェント定義ファイルがない場合は事前に明確なエラーを出す
  assert.match(src, /prbot-review\.md が見つかりません/);
});
