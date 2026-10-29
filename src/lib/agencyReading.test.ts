import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareAgencies,
  isValidReading,
  normalizeReading,
  readingFromTokens,
  stripCorporateForm,
} from "./agencyReading.ts";

/** D-06：取扱会社の50音順（2026-10-19）。物件確認依頼書の並びと、読みの推定・入力の検証を固定する。 */

test("会社の種類の表記を外す（全角・半角の括弧、株式会社、㈱）", () => {
  assert.equal(stripCorporateForm("（株）ここいえ姫路店"), "ここいえ姫路店");
  assert.equal(stripCorporateForm("タカセ不動産(株) 姫路店"), "タカセ不動産 姫路店");
  assert.equal(stripCorporateForm("株式会社モリシタハウス"), "モリシタハウス");
  assert.equal(stripCorporateForm("㈲一心マイホーム"), "一心マイホーム");
  assert.equal(stripCorporateForm("（同）K＇sクルー"), "K'sクルー");
});

test("読みはひらがなにそろえる（カタカナ・半角カナ・全角英数・引用符・空白）", () => {
  assert.equal(normalizeReading("タカセフドウサン　ヒメジテン"), "たかせふどうさん ひめじてん");
  assert.equal(normalizeReading("ﾊﾘﾏ"), "はりま");
  assert.equal(normalizeReading("ＪＵＮ　ＨＯＭＥ"), "JUN HOME");
  assert.equal(normalizeReading("i’m home"), "i'm home");
  assert.equal(normalizeReading("センチュリー21"), "せんちゅりー21");
});

test("読みとして受け付けるのはひらがな・長音・英数字・空白・一部の記号だけ（漢字が残ったら弾く）", () => {
  assert.ok(isValidReading("あかしかじしょ"));
  assert.ok(isValidReading("フロンティア"));
  assert.ok(isValidReading("i'm home"));
  assert.ok(!isValidReading("髙おかえすてーと"));
  assert.ok(!isValidReading("えいゆーじゅう販"));
  assert.ok(!isValidReading(""));
});

test("形態素解析の結果から読みを作る（英字はそのまま・括弧や空白は外す）", () => {
  assert.equal(
    readingFromTokens([
      { surface_form: "赤鹿", reading: "アカシカ" },
      { surface_form: "地所", reading: "ジショ" },
    ]),
    "あかしかじしょ"
  );
  assert.equal(
    readingFromTokens([
      { surface_form: "みらい", reading: "ミライ" },
      { surface_form: "エステート", reading: "エステート" },
      { surface_form: "KOBE", reading: "*" },
    ]),
    "みらいえすてーとKOBE"
  );
  assert.equal(
    readingFromTokens([
      { surface_form: "センチュリー", reading: "センチュリー" },
      { surface_form: "21" },
      { surface_form: " " },
      { surface_form: "（", reading: "（" },
      { surface_form: "兵庫", reading: "ヒョウゴ" },
      { surface_form: "）", reading: "）" },
    ]),
    "せんちゅりー21ひょうご"
  );
});

test("50音順：読みのある会社が先、濁音は清音の隣、読みが同じなら会社名で並べる", () => {
  const sorted = [
    { agencyName: "(株)タテイワ", reading: null },
    { agencyName: "播磨不動産（株）", reading: "はりまふどうさん" },
    { agencyName: "(株)バズエステート", reading: "ばずえすてーと" },
    { agencyName: "（株）ここいえ姫路店", reading: "ここいえひめじてん" },
    { agencyName: "(株)ここいえ 姫路店", reading: "ここいえひめじてん" },
    { agencyName: "(株)赤鹿地所", reading: "あかしかじしょ" },
  ]
    .sort(compareAgencies)
    .map((a) => a.agencyName);
  assert.deepEqual(sorted, [
    "(株)赤鹿地所",
    "(株)ここいえ 姫路店",
    "（株）ここいえ姫路店",
    "(株)バズエステート",
    "播磨不動産（株）",
    "(株)タテイワ",
  ]);
});
