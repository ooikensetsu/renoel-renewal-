import { test } from "node:test";
import assert from "node:assert/strict";
import { paginate, pageNumbers, parseAdminPerPage, ADMIN_PER_PAGE_OPTIONS } from "./pagination.ts";

/** D-06：件数の計算にはテストを書く。959件・24件ずつ＝40ページが実データの形。 */

test("959件を24件ずつに分けると40ページ、最後のページは23件", () => {
  const first = paginate(959, undefined, 24);
  assert.deepEqual(first, { page: 1, totalPages: 40, start: 0, end: 24 });
  const last = paginate(959, "40", 24);
  assert.deepEqual(last, { page: 40, totalPages: 40, start: 936, end: 959 });
  assert.equal(last.end - last.start, 23);
});

test("全ページを足すと総件数に一致する（欠け・重複がない）", () => {
  for (const total of [0, 1, 23, 24, 25, 959]) {
    const { totalPages } = paginate(total, "1", 24);
    let sum = 0;
    for (let p = 1; p <= totalPages; p++) {
      const { start, end } = paginate(total, String(p), 24);
      sum += end - start;
    }
    assert.equal(sum, total, `total=${total}`);
  }
});

test("壊れた ?page= は丸める", () => {
  assert.equal(paginate(959, "0", 24).page, 1);
  assert.equal(paginate(959, "-3", 24).page, 1);
  assert.equal(paginate(959, "abc", 24).page, 1);
  assert.equal(paginate(959, "2.5", 24).page, 1);
  assert.equal(paginate(959, "999", 24).page, 40, "範囲外は最終ページ");
  assert.equal(paginate(959, "", 24).page, 1);
});

test("0件でも1ページとして扱い、切り出しは空", () => {
  assert.deepEqual(paginate(0, "3", 24), { page: 1, totalPages: 1, start: 0, end: 0 });
});

test("ページ番号は先頭・末尾・前後だけを出し、間を省く", () => {
  assert.deepEqual(pageNumbers(1, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(pageNumbers(1, 40), [1, 2, 3, 4, null, 40]);
  assert.deepEqual(pageNumbers(20, 40), [1, null, 19, 20, 21, null, 40]);
  assert.deepEqual(pageNumbers(40, 40), [1, null, 37, 38, 39, 40]);
  assert.deepEqual(pageNumbers(3, 40), [1, 2, 3, 4, null, 40]);
});

test("管理画面の表示件数：選択肢の値だけを受け、それ以外は50件", () => {
  for (const n of ADMIN_PER_PAGE_OPTIONS) assert.equal(parseAdminPerPage(String(n)), n);
  for (const bad of [undefined, null, "", "0", "20", "1000", "abc", "-50"]) {
    assert.equal(parseAdminPerPage(bad), 50, `value=${bad}`);
  }
});

test("1,664件（物件管理の実件数）は表示件数ごとに欠けなく分かれる", () => {
  for (const per of ADMIN_PER_PAGE_OPTIONS) {
    const { totalPages } = paginate(1664, "1", per);
    assert.equal(totalPages, Math.ceil(1664 / per));
    const last = paginate(1664, String(totalPages), per);
    assert.equal(last.end, 1664);
  }
});
