# prbot — GitHub PR 自動レビュー (OpenCode ベース)

OpenCode CLI を利用して GitHub Pull Request を自動レビューするツールです。
インストールウィザードで必要なファイル一式を生成し、GitHub Actions で PR 作成/更新時に自動実行します。

## 特徴

- **CLI インストールウィザード** (`prbot init`) — 前提条件チェック、対話設定、ファイル生成まで一括
- **PR のコードを実行しない** — ベースコミットのみチェックアウトし、差分はテキストとして取得
- **最小権限** — OpenCode の permissions でシェル/ネットワーク/ファイル編集を禁止
- **トークン分離** — `GH_TOKEN` は OpenCode 子プロセスに渡さない
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

### 信頼モデル（重要）

PR のコードは **チェックアウトも実行もしません**。生成されるワークフローは次の前提で動作します。

- `pull_request_target` を使用するため、ワークフロー定義は常にベースブランチ側のものが使われる。
  PR 側でワークフローを書き換えても、マージされるまで実行されない。
- チェックアウトするのは `github.event.pull_request.base.sha`（ベースコミット）のみ。
  `persist-credentials: false` により git 設定にトークンも残さない。
- PR の差分は `gh pr diff` でテキストとして取得し、OpenCode には添付ファイルとして渡すだけ。
- フォークからの PR は Secrets と書き込みトークンを与えないため、ジョブの `if` 条件で既定スキップ。
  フォーク PR もレビューしたい場合は、`pull_request_target` の権限付き環境で
  信頼できない入力を扱うリスクを理解した上で条件を変更してください。

### トークンと環境変数の分離

`review.mjs` は子プロセスごとに環境変数を分離します。

- `gh`（信頼済み CLI）には `GH_TOKEN` を含む通常の環境を渡す。
- `opencode` には許可リスト方式の最小環境のみを渡し、`GH_TOKEN` / `GITHUB_TOKEN` は渡さない。
  プロバイダの `*_API_KEY` と `OPENCODE_MODEL`、実行に必要な OS 変数のみ。

これにより、レビュー対象 diff に含まれる悪意ある指示（プロンプトインジェクション）で
GitHub トークンを窃取・悪用されることはありません。

### OpenCode の権限

生成される `opencode.jsonc` では次を禁止しています。

- `shell` / `execute` — 任意コマンド実行
- `webfetch` / `websearch` — 外部ネットワークアクセス
- `edit`（write/patch 含む） — ファイル変更
- `subagent` / `skill` / `question` — 追加の実行経路
- `external_directory` — プロジェクト外のファイル参照（`~/.ssh` や OpenCode の認証情報など）
- `*.env`, `*.env.*`, `*.pem`, `*.key` の読み取り — 秘密情報の参照

読み取り・glob・grep のみ許可されるため、レビューに必要な情報だけを扱えます。
作業ファイル（指示文・差分）は `.prbot/work/` に作成し、プロジェクト外へは出ません
（`.prbot/work/` は `.gitignore` に追加されます）。

### 残るリスク

- LLM プロバイダへの送信内容（差分とリポジトリの一部ファイル）は外部サービスに渡ります。
  機密リポジトリではプロバイダのデータポリシーを確認してください。
- 同一リポジトリ内の PR 作成者はレビュー結果を通じて API 利用量を消費できます。
- `OPENCODE_API_KEY` などの Secret は Organization Secrets で一元管理し、
  必要最小限のリポジトリにのみスコープしてください。


## トラブルシューティング

- `opencode run` が失敗する → `opencode auth login <provider>` で認証確認
- `gh pr view` が失敗する → `gh auth status` で認証確認
- 差分が大きすぎる → `maxDiffChars` を調整、または `excludePaths` で除外

## ライセンス

MIT
