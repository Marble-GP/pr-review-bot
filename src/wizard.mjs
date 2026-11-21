#!/usr/bin/env node
// prbot installation wizard
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";

import { saveConfig } from "../lib/config.mjs";
import { sh } from "../lib/shell.mjs";

const ROOT = resolve(process.cwd());

const c = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", cyan: "\x1b[36m", blue: "\x1b[34m",
};

function banner() {
  console.log("");
  console.log(`${c.cyan}${c.bold}╔══════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.cyan}${c.bold}║   prbot — GitHub PR 自動レビュー導入ウィザード            ║${c.reset}`);
  console.log(`${c.cyan}${c.bold}╚══════════════════════════════════════════════════════════╝${c.reset}`);
  console.log("");
  console.log(`${c.dim}OpenCode を利用した GitHub PR 自動レビュー環境をセットアップします。${c.reset}`);
  console.log(`${c.dim}各質問に答えるだけで設定ファイル・ワークフローが生成されます。${c.reset}`);
  console.log("");
}

function step(n, title) { console.log(""); console.log(`${c.blue}${c.bold}━━━ Step ${n}: ${title} ━━━${c.reset}`); }
function ok(m) { console.log(`${c.green}  ✓${c.reset} ${m}`); }
function warn(m) { console.log(`${c.yellow}  ⚠${c.reset} ${m}`); }
function fail(m) { console.log(`${c.red}  ✗${c.reset} ${m}`); }
function info(m) { console.log(`${c.dim}    ${m}${c.reset}`); }

const rl = createInterface({ input: process.stdin, output: process.stdout });
function ask(q, def) {
  return new Promise((res) => {
    const suffix = def !== undefined ? ` [${def}]` : "";
    rl.question(`${c.cyan}?${c.reset} ${q}${suffix}: `, (a) => {
      const v = a.trim();
      res(v === "" ? def : v);
    });
  });
}
function askChoice(q, choices, defIdx = 0) {
  return new Promise((res) => {
    console.log(`${c.cyan}?${c.reset} ${q}`);
    choices.forEach((ch, i) => console.log(`    ${i + 1}. ${ch.label}${ch.hint ? c.dim + "  " + ch.hint + c.reset : ""}`));
    rl.question(`  番号を入力 [${defIdx + 1}]: `, (a) => {
      const n = parseInt(a.trim() || String(defIdx + 1), 10);
      const idx = Number.isNaN(n) ? defIdx : n - 1;
      res(choices[Math.max(0, Math.min(choices.length - 1, idx))]);
    });
  });
}
function askYesNo(q, def = true) {
  return new Promise((res) => {
    rl.question(`${c.cyan}?${c.reset} ${q} [${def ? "Y/n" : "y/N"}]: `, (a) => {
      const v = a.trim().toLowerCase();
      if (v === "") res(def);
      else res(v === "y" || v === "yes" || v === "はい");
    });
  });
}

async function checkPrerequisites() {
  step(1, "前提条件の確認");
  const checks = [
    { name: "Node.js (>=20)", cmd: "node", args: ["--version"], parse: (s) => s.replace("v", "") },
    { name: "Git", cmd: "git", args: ["--version"], parse: (s) => s.match(/git version (\S+)/)?.[1] },
    { name: "GitHub CLI (gh)", cmd: "gh", args: ["--version"], parse: (s) => s.match(/gh version (\S+)/)?.[1] },
    { name: "OpenCode CLI", cmd: "opencode", args: ["--version"], parse: (s) => (s.match(/opencode v?(\S+)/)?.[1] ?? s.trim()) },
  ];
  let allOk = true;
  for (const chk of checks) {
    const r = sh(chk.cmd, chk.args);
    if (r.status === 0 && !r.error) ok(`${chk.name}: ${chk.parse(r.stdout)}`);
    else { fail(`${chk.name}: 未インストール`); allOk = false; }
  }
  if (!allOk) {
    console.log("");
    fail("前提条件が不足しています。以下をインストールしてから再実行してください:");
    info("Node.js:  https://nodejs.org/");
    info("Git:      https://git-scm.com/");
    info("gh:       https://cli.github.com/");
    info("OpenCode: npm install -g @opencode/cli  （または opencode upgrade）");
    process.exit(1);
  }
  const auth = sh("gh", ["auth", "status"]);
  if (auth.status === 0) ok("GitHub CLI 認証: OK");
  else { warn("GitHub CLI が未認証です。`gh auth login` を実行してください。"); info(auth.stderr.split("\n").slice(0, 3).join(" ")); }

  const models = sh("opencode", ["models"]);
  if (models.status === 0) ok("OpenCode が利用可能です");
  else { warn("OpenCode のモデル一覧取得に失敗しました。プロバイダ認証を確認してください。"); info("`opencode auth login <provider>` で認証してください（例: opencode auth login anthropic）"); }
}

function detectRepo() {
  const r = sh("git", ["remote", "get-url", "origin"]);
  if (r.status !== 0) return null;
  const m = r.stdout.match(/github\.com[:/](.+?)(?:\.git)?$/);
  return m ? m[1] : null;
}

async function collectConfig(args) {
  step(2, "プロジェクト設定の入力");

  let repo = args.repo;
  if (!repo) {
    const detected = detectRepo();
    repo = await ask("対象リポジトリ (owner/name)", detected ?? undefined);
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) { fail("リポジトリは owner/name 形式で入力してください"); process.exit(1); }

  let model = args.model;
  if (!model) {
    console.log("");
    info("利用可能なモデルは `opencode models` で確認できます。");
    model = await ask("使用するモデル (provider/model)", "anthropic/claude-sonnet-5-5");
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_./:-]+(#\w+)?$/.test(model)) { fail("モデルは provider/model 形式で入力してください"); process.exit(1); }

  const providerEnvDefaults = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    google: "GOOGLE_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    xai: "XAI_API_KEY",
    groq: "GROQ_API_KEY",
    "opencode-go": "OPENCODE_API_KEY",
    "opencode-zen": "OPENCODE_API_KEY",
  };
  const defaultSecret = providerEnvDefaults[model.split("/")[0].toLowerCase()] ?? "LLM_API_KEY";
  const secretName = await ask("GitHub Actions に登録するAPIキー Secret名", defaultSecret);
  if (!/^[A-Z_][A-Z0-9_]*$/.test(secretName)) {
    fail("Secret名は大文字英数字とアンダースコアで指定してください");
    process.exit(1);
  }

  const language = await askChoice("レビュー言語", [
    { label: "日本語", hint: "コメントを日本語で生成" },
    { label: "英語", hint: "コメントを英語で生成" },
  ], 0);
  const langCode = language.label === "日本語" ? "ja" : "en";

  const skipDrafts = await askYesNo("ドラフトPRをスキップしますか?", true);
  const maxDiffStr = await ask("レビュー対象の差分上限文字数", "120000");
  const timeoutStr = await ask("OpenCode 実行タイムアウト（分）", "15");
  const maxDiffChars = parseInt(maxDiffStr, 10);
  const timeoutMinutes = parseInt(timeoutStr, 10);
  if (!Number.isInteger(maxDiffChars) || maxDiffChars < 1000) { fail("差分上限は 1000 以上の整数で指定してください"); process.exit(1); }
  if (!Number.isInteger(timeoutMinutes) || timeoutMinutes < 1) { fail("タイムアウトは 1 以上の整数で指定してください"); process.exit(1); }
  const excludeRaw = await ask("除外ファイルパターン（カンマ区切り、空でスキップ）", "package-lock.json,yarn.lock,pnpm-lock.yaml,*.min.js,*.map");
  const excludePaths = excludeRaw ? excludeRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];

  const workflowMode = await askChoice("自動実行の方法", [
    { label: "GitHub Actions（推奨）", hint: "PRオープン/更新時に自動レビュー" },
    { label: "手動/ローカル実行のみ", hint: "node .prbot/review.mjs で手動起動" },
  ], 0);

  return {
    repo, model, language: langCode, skipDrafts, secretName,
    maxDiffChars,
    timeoutMinutes,
    excludePaths,
    workflowMode: workflowMode.label.startsWith("GitHub") ? "actions" : "manual",
  };
}

