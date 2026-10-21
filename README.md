# nextAdventure

マイクラ統合版の大規模ファンタジーRPGアドオン。現在 Ver.0.4.8（魔法編）。

## フォルダ
- `nextAdventure_BP/` ビヘイビアパック（アイテム・エンティティ・ブロック・スクリプト）
- `nextAdventure_RP/` リソースパック（テクスチャ・モデル・アニメーション・HUD の JSON UI）
- `tools/` テクスチャを作る Python スクリプト（Pillow が必要）

## 操作（杖）
- 「壊す」ボタン：押して詠唱開始、離して発動
  - 押している間、詠唱が終わったあとは溜まっていく
  - 詠唱の途中で離したら、詠唱が終わった瞬間に発動
- 「置く（使う）」ボタンを押し続ける：魔法の選択。視点を動かした方向のマスを選び、離して決定（詠唱・溜めの最中は出ない）
- 詠唱中も選択中も普通に歩ける・走れる。杖ではブロックを壊せない

## スクリプト（BP/scripts）
- `main.js` 入力・毎tick処理・後片付け
- `magic/SpellData.js` 魔術の定義（火弾・土壁）と詠唱時間の計算。土壁は溜めなし（詠唱が終わると立つ）
- `magic/CastingSystem.js` 詠唱・溜め・発射（プレイヤーと魔術師で共通）
- `magic/SpellUpdater.js` 発射後の移動・命中
- `magic/CollisionDetector.js` 魔術同士の接触検出（空間ハッシュ）
- `magic/InteractionResolver.js` 作用量の削り合い・貫通（API非依存）
- `magic/SpellInteractions.js` 衝突結果の反映、壁への命中
- `magic/WallSystem.js` 土壁
- `magic/AttributeRules.js` 属性相性 / `magic/Weakening.js` 残存率と弱体化
- `magic/Contracts.js` 精霊の契約と精霊の力
- `magic/Loadout.js` 杖の魔術スロット（最大4つ）と十字の選択
- `magic/Mana.js` 自分の魔力（単純魔術で使う）
- `magic/Debug.js` デバッグ本（魔力無限・精霊の力無限の切り替え）
- `magic/MageAI.js` 魔術師のAI / `magic/Hud.js` 画面表示（HUD へのデータ送信・アクションバー）

## 設計
魔術体系・設計草案 v1.0 に基づく。@minecraft/server 2.10.0 / @minecraft/server-ui 2.0.0。

## テクスチャ
- `tools/gen_assets3.py` 土壁ブロックと選択表示のアイコン（font/glyph_E1.png）
- `tools/gen_assets4.py` デバッグ本
- `tools/gen_hud_ui.py` HUD（ui/hud_screen.json）と HUD の画像（textures/ui/na/）。gen_assets3.py のあとに実行

## HUD
魔力ゲージ（空腹ゲージの上・紫）、詠唱・溜めのバー（照準の下）、魔法の選択表示は JSON UI で描く。
スクリプトは「na_hud」を含むデータ文字列をタイトルで送り、UI がいま出ているタイトルの文字列を読んで画像を出し分ける（そのタイトルは画面に出ない）。
魔力ゲージは空腹ゲージと同じバニラのパネル（PC 用・タッチ用）に入れている。

## パッケージ
両パックのフォルダを zip にして拡張子を `.mcaddon` にする。
