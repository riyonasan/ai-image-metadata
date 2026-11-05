# Architecture

ビルドなしのHTML／CSS／CommonJS。実行時依存はEagle APIとNode標準ライブラリのみ。

- `src/png.js`: PNGを非同期に読み、IDATを飛ばしてparameters／promptだけを抽出。tEXt／zTXt／iTXt対応。圧縮展開量を制限し、workflowは解釈しない。
- `src/metadata.js`: 整形済みparametersを解析、または対応ComfyUIノードから表示用の生成経路を構成。純粋関数。
- `src/inspector.js`: Eagleから選択画像を取得し、DOMをtextContentで構成。クリップボードAPI、テーマ、折りたたみを担当。古い非同期読み取り結果は破棄する。
- `scripts/inspect.js`: 任意のローカルPNGを同じ解析経路で検証するCLI。結果はファイルに保存しない。

Inspector作成時・表示時・手動再読み込み時に更新する。未知の選択変更イベントやリサイズAPIは仮定しない。Eagle側の再生成・表示イベントが画像選択を反映するかは実機で確認が必要。

localStorageにはセクションの開閉だけを保存する。画像、プロンプト、パス、解析結果は永続化しない。CSPは外部リソースを許可せず、メタデータをHTMLやコードとして扱わない。

テストはNode組み込みテストランナーで、PNG形式、解析、クリップボードへの値、非同期更新の競合を検証する。DOMのテストは最小限の代用品を使い、実ブラウザのレイアウトやEagle動作を証明するものではない。
