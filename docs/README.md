# prbot — GitHub PR 自動レビュー (OpenCode ベース)

OpenCode CLI を利用して GitHub Pull Request を自動レビューするツールです。
インストールウィザードで必要なファイル一式を生成し、GitHub Actions で PR 作成/更新時に自動実行します。

## 特徴

- **CLI インストールウィザード** (`prbot init`) — 前提条件チェック、対話設定、ファイル生成まで一括
- **最小権限** — OpenCode の permissions でレビュー中のファイル編集を禁止
- **差分フィルタリング** — lockfile 等の除外、サイズ上限での切り捨て
- **dry-run** — ローカルでレビュー結果を確認してから投稿
- **多言語** — 日本語/英語のレビュー出力

## 前提条件

- Node.js >= 20
- Git
- GitHub CLI (`gh`) — 認証済み (`gh auth login`)
- OpenCode CLI (`opencode`) — プロバイダ認証済み (`opencode auth login <provider>`)

## インストール

```bash
# リポジトリをクローン or npm link
cd pr-review-bot
npm install -g .   # もしくは npm link
```

## 使い方

### 1. セットアップ

対象リポジトリのルートで実行:

```bash
prbot init
```

ウィザードが以下を対話で設定します:

- 対象リポジトリ (owner/name) — git remote から自動検出
- 使用モデル (provider/model) — 例: `anthropic/claude-sonnet-5-5`
- レビュー言語 (日本語/英語)
- ドラフト PR のスキップ
- 差分上限文字数 / タイムアウト
- 除外ファイルパターン
- 自動実行方法 (GitHub Actions / 手動)

生成されるファイル:

| ファイル | 内容 |
|---|---|
| `.prbot.json` | prbot 設定 |
| `.prbot/review.mjs` | レビューランナー |
| `.prbot/lib/*.mjs` | ランナー依存モジュール |
| `opencode.jsonc` | OpenCode 権限設定 (最小権限) |
| `AGENTS.md` | レビュー方針 |
| `.github/workflows/prbot-review.yml` | 自動実行 (Actions 選択時) |

### 2. GitHub Secrets の登録

利用する LLM プロバイダの API キーをリポジトリの Secrets に登録してください
(例: `ANTHROPIC_API_KEY`)。

### 3. コミット & PR 作成

```bash
git add .prbot .prbot.json opencode.jsonc AGENTS.md .github
git commit -m "chore: add prbot"
git push
```

PR を作成すると自動的にレビューが投稿されます。

### 4. 手動実行

```bash
# dry-run (投稿せず結果を表示)
node .prbot/review.mjs --pr 42 --dry-run

# 実際に投稿
node .prbot/review.mjs --pr 42

# prbot CLI 経由
prbot review --pr 42 --dry-run
```

### 5. 環境診断

```bash
prbot doctor
```

## 設定 (`.prbot.json`)

```json
{
  "repo": "owner/name",
  "model": "anthropic/claude-sonnet-5-5",
  "secretName": "ANTHROPIC_API_KEY",
  "language": "ja",
  "skipDrafts": true,
  "maxDiffChars": 120000,
  "timeoutMinutes": 15,
  "excludePaths": ["package-lock.json", "yarn.lock", "*.min.js"],
  "workflowMode": "actions"
}
```

## レビュー観点のカスタマイズ

`AGENTS.md` を編集することで、レビュー観点や出力形式をカスタマイズできます。
OpenCode はこのファイルを自動的に読み込みます。

## セキュリティ

- レビュー中は `edit`/`write` 権限を `deny` に設定し、ファイル編集を禁止
- CI では最小権限の `GITHUB_TOKEN` を使用
- フォーク PR には Secrets が渡されないため、必要に応じて `pull_request_target` を検討
  (信頼できないコードを権限付き環境で扱うため、追加の対策が必要)

## トラブルシューティング

- `opencode run` が失敗する → `opencode auth login <provider>` で認証確認
- `gh pr view` が失敗する → `gh auth status` で認証確認
- 差分が大きすぎる → `maxDiffChars` を調整、または `excludePaths` で除外

## ライセンス

MIT