function ensureDir(p) { if (!existsSync(p)) mkdirSync(p, { recursive: true }); }

function writeConfig(config) {
  step(3, "設定ファイルの生成");
  saveConfig(config, ".prbot.json");
  ok(".prbot.json を作成しました");

  ensureDir(join(ROOT, ".prbot"));
  // runner をコピー（import.meta.url ベースで解決）
  const wizardDir = fileURLToPath(new URL(".", import.meta.url));
  const runnerSrc = resolve(wizardDir, "..", "src", "review.mjs");
  const runnerDest = join(ROOT, ".prbot", "review.mjs");
  // lib もコピー（review.mjs が ../lib を参照するため）
  const libSrc = resolve(wizardDir, "..", "lib");
  const libDest = join(ROOT, ".prbot", "lib");
  ensureDir(libDest);
  for (const f of ["config.mjs", "diff.mjs", "prompt.mjs", "shell.mjs"]) {
    const s = join(libSrc, f);
    if (existsSync(s)) copyFileSync(s, join(libDest, f));
  }
  if (existsSync(runnerSrc)) copyFileSync(runnerSrc, runnerDest);
  else {
    // フォールバック: cwd の src/
    const alt = resolve(process.cwd(), "src", "review.mjs");
    if (existsSync(alt)) copyFileSync(alt, runnerDest);
    else throw new Error("src/review.mjs が見つかりません");
  }
  // review.mjs の import パスを .prbot/lib に合わせて書き換え
  let content = readFileSync(runnerDest, "utf8");
  content = content.replace(/from "\.\.\/lib\//g, 'from "./lib/');
  writeFileSync(runnerDest, content, "utf8");
  ok(".prbot/review.mjs と .prbot/lib を配置しました");
}

function writeOpencodeConfig() {
  const path = join(ROOT, "opencode.jsonc");
  if (existsSync(path)) { warn("opencode.jsonc が既に存在するため上書きしません"); return; }
  const content = `{
  "$schema": "https://opencode.ai/config.json",
  "model": "{env:OPENCODE_MODEL}",
  "permissions": [
    { "action": "read", "resource": "*", "effect": "allow" },
    { "action": "glob", "resource": "*", "effect": "allow" },
    { "action": "grep", "resource": "*", "effect": "allow" },
    { "action": "shell", "resource": "git status *", "effect": "allow" },
    { "action": "shell", "resource": "git diff *", "effect": "allow" },
    { "action": "shell", "resource": "gh pr *", "effect": "allow" },
    { "action": "shell", "resource": "gh auth *", "effect": "allow" },
    { "action": "edit", "resource": "*", "effect": "deny" },
    { "action": "write", "resource": "*", "effect": "deny" }
  ]
}
`;
  writeFileSync(path, content, "utf8");
  ok("opencode.jsonc を作成しました（レビュー用の最小権限）");
}

function writeAgentsMd() {
  const path = join(ROOT, "AGENTS.md");
  if (existsSync(path)) { warn("AGENTS.md が既に存在するため上書きしません"); return; }
  const content = `# PR Review Bot — レビュー方針

このリポジトリの PR は prbot により自動レビューされます。レビュー時は以下を守ってください。

## レビュー観点
- バグ・仕様逸脱・エッジケースの見落とし
- セキュリティ（入力検証、認証/認可、秘密情報の漏洩、インジェクション）
- 性能（N+1、不要な再計算、メモリリーク）
- エラーハンドリングとログ
- テストの充足度（正常系/異常系/境界値）

## 出力形式
- 各指摘: 重要度（High/Medium/Low）・対象ファイル:行・理由・修正案
- 些細なスタイル指摘は避ける
- 重大な問題がなければ「重大な問題は見当たりません」と明記
- 不確実な点は断定せず「要確認」と記載

## 禁止事項
- ファイルの編集・作成・削除は行わない
- リポジトリ外へのアクセスは行わない
`;
  writeFileSync(path, content, "utf8");
  ok("AGENTS.md を作成しました");
}

function writeWorkflow(config) {
  if (config.workflowMode !== "actions") return;
  step(4, "GitHub Actions ワークフローの生成");
  const dir = join(ROOT, ".github", "workflows");
  ensureDir(dir);
  const path = join(dir, "prbot-review.yml");
  if (existsSync(path)) {
    warn(".github/workflows/prbot-review.yml が既に存在するため上書きしません");
    return;
  }
  const content = `name: prbot PR Review

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    if: github.event.pull_request.draft == false
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install OpenCode
        run: npm install -g @opencode/cli

      - name: Run prbot review
        env:
          ${config.secretName}: \${{ secrets.${config.secretName} }}
          OPENCODE_MODEL: ${config.model}
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: |
          node .prbot/review.mjs --pr \${{ github.event.pull_request.number }}
`;
  writeFileSync(path, content, "utf8");
  ok(".github/workflows/prbot-review.yml を作成しました");
  info(`Secrets に ${config.secretName}（利用プロバイダの API キー）を登録してください`);
}

function writeGitignore() {
  const path = join(ROOT, ".gitignore");
  const entry = "\n# prbot\n.prbot/work/\n";
  if (existsSync(path)) {
    const cur = readFileSync(path, "utf8");
    if (cur.includes(".prbot/work/")) return;
    writeFileSync(path, cur + entry, "utf8");
  } else {
    writeFileSync(path, entry.trimStart(), "utf8");
  }
}

async function testRun(config) {
  step(6, "動作確認");
  const doTest = await askYesNo("ローカルで dry-run テストを実行しますか?", false);
  if (!doTest) {
    info("スキップしました。後で `node .prbot/review.mjs --pr <番号> --dry-run` で実行できます。");
    return;
  }
  const prNum = await ask("テスト対象の PR 番号", "");
  if (!prNum) return;
  const r = spawnSync("node", [join(ROOT, ".prbot", "review.mjs"), "--pr", prNum, "--dry-run"], {
    encoding: "utf8", stdio: "inherit", shell: process.platform === "win32",
    env: { ...process.env, OPENCODE_MODEL: config.model },
    cwd: ROOT,
  });
  if (r.status === 0) ok("dry-run が正常に完了しました");
  else warn(`dry-run が失敗しました (exit ${r.status})。ログを確認してください。`);
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      repo: { type: "string" },
      model: { type: "string" },
      "non-interactive": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log("Usage: node src/wizard.mjs [--repo owner/name] [--model provider/model] [--non-interactive]");
    process.exit(0);
  }

  banner();
  await checkPrerequisites();
  const config = await collectConfig(values);
  writeConfig(config);
  writeOpencodeConfig();
  writeAgentsMd();
  writeWorkflow(config);
  writeGitignore();

  step(5, "導入完了サマリ");
  console.log("");
  console.log(`${c.green}${c.bold}セットアップが完了しました！${c.reset}`);
  console.log("");
  console.log("生成されたファイル:");
  console.log("  .prbot.json                  — prbot 設定");
  console.log("  .prbot/review.mjs            — レビューランナー");
  console.log("  .prbot/lib/*.mjs             — ランナー依存モジュール");
  console.log("  opencode.jsonc               — OpenCode 権限設定");
  console.log("  AGENTS.md                    — レビュー方針");
  if (config.workflowMode === "actions") console.log("  .github/workflows/prbot-review.yml — 自動実行");
  console.log("");
  console.log("次のステップ:");
  console.log("  1. GitHub リポジトリの Secrets に LLM プロバイダの API キーを登録");
  console.log("  2. `git add .prbot .prbot.json opencode.jsonc AGENTS.md .github && git commit`");
  console.log("  3. PR を作成して自動レビューを確認");
  console.log("");
  console.log("手動実行:  node .prbot/review.mjs --pr <PR番号> --dry-run");
  console.log("");

  await testRun(config);
  rl.close();
}

// export for testing
export { collectConfig, writeConfig, writeOpencodeConfig, writeAgentsMd, writeWorkflow, writeGitignore, checkPrerequisites };

const isEntry = process.argv[1] && /[\\/]wizard\.mjs$/.test(process.argv[1]);
if (isEntry) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`${c.red}エラー: ${e.message}${c.reset}`);
    process.exit(1);
  });
}
