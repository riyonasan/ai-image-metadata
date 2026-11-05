# Handoff

Updated: 2026-11-05 JST. Branch: main. Repository: https://github.com/riyonasan/ai-image-metadata (public).

## Objective and current state

独立したMITのEagleインスペクターを実装。ComfyUI PNGのプロンプト・LoRAタグ・モデル・設定を部分コピーするソースとテストを用意した。初回実装のため先行ベースラインはない。再開時は`git log -1`と`git status --short --branch`で現在コミットと同期状態を確認する。

## Verification

- `npm test`: 人工データ20件成功。PNGの圧縮／文字コード／異常入力、グラフ接続、タグ、コピー全文、古い非同期結果の破棄を確認。
- `npm run check`: 成功。
- Git外の代表PNG: 両プロンプト、モデル、完全なLoRAタグ5件、画像寸法を最終ソースで確認。画像・実メタデータ・パスは保存していない。
- GPT-6.1 Sol highの独立最終レビュー: モデル探索、CLIP強度不明時のタグ抑止、反復展開制限の指摘を修正し、独立確認ですべて解消。
- 公開対象から私用データ、秘密情報、共有ポリシー本文を除外。CIは追加していない。

## Remaining acceptance

Eagleに開発用として読み込み、画像選択時の更新、全体折りたたみ、実際のクリップボード、狭いサイドバーでの表示、テーマを確認する。インストールやGUI操作はまだ行っていない。

## Resume

READMEとDEV_WORKFLOWを読み、Git状態を確認する。`npm test`と`npm run check`でローカル検証。実画像はGit外に置き、必要なら`npm run inspect -- <image.png> --summary`で確認する。実画像のパスや内容を文書・Gitへ転記しない。

Notion未使用。CI未設定。Eagleプラグインコミュニティへの公開・Release作成はしていない。公開ソースとEagle実動作の確認は区別する。
