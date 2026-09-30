/**
 * D-19：公開ページで使う固定画像（ヒーロー画像・事例写真など）の所在は
 * このファイルだけに書く。物件画像は別（Supabase Storage / config/images.ts）。
 *
 * 【なぜ作ったか】
 * 6ファイルが `https://okazaki-bot.github.io/chuko-fudousan-design/` を
 * 画像の取得元として直書きしていた。第三者のGitHub Pages配下であり、
 * 2026-08-31 の検品時点でホストごと消滅している（ルートも 404）。
 * つまり本番でこれらの画像は既に表示されていない。
 *
 * 【いまの状態】
 * 差し替える画像を当方で用意することはできない（推測で別の写真を当てない。D-03）。
 * そのため全て null にしてある。null の項目は画像を出さず、
 * SiteImage コンポーネントが「画像未設定」の枠を描く。壊れた <img> は出さない。
 *
 * 【差し替え方】
 * 1. 画像を public/assets/img/ に置く
 * 2. 下の該当キーを "/assets/img/ファイル名" に書き換える
 * 以上。ページ側は触らなくてよい。
 */

/** 固定画像のキー。ページから参照するのはこの名前だけ。 */
export type SiteImageName =
  | "pageHero"
  | "gallery"
  | "case1"
  | "case2"
  | "case3"
  | "case4"
  | "case5"
  | "case6"
  | "showroomSaku"
  | "showroomMiyota"
  | "showroomTateshina";

/**
 * キー → 画像のURL。null は「まだ用意されていない」。
 * 【要確認】全項目とも差し替える画像を大井建設工業から受領する必要がある。
 */
export const SITE_IMAGES: Record<SiteImageName, string | null> = {
  /** 各ページ上部の帯に敷く写真 */
  pageHero: null,
  /** 物件一覧・会員限定物件の帯に敷く写真 */
  gallery: null,
  /** 施工事例1〜6 */
  case1: null,
  case2: null,
  case3: null,
  case4: null,
  case5: null,
  case6: null,
  /** ショールーム（佐久平／御代田／立科） */
  showroomSaku: null,
  showroomMiyota: null,
  showroomTateshina: null,
};

/** 画像のURL。未設定なら null。 */
export function siteImage(name: SiteImageName): string | null {
  return SITE_IMAGES[name];
}
