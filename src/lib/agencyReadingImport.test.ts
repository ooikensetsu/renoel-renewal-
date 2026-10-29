import { test } from "node:test";
import assert from "node:assert/strict";
import { planReadingImport } from "./agencyReadingImport.ts";

/** D-06：取扱会社の読みの一括入力（2026-10-26）。人が直した読みを上書きしないことを固定する。 */

const ctx = {
  knownNames: new Set(["（株）GROOVE", "（株）髙岡エステート", "（株）LEMO", "B住建", "C建設"]),
  current: new Map([
    ["（株）GROOVE", { reading: "GROOVE", estimated: true }],
    ["（株）LEMO", { reading: "れも", estimated: true }],
    ["B住建", { reading: "びーじゅうけん", estimated: false }],
  ]),
};

test("未登録は入れ、推定のままは置き換え、同じ読みは何もしない。カタカナはひらがなにそろえる", () => {
  const plan = planReadingImport(
    [
      { 取扱会社名: "（株）髙岡エステート", 読み: "タカオカエステート" },
      { 取扱会社名: "（株）GROOVE", 読み: "ぐるーぶ" },
      { 取扱会社名: "（株）LEMO", 読み: "れも" },
    ],
    ctx
  );
  assert.deepEqual(plan.create, [{ agencyName: "（株）髙岡エステート", reading: "たかおかえすてーと" }]);
  assert.deepEqual(plan.replace, [{ agencyName: "（株）GROOVE", before: "GROOVE", reading: "ぐるーぶ" }]);
  assert.deepEqual(plan.same, ["（株）LEMO"]);
});

test("人が直した読みは上書きしない。知らない会社・漢字が残る読み・空欄は書かない", () => {
  const plan = planReadingImport(
    [
      { 取扱会社名: "B住建", 読み: "びいじゅうけん" },
      { 取扱会社名: "D社", 読み: "でぃーしゃ" },
      { 取扱会社名: "C建設", 読み: "しー建設" },
      { 取扱会社名: "C建設", 読み: "" },
    ],
    ctx
  );
  assert.deepEqual(plan.create, []);
  assert.deepEqual(plan.replace, []);
  assert.deepEqual(plan.confirmedDiffers, [{ agencyName: "B住建", current: "びーじゅうけん", incoming: "びいじゅうけん" }]);
  assert.deepEqual(plan.unknown, ["D社"]);
  assert.deepEqual(plan.invalid, [{ agencyName: "C建設", reading: "しー建設" }]);
});
