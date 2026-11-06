import { test } from "node:test";
import assert from "node:assert/strict";
import { auditData, changedFieldNames, AUDIT_MAX_TARGET_IDS } from "./auditEntry.ts";

const actor = { userId: 7, email: "admin@example.invalid" };

test("変わった項目の名前だけを返し、値は返さない", () => {
  const before = { title: "A", priceMan: 1000, memo: null, builtAt: new Date("2020-01-01") };
  const after = { title: "A", priceMan: 1200, memo: "", builtAt: new Date("2020-01-01") };
  const labels: Record<string, string> = { title: "物件名", priceMan: "価格" };
  assert.deepEqual(changedFieldNames(before, after, (k) => labels[k] ?? k), ["価格"]);
});

test("after に無い項目は比べない（フォームに無い列を変更扱いしない）", () => {
  assert.deepEqual(changedFieldNames({ a: 1, b: 2 }, { a: 1 }), []);
});

test("日付は時刻で比べる・bigint は文字列で比べる", () => {
  assert.deepEqual(
    changedFieldNames({ d: new Date("2020-01-01"), n: BigInt(5) }, { d: new Date("2020-01-02"), n: BigInt(5) }),
    ["d"]
  );
});

test("未定義の操作コードは書かない", () => {
  assert.throws(() => auditData(actor, { action: "NO_SUCH" as never }));
});

test("対象IDは文字列にし、複数なら件数を補う", () => {
  const d = auditData(actor, { action: "PROPERTY_BULK_DISCLOSURE", targetType: "PROPERTY", targetIds: [3, 1] });
  assert.deepEqual(d.targetIds, ["3", "1"]);
  assert.equal(d.count, 2);
  assert.equal(d.actorEmail, actor.email);
});

test("対象IDが上限を超えたら件数だけ残す", () => {
  const ids = Array.from({ length: AUDIT_MAX_TARGET_IDS + 1 }, (_, i) => i + 1);
  const d = auditData(actor, { action: "PROPERTY_IMPORT", targetType: "PROPERTY", targetIds: ids });
  assert.deepEqual(d.targetIds, []);
  assert.equal(d.count, AUDIT_MAX_TARGET_IDS + 1);
});
