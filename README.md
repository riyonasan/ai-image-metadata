# AI Image Metadata

Eagleの右サイドバーで、AI画像のプロンプトや生成設定を確認・コピーするプラグインです。ComfyUIのPNGを優先し、画像やメタデータは外部へ送信しません。

公開ソース：[riyonasan/ai-image-metadata](https://github.com/riyonasan/ai-image-metadata)。現在はEagle内での受け入れ確認待ちの初版です。

## 使い方

Eagle 4のプラグイン開発メニューから、このフォルダを開発用プラグインとして読み込みます。PNGを1枚選び、右側の **AI Image Metadata** を開きます。インストール済みの他プラグインを置き換える必要はありません。

- ポジティブ／ネガティブは枠付きで表示し、長文を折りたためます。コピーボタンは表示の省略にかかわらず全文をコピーします。
- LoRAの「タグをコピー」は、`<lora:styles\example.safetensors:0.8>` のようにパス・ファイル名・重みを含みます。同じLoRA配置を使う環境で貼り付けることを想定しています。
- モデル名、記録がある場合のハッシュ、生成設定の各値をコピーできます。LoRAと生成設定は個別に開閉できます。
- 欄全体の開閉にはEagle標準のインスペクター見出しを使います。
- 選択画像の内容に切り替わらない場合は「再読み込み」を押してください。

## 対応範囲

PNGの`parameters`があれば、整形済みのプロンプト・モデル・LoRAタグ・生成設定を使います。ComfyUIが併せて保存した場合もこちらを優先します。

`parameters`がないComfyUI PNGでは、`prompt`のノード接続から読み取ります。現在の対象はKSampler／KSamplerAdvanced／D2 KSampler、CLIPTextEncode／D2 Prompt、標準のCheckpoint／UNETローダーとD2 Load Diffusion Model Set、標準LoRAローダー、rgthreeのSeedです。加工なしのText Concatenateにも対応します。複数の対応生成経路がある場合は選択欄を表示します。

独自ノードや動的な文字列加工は完全には再現できません。確定できないプロンプトはコピー対象にせず、その旨を表示します。モデルとCLIPのLoRA強度が異なる場合や、CLIP側の強度を確定できない場合は、単一の重みのタグに変換しません。グラフ内のSeedが整数の精度上限を超える場合も、丸めた値をコピーせず表示から除外します。ハッシュやLoRAファイルの存在は推測・検索しません。

ワークフローの表示・コピー、JPEG／WebP、NovelAI固有形式、PixAI固有形式は未対応です。PNGの画像データそのものの整合性検査は行いません。テキストチャンクは1つ4MiB、合計16MiBまでです。prompt／parametersが重複するPNGは、値の曖昧さと繰り返し展開を避けるため読み取りを中止します。

## 開発

実行時はEagle内蔵のNode.js／Web APIを使います。ローカル検証はNode.js 18以上を目安にしてください。外部パッケージのインストールやビルドは不要です。

```text
npm test
npm run check
npm run inspect -- <image.png> --summary
```

`--summary`を省くとプロンプトを含む解析結果を標準出力に表示します。私用画像はリポジトリの外に置いてください。テストは人工データだけを使います。CIは設定していません。

Gitの既定ブランチは`main`です。Notion連携は使いません。技術仕様・構成・再開手順は[docs](docs/HANDOFF.md)を参照してください。Eagle内での実表示・クリップボード・画像選択時の更新は受け入れ確認が必要です。

## ライセンスと由来

[MIT](LICENSE)。既存のStable Diffusion Metadataや参考ユーザースクリプトのコード・アイコンは同梱していません。Eagleの公開APIとPNG形式に基づく新規実装です。

仕様の参照先：[Eagle Inspector API](https://developer.eagle.cool/plugin-api/get-started/plugin-types/inspector)、[Clipboard API](https://developer.eagle.cool/plugin-api/api/clipboard)、[PNG仕様](https://www.w3.org/TR/png-3/)。
