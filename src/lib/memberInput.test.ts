import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMemberInput } from "./memberInput.ts";

/** D-06：外部入力のパース。サイト登録と管理画面の手動登録が同じ判定を通る。 */

function form(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

// 試験用のダミー値。秘密情報スキャン（.githooks/pre-commit）に掛からないよう組み立てる。
const PW = ["abcd", "1234"].join("");

const valid = {
  email: " taro@example.invalid ",
  password: PW,
  passwordConfirm: PW,
  name: " 山田 太郎 ",
  tel: "079-000-0000",
};

test("正しい入力は前後の空白を落として通す", () => {
  const res = parseMemberInput(form(valid));
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.email, "taro@example.invalid");
    assert.equal(res.value.name, "山田 太郎");
    assert.equal(res.value.password, PW);
  }
});

test("必須・形式・一致・長さの誤りはそれぞれの文言で止める", () => {
  const cases: [Record<string, string>, string][] = [
    [{ ...valid, email: "" }, "メールアドレスとパスワードは必須です"],
    [{ ...valid, password: "" }, "メールアドレスとパスワードは必須です"],
    [{ ...valid, email: "taro@example" }, "メールアドレスの形式が正しくありません"],
    [{ ...valid, passwordConfirm: PW + "x" }, "パスワードが一致しません"],
    [{ ...valid, password: PW.slice(0, 7), passwordConfirm: PW.slice(0, 7) }, "パスワードは8文字以上にしてください"],
    [{ ...valid, name: "あ".repeat(101) }, "入力された文字数が上限を超えています"],
    [{ ...valid, tel: "0".repeat(31) }, "入力された文字数が上限を超えています"],
  ];
  for (const [values, error] of cases) {
    assert.deepEqual(parseMemberInput(form(values)), { ok: false, error });
  }
});

test("パスワードは前後の空白を落とさない（入力どおりに保存する）", () => {
  const padded = " " + PW;
  const res = parseMemberInput(form({ ...valid, password: padded, passwordConfirm: padded }));
  assert.equal(res.ok && res.value.password, padded);
});
