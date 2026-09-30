/**
 * D-19：外部から受け取る文字列の長さの上限は、このファイルだけに書く。
 *
 * 【なぜ集約するか】
 * 以前は registerUser.ts と inquiry.ts がそれぞれ LIMITS を持ち、
 * updateMyProfile には上限が無かった。同じ User.name に対して
 * 「登録時は100字」「更新時は無制限」という2通りの規則が並んでいた。
 * 上限を変えるときに直し漏れる形になっていたため、1箇所にまとめる。
 *
 * S-08：DBの列は text（長さ無制限）なので、歯止めはアプリ側にしかない。
 */
export const INPUT_LIMITS = {
  /** 氏名 */
  name: 100,
  /** メールアドレス（RFC 5321 の上限） */
  email: 254,
  /** 電話番号 */
  tel: 30,
  /** 郵便番号 */
  zip: 10,
  /** 住所 */
  address: 200,
  /** 問い合わせ本文 */
  message: 4000,
} as const;

/**
 * メールアドレスとして受け付けてよい形か。
 * 厳密な検証はしない（RFC 5322 に完全準拠しても実在確認にはならない）。
 * ここで弾くのは、明らかに形になっていない値と、長すぎる値だけ。
 */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= INPUT_LIMITS.email;
}

/**
 * 任意項目が上限に収まっているか。未入力（undefined / null / 空）は収まっている扱い。
 * 必須かどうかの判定は呼び出し側で行う。
 */
export function withinLimit(value: string | null | undefined, max: number): boolean {
  return !value || value.length <= max;
}
