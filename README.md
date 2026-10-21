# nextAdventure

マイクラ統合版の大規模ファンタジーRPGアドオン。現在 Ver.0.4.0（魔法編）。

## フォルダ
- `nextAdventure_BP/` ビヘイビアパック（アイテム・エンティティ・ブロック・スクリプト）
- `nextAdventure_RP/` リソースパック（テクスチャ・モデル・アニメーション・グリフ）
- `tools/` テクスチャを作る Python スクリプト（Pillow が必要）

## スクリプト（BP/scripts）
- `main.js` 入力・毎tick処理・後片付け
- `magic/SpellData.js` 魔術の定義（火弾・土壁）と詠唱時間の計算
- `magic/CastingSystem.js` 詠唱・溜め・発射（プレイヤーと魔術師で共通）
- `magic/SpellUpdater.js` 発射後の移動・命中
- `magic/CollisionDetector.js` 魔術同士の接触検出（空間ハッシュ）
- `magic/InteractionResolver.js` 作用量の削り合い・貫通（API非依存）
- `magic/SpellInteractions.js` 衝突結果の反映、壁への命中
- `magic/WallSystem.js` 土壁
- `magic/AttributeRules.js` 属性相性 / `magic/Weakening.js` 残存率と弱体化
- `magic/Contracts.js` 精霊の契約と精霊の力
- `magic/Loadout.js` 杖の魔術スロットと五角形の選択表示
- `magic/MageAI.js` 魔術師のAI / `magic/Hud.js` アクションバー表示

## 設計
魔術体系・設計草案 v1.0 に基づく。@minecraft/server 2.10.0。

## パッケージ
両パックのフォルダを zip にして拡張子を `.mcaddon` にする。
