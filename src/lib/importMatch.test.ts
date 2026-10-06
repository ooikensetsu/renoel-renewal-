import { test } from "node:test";
import assert from "node:assert/strict";
import { importKey, planImportMatches, type ExistingForMatch } from "./importMatch.ts";

/**
 * D-06：取込の突合。守りたいのは「別の物件を上書きしない」「判断できなければ全体を止める」。
 * 会社名・番号はテスト用の架空の値。
 */

const key = (agency: string | null, no: string) => importKey(agency, no) as string;

function existing(id: number, objMngNo: number, agencyName: string | null, listingCompanyNo: string | null): ExistingForMatch {
  return { id, objMngNo: BigInt(objMngNo), agencyName, listingCompanyNo };
}

test("掲載会社管理番号が空・「－」「-」ならキーは null（取り込まない）", () => {
  for (const blank of [undefined, null, "", "  ", "-", "－", "－ / －"]) {
    assert.equal(importKey("A社", blank), null, String(blank));
  }
});

test("キーは会社名と番号の組。前後の空白は無視する", () => {
  assert.equal(importKey(" A社 ", " 001 "), importKey("A社", "001"));
  assert.notEqual(importKey("A社", "001"), importKey("B社", "001"), "会社が違えば別物件");
  assert.equal(importKey(null, "001"), importKey("-", "001"), "会社名の空は同じ扱い");
});

test("一致すれば既存の id、無ければ新規（null）", () => {
  const plan = planImportMatches(
    [
      { key: key("A社", "001"), objMngNo: BigInt(100), label: "1行目" },
      { key: key("A社", "002"), objMngNo: BigInt(200), label: "2行目" },
    ],
    [existing(7, 100, "A社", "001")]
  );
  assert.deepEqual(plan, { ok: true, matchedIds: [7, null] });
});

test("別会社の同じ番号は上書きしない（新規になる）", () => {
  const plan = planImportMatches(
    [{ key: key("B社", "001"), objMngNo: BigInt(300), label: "1行目" }],
    [existing(7, 100, "A社", "001")]
  );
  assert.deepEqual(plan, { ok: true, matchedIds: [null] });
});

test("物件管理番号が変わっていても、キーが一致すれば同じ物件を上書きする", () => {
  const plan = planImportMatches(
    [{ key: key("A社", "001"), objMngNo: BigInt(999), label: "1行目" }],
    [existing(7, 100, "A社", "001")]
  );
  assert.deepEqual(plan, { ok: true, matchedIds: [7] });
});

test("CSVの中でキーか物件管理番号が重複していれば中止", () => {
  assert.equal(
    planImportMatches(
      [
        { key: key("A社", "001"), objMngNo: BigInt(1), label: "1行目" },
        { key: key("A社", "001"), objMngNo: BigInt(2), label: "2行目" },
      ],
      []
    ).ok,
    false
  );
  assert.equal(
    planImportMatches(
      [
        { key: key("A社", "001"), objMngNo: BigInt(1), label: "1行目" },
        { key: key("A社", "002"), objMngNo: BigInt(1), label: "2行目" },
      ],
      []
    ).ok,
    false
  );
});

test("DBに同じキーの物件が複数あれば中止（どれを上書きするか決められない）", () => {
  const plan = planImportMatches(
    [{ key: key("A社", "001"), objMngNo: BigInt(100), label: "1行目" }],
    [existing(7, 100, "A社", "001"), existing(8, 101, "A社", "001")]
  );
  assert.equal(plan.ok, false);
});

test("物件管理番号を別の物件が使っていれば中止", () => {
  // 新規行の番号を、キーの違う既存物件が使っている
  assert.equal(
    planImportMatches(
      [{ key: key("A社", "002"), objMngNo: BigInt(100), label: "1行目" }],
      [existing(7, 100, "A社", "001")]
    ).ok,
    false
  );
  // 掲載会社管理番号が空の既存物件が使っている番号も同じ
  assert.equal(
    planImportMatches(
      [{ key: key("A社", "002"), objMngNo: BigInt(100), label: "1行目" }],
      [existing(7, 100, "A社", "-")]
    ).ok,
    false
  );
});
