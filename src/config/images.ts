/**
 * D-19：物件画像の決めごとはこのファイルだけに書く。
 * 上限を変えるときは、ここ1箇所を直せばアップロード画面と保存処理の両方に効く。
 *
 * 秘密情報（Supabase のキー）はここに書かない（D-08 / S-01）。.env から読む。
 */

/** 保管先のバケット名。Supabase の Storage に同名のバケットを作っておく。 */
export const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "property-images";

/** 1枚あたりの上限（バイト）。5MB。 */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** 1物件あたりの枚数の上限。無料枠（1GB）を使い切らないための歯止め。 */
export const MAX_IMAGES_PER_PROPERTY = 20;

/**
 * S-07：バケットは非公開にし、画像は都度この秒数だけ有効な署名付きURLで配信する。
 * 会員限定物件の画像が、URL 推測だけで未ログインに見えてしまうのを防ぐ。
 * 物件ページは毎回サーバーで描画される（force-dynamic）ため、閲覧のたびに新しいURLが出る。
 * 1時間：1回の閲覧セッション中に画像が切れない程度に短く。
 */
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** 受け付ける拡張子。小文字で比較する。 */
export const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp"] as const;

/** 拡張子 → Content-Type。Storage へ渡す。 */
export const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** 人が読める上限の表記（画面の案内文用）。 */
export const MAX_FILE_LABEL = "5MB";

/**
 * athome 取得画像の一括登録（scripts/upload-athome-images.mjs）で縮小・再圧縮するときの設定（2026-10-13）。
 * 原本は最大640pxなので、長辺640pxは実質「拡大しない」の意味。画質だけ70に揃える。
 * モリシタ版は2万枚超のため 480px・画質55 にしたが、RENOEL は約4,300枚で容量に余裕がある
 * （1枚およそ40〜60KB → 合計約200〜260MB の見込み・推定）ため、詳細ページでの粗さを避けて原寸を保つ。
 */
export const BULK_RESIZE_MAX_PX = 640;
export const BULK_JPEG_QUALITY = 70;
