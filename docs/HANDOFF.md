# Handoff

Updated: 2026-11-05 JST. Branch: main. Repository: https://github.com/riyonasan/ai-image-metadata (public).

## Objective and current state

0.1.1の表示調整。ベースラインは`c837035`。承認済みモックに合わせ、枠なしコピーアイコン、短いプロンプトで展開ボタンを非表示、LoRAを拡張子なしの「名前:重み」表示にした。コピー値は元の全文・タグを維持する。再開時は`git log -1`と`git status --short --branch`で現在コミットと同期状態を確認する。

## Verification

- `npm test`: 人工データ23件成功。既存の解析・コピー検証に加え、短文／長文／幅変更時の展開表示、アイコンの操作ラベル、元のLoRAタグ・モデル名・設定値のコピー、異なるCLIP重み表示を確認。
- `npm run check`: 成功。
- ベースラインでGit外の代表PNGの解析を確認済み。今回PNG・生成情報の解析処理は変更していない。画像・実メタデータ・パスは保存していない。
- 今回の表示変更はGPT-6.1 Sol highの独立最終レビューで修正要求なし。コピー値、CLIP例外表示、測定処理、アイコン操作領域・ラベル、CSPとライセンスの区別を確認。
- 公開対象から私用データ、秘密情報、共有ポリシー本文を除外。CIは追加していない。

## Remaining acceptance

Eagleに開発用として読み込み、画像選択時の更新、全体折りたたみ、実際のクリップボード、狭いサイドバーでの表示、テーマを確認する。今回追加した3行判定・幅変更時の表示、明暗テーマのアイコン、モックとの一致は実機未確認。インストールやGUI操作はまだ行っていない。

## Resume

READMEとDEV_WORKFLOWを読み、Git状態を確認する。`npm test`と`npm run check`でローカル検証。実画像はGit外に置き、必要なら`npm run inspect -- <image.png> --summary`で確認する。実画像のパスや内容を文書・Gitへ転記しない。

Notion未使用。CI未設定。Eagleプラグインコミュニティへの公開・Release作成はしていない。公開ソースとEagle実動作の確認は区別する。
