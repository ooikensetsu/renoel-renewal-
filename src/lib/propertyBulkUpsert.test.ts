import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBulkInsert,
  buildBulkUpdateById,
  BULK_UPSERT_COLUMNS,
  type BulkUpsertRow,
} from "./propertyBulkUpsert.ts";

/** 全列を埋めた1行を作る。文字列の列には列名を入れ、並びのずれを見つけやすくする。 */
function row(objMngNo: bigint): BulkUpsertRow {
  const r: Record<string, string | number | bigint | Date | null> = {};
  for (const [name, sqlType] of BULK_UPSERT_COLUMNS) {
    r[name] =
      sqlType === "bigint" ? objMngNo
      : sqlType === "integer" || sqlType === "double precision" ? 1
      : sqlType === "timestamp" ? new Date("2026-09-02T00:00:00.000Z")
      : name;
  }
  return r as BulkUpsertRow;
}

/** SQL に渡す JSON を戻す。 */
function payloadOf(rows: BulkUpsertRow[]): Record<string, unknown>[] {
  return JSON.parse(buildBulkInsert(rows).values[0]);
}

test("引数は JSON 1個だけ（行数が増えても増えない）", () => {
  const one = buildBulkInsert([row(BigInt(1))]);
  const many = buildBulkInsert(Array.from({ length: 2000 }, (_, i) => row(BigInt(i))));
  assert.equal(one.values.length, 1);
  assert.equal(many.values.length, 1);
  // 文に現れる引数も $1 だけ
  assert.equal((many.sql.match(/\$\d+/g) ?? []).join(","), "$1");
});

test("行の順序と件数が保たれる", () => {
  const payload = payloadOf([row(BigInt(1)), row(BigInt(2)), row(BigInt(3))]);
  assert.equal(payload.length, 3);
  assert.deepEqual(payload.map((r) => r.objMngNo), ["1", "2", "3"]);
});

test("全列が JSON に入る（列を足して値を忘れる事故を見張る）", () => {
  const [first] = payloadOf([row(BigInt(1))]);
  assert.deepEqual(
    Object.keys(first).sort(),
    BULK_UPSERT_COLUMNS.map(([name]) => name).sort()
  );
});

test("BigInt と Date は JSON にできる形に変える", () => {
  const [first] = payloadOf([row(BigInt(6991355520))]);
  assert.equal(first.objMngNo, "6991355520", "BigInt が文字列になっていない");
  assert.equal(first.publishedOn, "2026-09-02T00:00:00.000Z");
});

test("値が無い列は null になる（空文字にしない）", () => {
  const r = row(BigInt(1));
  (r as Record<string, unknown>).agencyName = null;
  const [first] = payloadOf([r]);
  assert.equal(first.agencyName, null);
});

test("全行が空の日時列でも組み立てられる（型を推測させない）", () => {
  const r = row(BigInt(1));
  (r as Record<string, unknown>).publishedOn = null;
  (r as Record<string, unknown>).nextUpdateOn = null;
  const { sql } = buildBulkInsert([r]);
  // 日時は SQL 側で明示的に変換する
  assert.ok(sql.includes(`(r->>'publishedOn')::timestamptz AT TIME ZONE 'UTC'`));
  assert.equal(payloadOf([r])[0].publishedOn, null);
});

test("列ごとに型変換を書いている（text はそのまま）", () => {
  const { sql } = buildBulkInsert([row(BigInt(1))]);
  for (const [name, sqlType] of BULK_UPSERT_COLUMNS) {
    if (sqlType === "text") {
      assert.ok(sql.includes(`r->>'${name}'`), `${name} の取り出しが無い`);
    } else if (sqlType !== "timestamp") {
      assert.ok(
        sql.includes(`(r->>'${name}')::${sqlType}`),
        `${name} の ${sqlType} への変換が無い`
      );
    }
  }
});

test("新規は INSERT のみで、DBの一意制約で突合しない（ON CONFLICT を使わない）", () => {
  const { sql } = buildBulkInsert([row(BigInt(1))]);
  assert.match(sql, /^INSERT INTO "Property"/);
  assert.ok(!sql.includes("ON CONFLICT"), "突合は importMatch.ts で済ませてから渡す");
});

test("更新は id で行を指定し、物件管理番号を含む全列を上書きし、createdAt を触らない", () => {
  const { sql, values } = buildBulkUpdateById([row(BigInt(1)), row(BigInt(2))], [7, 8]);
  assert.match(sql, /^UPDATE "Property" AS p SET/);
  assert.match(sql, /WHERE p\."id" = v\."id"/);
  for (const [name] of BULK_UPSERT_COLUMNS) {
    assert.ok(sql.includes(`"${name}" = v."${name}"`), `${name} が更新の対象から漏れている`);
  }
  assert.ok(!sql.includes('"createdAt" ='), "更新時に createdAt を上書きしている");
  assert.match(sql, /"updatedAt" = NOW\(\)/);
  assert.deepEqual(JSON.parse(values[0]).map((r: { id: number }) => r.id), [7, 8]);
});

test("更新で行と id の数が合わなければ組み立てずに落とす", () => {
  assert.throws(() => buildBulkUpdateById([row(BigInt(1))], [7, 8]), /合わない/);
  assert.throws(() => buildBulkUpdateById([row(BigInt(1))], [0]), /正しくない/);
  assert.throws(() => buildBulkUpdateById([], []), /行が空/);
});

test("取り込む値はSQL文に入らない（引数として渡す）", () => {
  const evil = row(BigInt(1));
  (evil as Record<string, unknown>).title = "'); DROP TABLE \"Property\"; --";
  const { sql, values } = buildBulkInsert([evil]);
  assert.ok(!sql.includes("DROP TABLE"), "入力がSQL文に混ざっている");
  assert.equal(JSON.parse(values[0])[0].title, "'); DROP TABLE \"Property\"; --");
});

test("行が空なら組み立てずに落とす", () => {
  assert.throws(() => buildBulkInsert([]), /行が空/);
});
