# Motion Addon

プレイヤーの動きを作り直すリソースパック（スクリプトなし）。nextAdventure とは別のアドオン。

## Ver.0.2.0
- **ひじ・ひざ**を追加。腕と脚を上下2つに分けて、プレイヤーのスキンで描く
- 三人称：歩き・走りのキーフレームのサイクル（ひじの曲げ、ひざの曲げ伸ばし、前傾、体のひねり、上下の弾み）、
  ジャンプ（上りでひざを抱え、下りで伸ばす）、着地（ひざを曲げて沈む）、剣の振り（振りかぶって斜めに切る）
- 一人称：剣の振り（右上へ振りかぶり、画面の真ん中を通って左下へ切り下ろす）、走りで持ち物を下げる、ジャンプ・着地の上下
- 剣は `minecraft:is_sword` タグの付いたアイテムで動く

## 体型
スキンが太い腕（スティーブ）か細い腕（アレックス）かは Molang で分からないので、パックを2つ用意している。
- `Motion Addon`：スティーブ体型（`python tools/build.py wide`）
- `Motion Addon（アレックス体型）`：アレックス体型（`python tools/build.py slim <出力先>`。manifest の uuid は別）

キャラクタークリエイターのスキンとマーケットプレイスのスキンは描き方が違うので、関節を使わずバニラの腕・脚のまま
（`q.is_persona_or_premium_skin`）。動き（歩き・走り・剣の振り）はそのまま付く。

## しくみ
- `entity/player.entity.json`（バニラのプレイヤー）を置き換える。中身は Mojang/bedrock-samples 1.26.50 に
  変数・アニメーション・描き方を**足しただけ**（`tools/build.py` が作る）。同じファイルを置き換える他のアドオンとは一緒に使えない
- 関節つきの腕・脚はマントと同じやり方：別のモデル（`models/entity/motion_limbs.geo.json`）を同じ骨の名前で重ねて、
  別の描き方（`render_controllers/motion.player.render_controllers.json`）で出し、バニラの腕・脚は隠す
- 上腕・ふとももはバニラと同じ骨なので、バニラのアニメーション（弓を引く、盾を構える など）もそのまま効く。
  前腕・すねはこのアドオンの骨
- 手に持つ物はバニラの腕の rightItem に付く（ひじがない）ので、前腕を曲げたぶん rightItem をひじ中心に回した位置へ動かしている
- 鎧（腕・脚）はバニラの骨に付くので、ひじ・ひざでは曲がらない

## 作り方・確認
- `python tools/build.py [wide|slim] [出力先]`：モデル・描き方・アニメーション・player.entity.json を作る。
  数値（キーフレーム）は build.py の `WALK` `RUN` `SLASH_TP` `SLASH_FP` など
- `node tools/preview/render.cjs <出力フォルダ> <three.min.js> <スキンの png>`：確認画像を作る（Playwright と Chromium が必要）。
  Molang を評価して、スキンを貼った人型を three.js で描く。`MOTION_RP=<出力先> MOTION_SLIM=1` でアレックス体型
- マイクラの更新でバニラのファイルが変わったら、`tools/vanilla/` を差し替えて build.py を実行し直す

## パッケージ
リソースパックのフォルダを zip にして拡張子を `.mcpack` にする。
