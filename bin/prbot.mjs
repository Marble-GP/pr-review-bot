#!/usr/bin/env node
// prbot CLI
import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(process.cwd());

const HELP = `
prbot — GitHub PR 自動レビュー (OpenCode ベース)

使い方:
  prbot init [--repo owner/name] [--model provider/model]   インストールウィザードを実行
  prbot review --pr <番号> [--dry-run] [--config PATH]       PRをレビュー
  prbot doctor                                              環境・設定を診断
  prbot help                                                このヘルプ

例:
  prbot init
  prbot init --repo myorg/myrepo --model anthropic/claude-sonnet-5-5
  prbot review --pr 42 --dry-run
  prbot doctor
`.trim();

function runNode(script, args) {
  const r = spawnSync("node", [script, ...args], { stdio: "inherit", cwd: ROOT });
  process.exitCode = r.status ?? 0;
}

async function main() {
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      pr: { type: "string" },
      config: { type: "string" },
      repo: { type: "string" },
      model: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      "non-interactive": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });

  const cmd = positionals[0] ?? "help";

  if (values.help || cmd === "help") {
    console.log(HELP);
    return;
  }

  if (cmd === "init") {
    const wizardPath = resolve(process.argv[1], "..", "..", "src", "wizard.mjs");
    const args = [];
    if (values.repo) args.push("--repo", values.repo);
    if (values.model) args.push("--model", values.model);
    if (values["non-interactive"]) args.push("--non-interactive");
    runNode(wizardPath, args);
    return;
  }

  if (cmd === "review") {
    const runnerPath = join(ROOT, ".prbot", "review.mjs");
    if (!existsSync(runnerPath)) {
      console.error("[prbot] .prbot/review.mjs が見つかりません。先に `prbot init` を実行してください。");
      process.exitCode = 1;
      return;
    }
    const args = [];
    if (values.pr) args.push("--pr", values.pr);
    if (values.config) args.push("--config", values.config);
    if (values["dry-run"]) args.push("--dry-run");
    runNode(runnerPath, args);
    return;
  }

  if (cmd === "doctor") {
    const { sh } = await import("../lib/shell.mjs");
    const checks = [
      ["Node.js", "node", ["--version"]],
      ["Git", "git", ["--version"]],
      ["GitHub CLI", "gh", ["--version"]],
      ["OpenCode", "opencode", ["--version"]],
    ];
    console.log("prbot doctor — 環境診断");
    console.log("");
    for (const [name, cmd, args] of checks) {
      const r = sh(cmd, args);
      const status = r.status === 0 ? "OK" : "NG";
      console.log(`  ${status.padEnd(3)} ${name}: ${r.status === 0 ? r.stdout.split("\n")[0] : "未インストール"}`);
    }
    console.log("");
    const cfgPath = join(ROOT, ".prbot.json");
    console.log(`  設定ファイル: ${existsSync(cfgPath) ? "存在" : "未作成 (prbot init を実行)"}`);
    const runnerPath = join(ROOT, ".prbot", "review.mjs");
    console.log(`  ランナー:     ${existsSync(runnerPath) ? "存在" : "未作成"}`);
    const wfPath = join(ROOT, ".github", "workflows", "prbot-review.yml");
    console.log(`  ワークフロー: ${existsSync(wfPath) ? "存在" : "未作成"}`);
    const ghAuth = sh("gh", ["auth", "status"]);
    console.log(`  gh 認証:     ${ghAuth.status === 0 ? "OK" : "未認証 (gh auth login)"}`);
    return;
  }

  console.error(`[prbot] 不明なコマンド: ${cmd}`);
  console.log(HELP);
  process.exitCode = 1;
}

main().catch((e) => {
  console.error(`[prbot] エラー: ${e.message}`);
  process.exitCode = 1;
});
