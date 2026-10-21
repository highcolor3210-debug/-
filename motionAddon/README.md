# Motion Addon

プレイヤーの動きを作り直すリソースパック（スクリプトなし）。nextAdventure とは別のアドオン。

## いま入っている動き（Ver.0.1.0）
| 場面 | 三人称 | 一人称 |
|---|---|---|
| 歩き | 体のひねり・上下の揺れ | （バニラのまま） |
| 走り | 前傾、腕を少し前に | 持ち物を下げて傾ける |
| ジャンプ | 空中で腕を広げ、脚を前後に | 上りで下がり、下りで上がる |
| 着地 | 体が沈む | 持ち物が沈む |
| 剣の振り | 右から左へ横に払う（腕はバニラの振りを置き換え） | 横に払う動きを足す |

剣は `minecraft:is_sword` タグの付いたアイテムで動く。

## しくみ
- 一人称の腕を動かすため、`entity/player.entity.json`（バニラのプレイヤー）を置き換えている。
  中身はバニラ（Mojang/bedrock-samples 1.26.50）そのままに、変数とアニメーションを**足しただけ**。
  そのため、同じファイルを置き換える他のアドオンとは一緒に使えない。
- アニメーションは `animations/motion.player.animation.json`。

## フォルダ
- `motionAddon_RP/` リソースパック
- `tools/build_player_entity.py` バニラの player.entity.json（`tools/vanilla/`）に足して書き出す。
  マイクラの更新でバニラのファイルが変わったら、`tools/vanilla/player.entity.json` を差し替えて実行し直す
- `tools/preview/` 確認画像を作る道具（Molang を評価して、three.js で人型を描く）
  - `node tools/preview/render.cjs <出力フォルダ> <three.min.js のパス>`（Playwright と Chromium が必要）
  - 座標の向きは Blockbench と同じ扱い。マイクラ本体の描き方（一人称の画角など）までは再現しない

## パッケージ
`motionAddon_RP` フォルダを zip にして拡張子を `.mcpack` にする。
