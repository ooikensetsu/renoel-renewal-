import { test } from "node:test";
import assert from "node:assert/strict";
import { planConfirmationRecord, MAX_CONFIRMATION_NOTE_LENGTH } from "./propertyConfirmation.ts";
import { CONFIRMATION_STATUSES, transactionCategory } from "../config/property.ts";

const base = { ids: [3, 1, 2], status: "有", note: "", expectedCount: 3 };

test("5つの状況はどれも記録できる。中止・済だけ非表示にする", () => {
  const hides = CONFIRMATION_STATUSES.map((status) => {
    const plan = planConfirmationRecord({ ...base, status });
    assert.equal(plan.ok, true, status);
    return plan.ok && plan.hides;
  });
  assert.deepEqual(hides, [false, false, false, true, true]);
});

test("選択肢に無い状況（公開状態の名前を含む）は記録しない", () => {
  for (const status of ["一般公開", "非表示", "", null, 1, "有 "]) {
    assert.equal(planConfirmationRecord({ ...base, status }).ok, false, String(status));
  }
});

test("件数・物件IDの検証は一括変更と同じ（数が合わない・重複・空は中止）", () => {
  assert.equal(planConfirmationRecord({ ...base, expectedCount: 2 }).ok, false);
  assert.equal(planConfirmationRecord({ ...base, ids: [1, 1, 2] }).ok, false);
  assert.equal(planConfirmationRecord({ ...base, ids: [], expectedCount: 0 }).ok, false);
  assert.equal(planConfirmationRecord({ ...base, ids: [1, "2", 3] }).ok, false);
});

test("1件だけの記録（物件の詳細画面）も同じ関数で通る", () => {
  const plan = planConfirmationRecord({ ids: [7], status: "商談", note: undefined, expectedCount: 1 });
  assert.deepEqual(plan, { ok: true, ids: [7], status: "商談", note: null, hides: false, expectedCount: 1 });
});

test("メモは前後の空白を落とし、空なら null。上限を超えたら中止", () => {
  const trimmed = planConfirmationRecord({ ...base, note: "  電話で確認  " });
  assert.equal(trimmed.ok && trimmed.note, "電話で確認");
  assert.equal(planConfirmationRecord({ ...base, note: "x".repeat(MAX_CONFIRMATION_NOTE_LENGTH) }).ok, true);
  assert.equal(planConfirmationRecord({ ...base, note: "x".repeat(MAX_CONFIRMATION_NOTE_LENGTH + 1) }).ok, false);
  assert.equal(planConfirmationRecord({ ...base, note: 5 }).ok, false);
});

test("取引態様：athome と REINS の表記を同じ分類に読み替える", () => {
  const cases: [string | null, string][] = [
    ["一般媒介", "general"], ["一般", "general"],
    ["専任媒介", "exclusive"], ["専任", "exclusive"],
    ["専属専任媒介", "exclusiveSole"], ["専属", "exclusiveSole"],
    ["売主", "seller"], ["売り主", "seller"], [" 売主 ", "seller"],
    ["媒介", "other"], ["代理", "other"], ["", "other"], [null, "other"],
  ];
  for (const [value, expected] of cases) assert.equal(transactionCategory(value), expected, String(value));
});
