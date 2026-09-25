---
title: クイックスタート
description: Node.js と tmux があれば 1 分で purplemux-improved を起動できます。
eyebrow: はじめに
permalink: /ja/docs/quickstart/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux-improved はウェブネイティブのマルチプレクサです。すべての Claude Code セッションを 1 つのダッシュボードで管理し、`tmux` でセッションを永続化し、デスクからでもスマートフォンからでも使えるよう設計されています。

## 始める前に

purplemux-improved をホストするマシンには 2 つのものが必要です。

- **Node.js 20 以上** — `node -v` で確認。
- **tmux** — `tmux -V` で確認。3.0 以上であれば OK。

{% call callout('note', 'macOS / Linux のみ') %}
Windows は公式にはサポートしていません。purplemux-improved は `node-pty` と tmux に依存しており、これらは Windows ネイティブでは動作しないためです。WSL2 では大抵動きますが、テスト対象外です。
{% endcall %}

## 実行

コマンド 1 つ。グローバルインストールも不要です。

```bash
npx purplemux-improved@latest
```

`8022` ポートで purplemux-improved が起動します。ブラウザで開いてください。

```
http://localhost:8022
```

初回起動では、パスワードの設定と最初のワークスペース作成までが案内されます。

{% call callout('tip') %}
永続的にインストールしたい場合は `pnpm add -g purplemux-improved && purplemux-improved` でも同じように動きます。アップデートは `pnpm up -g purplemux-improved` 1 回で済みます。
{% endcall %}

## Claude セッションを開く

ダッシュボードで:

1. 任意のワークスペースで **新しいタブ** をクリックします。
2. **Claude** テンプレートを選ぶか、普通のターミナルで `claude` を実行します。
3. purplemux-improved が実行中の Claude CLI を検出し、ステータス・ライブタイムライン・権限プロンプトをリアルタイムに表示し始めます。

ブラウザを閉じてもセッションは維持されます — tmux がサーバ上でプロセスを生かし続けるためです。

## スマートフォンから接続する

デフォルトでは purplemux-improved は `localhost` のみで待ち受けます。安全に外部からアクセスするには Tailscale Serve を使ってください (WireGuard + 自動 HTTPS、ポートフォワーディング不要):

```bash
tailscale serve --bg 8022
```

スマートフォンで `https://<machine>.<tailnet>.ts.net` を開き、**共有 → ホーム画面に追加** をタップすれば、purplemux-improved が PWA としてインストールされ、バックグラウンドでも Web Push 通知を受け取れます。

詳細は [Tailscale アクセス](/purplemux-improved/ja/docs/tailscale/) を、iOS / Android 固有の手順は [PWA セットアップ](/purplemux-improved/ja/docs/pwa-setup/) を参照してください。

## 次のステップ

- **[インストール](/purplemux-improved/ja/docs/installation/)** — プラットフォーム別の詳細、macOS ネイティブアプリ、自動起動。
- **[ブラウザサポート](/purplemux-improved/ja/docs/browser-support/)** — デスクトップ / モバイルの互換性マトリクス。
- **[最初のセッション](/purplemux-improved/ja/docs/first-session/)** — ダッシュボードのガイドツアー。
- **[キーボードショートカット](/purplemux-improved/ja/docs/keyboard-shortcuts/)** — すべてのバインディングを 1 つの表で。
