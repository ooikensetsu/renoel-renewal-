import { test } from "node:test";
import assert from "node:assert/strict";
import { planAgencyRestore } from "./agencyRestore.ts";

/** D-06：取扱会社の保存・統合の戻し（2026-10-22）。操作後に人が直した物件を上書きしないことを固定する。 */

const row = (id: number, agencyName: string, agencyTel: string | null) => ({
  id,
  agencyName,
  agencyAddress: null,
  agencyTel,
  agencyLicense: null,
});

test("操作の直後の値のままの物件だけを戻す。変わった物件と消えた物件は飛ばす", () => {
  const plan = planAgencyRestore(
    [row(1, "A社", "旧1"), row(2, "A社", "旧2"), row(3, "A社", null)],
    { agencyTel: "新" },
    [row(1, "A社", "新"), row(2, "A社", "人が直した")]
  );
  assert.deepEqual(plan.restore, [row(1, "A社", "旧1")]);
  assert.deepEqual(plan.changedSince, [2]);
  assert.deepEqual(plan.missing, [3]);
});

test("統合の戻しは会社名で判定する（統合先の名前のままなら旧表記へ戻す）", () => {
  const plan = planAgencyRestore(
    [row(1, "（株）A", "1"), row(2, "(株) A", "2")],
    { agencyName: "(株)A" },
    [row(1, "(株)A", "1"), row(2, "別の会社", "2")]
  );
  assert.deepEqual(plan.restore.map((r) => r.agencyName), ["（株）A"]);
  assert.deepEqual(plan.changedSince, [2]);
});
