import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planBulkDisclosure,
  checkFoundCount,
  MAX_BULK_DISCLOSURE_ITEMS,
} from "./bulkDisclosure.ts";
import { DISCLOSURE_LEVEL } from "../config/security.ts";

/**
 * D-06 / D-17：一括更新は「数えて、想定と合うときだけ書く」。
 * ここで守りたいのは、選んだ件数と違う件数を黙って書き換えないこと。
 */

test("正しい指定は通り、3つの公開レベルすべてを受け付ける", () => {
  for (const level of Object.values(DISCLOSURE_LEVEL)) {
    const plan = planBulkDisclosure({ ids: [1, 2, 3], level, expectedCount: 3 });
    assert.deepEqual(plan, { ok: true, ids: [1, 2, 3], level, expectedCount: 3 });
  }
});

test("1件も選ばれていなければ中止", () => {
  assert.equal(planBulkDisclosure({ ids: [], level: 0, expectedCount: 0 }).ok, false);
  assert.equal(planBulkDisclosure({ ids: "1,2", level: 0, expectedCount: 2 }).ok, false);
});

test("定義に無い公開レベルは中止（会員限定のつもりが公開、を防ぐ）", () => {
  for (const level of [3, -1, "1", null, 1.5]) {
    assert.equal(planBulkDisclosure({ ids: [1], level, expectedCount: 1 }).ok, false, String(level));
  }
});

test("物件IDが整数でなければ中止", () => {
  for (const ids of [[0], [-1], [1.5], ["1"], [null]]) {
    assert.equal(planBulkDisclosure({ ids, level: 0, expectedCount: 1 }).ok, false, JSON.stringify(ids));
  }
});

test("同じ物件の重複指定は中止", () => {
  assert.equal(planBulkDisclosure({ ids: [1, 1], level: 0, expectedCount: 2 }).ok, false);
});

test("画面の件数と送信件数がずれていれば中止", () => {
  assert.equal(planBulkDisclosure({ ids: [1, 2], level: 0, expectedCount: 3 }).ok, false);
  assert.equal(planBulkDisclosure({ ids: [1, 2], level: 0, expectedCount: "2" }).ok, false);
});

test("上限を超える件数は中止", () => {
  const ids = Array.from({ length: MAX_BULK_DISCLOSURE_ITEMS + 1 }, (_, i) => i + 1);
  assert.equal(planBulkDisclosure({ ids, level: 0, expectedCount: ids.length }).ok, false);
});

test("DBで見つかった件数が想定と違えば中止する", () => {
  assert.equal(checkFoundCount(3, 3), null);
  assert.match(checkFoundCount(3, 2) ?? "", /中止/);
  assert.match(checkFoundCount(3, 4) ?? "", /中止/);
});
