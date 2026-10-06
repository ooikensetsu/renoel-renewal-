/**
 * 物件画像のファイル名の解釈。
 *
 * 一括アップロードでは、ファイル名の先頭にある**掲載会社管理番号**で
 * どの物件の画像かを決める（2026-10-06 大野の指示で物件管理番号から変更）。並び順は続く連番で決める。
 *
 *   b01771-004624_1.jpg  → 掲載会社管理番号 b01771-004624 の 1枚目
 *   b01771-004624_02.JPG → 同じ物件の 2枚目
 *   b01771-004624.jpg    → 同じ物件の 1枚目（連番省略）
 *
 * 区切りは「_」だけ。掲載会社管理番号には「-数字」で終わるもの（例: …-004624）があり、
 * 「-」を区切りにすると番号と連番の境目が決められないため。
 * 番号とDBの物件の突き合わせはサーバー側（完全一致・1件だけのとき）で行う。
 *
 * D-06：ここを間違えると別の物件に画像が付く。機械で確かめられる形にしておく。
 */

// 相対パス＋拡張子つきなのは、node の標準テストランナーから読めるようにするため
// （src/lib/mailPayload.ts と同じ理由）。
import { ALLOWED_EXTENSIONS } from "../config/images.ts";
import { isBlankMark } from "./blank.ts";

export type ParsedImageName =
  | { ok: true; listingCompanyNo: string; order: number; ext: string }
  | { ok: false; reason: string };

/** 拡張子を取り出す（小文字）。 */
export function extensionOf(fileName: string): string {
  const m = fileName.match(/\.([A-Za-z0-9]+)$/);
  return m ? m[1].toLowerCase() : "";
}

export function parseImageFileName(fileName: string): ParsedImageName {
  // macOS は日本語のファイル名を濁点分離（NFD）で渡すことがある。DBの値（NFC）にそろえる。
  const name = fileName.normalize("NFC").trim();
  const ext = extensionOf(name);

  if (ext === "") {
    return { ok: false, reason: "拡張子がありません" };
  }
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return {
      ok: false,
      reason: `対応していない形式です（${ALLOWED_EXTENSIONS.join(" / ")} のみ）`,
    };
  }

  const base = name.slice(0, name.length - ext.length - 1);
  // 末尾の「_数字（1〜4桁）」を連番として切り出す。無ければ1枚目。
  const m = base.match(/^(.*)_(\d{1,4})$/);
  const listingCompanyNo = (m ? m[1] : base).trim();
  if (listingCompanyNo === "" || isBlankMark(listingCompanyNo)) {
    return {
      ok: false,
      reason: "ファイル名が「掲載会社管理番号_連番.拡張子」の形になっていません",
    };
  }

  return {
    ok: true,
    listingCompanyNo,
    order: m ? Number(m[2]) : 1,
    ext,
  };
}

/** Storage 上の保存先。物件ごとにフォルダを分ける。 */
export function storagePathFor(objMngNo: string, order: number, ext: string): string {
  return `${objMngNo}/${String(order).padStart(3, "0")}.${ext}`;
}
