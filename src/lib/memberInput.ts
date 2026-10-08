/**
 * 会員登録フォームの入力チェック。サイトからの登録（registerUser）と
 * 管理画面からの手動登録（createUserByAdmin）で共用する（D-09）。
 * DBに触らない純関数にして、memberInput.test.ts で固定している（D-06）。
 */

// S-08：長さの上限と形式の判定は config/inputLimits.ts に集約している（D-19）。
// node の標準テストランナーから読めるよう、相対パス＋拡張子つきで読む。
import { INPUT_LIMITS, isValidEmail, withinLimit } from "../config/inputLimits.ts";

/** 新しく登録した会員の会員種別。サイト登録・手動登録で同じ値を入れる。 */
export const NEW_MEMBER_TYPE = "MEMBER";
/** パスワードの最低文字数。 */
export const MIN_PASSWORD_LENGTH = 8;

export type MemberInput = {
  email: string;
  password: string;
  name?: string;
  tel?: string;
  zip?: string;
  address?: string;
};

/** フォームの値を読み、登録できる形かを確かめる。エラー文は利用者にそのまま出す。 */
export function parseMemberInput(
  formData: FormData
): { ok: true; value: MemberInput } | { ok: false; error: string } {
  const email = formData.get("email")?.toString()?.trim();
  const password = formData.get("password")?.toString();
  const passwordConfirm = formData.get("passwordConfirm")?.toString();
  const name = formData.get("name")?.toString()?.trim();
  const tel = formData.get("tel")?.toString()?.trim();
  const zip = formData.get("zip")?.toString()?.trim();
  const address = formData.get("address")?.toString()?.trim();

  if (!email || !password) {
    return { ok: false, error: "メールアドレスとパスワードは必須です" };
  }
  if (!isValidEmail(email)) {
    return { ok: false, error: "メールアドレスの形式が正しくありません" };
  }
  if (password !== passwordConfirm) {
    return { ok: false, error: "パスワードが一致しません" };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください` };
  }
  if (
    !withinLimit(name, INPUT_LIMITS.name) ||
    !withinLimit(tel, INPUT_LIMITS.tel) ||
    !withinLimit(zip, INPUT_LIMITS.zip) ||
    !withinLimit(address, INPUT_LIMITS.address)
  ) {
    return { ok: false, error: "入力された文字数が上限を超えています" };
  }
  return { ok: true, value: { email, password, name, tel, zip, address } };
}
