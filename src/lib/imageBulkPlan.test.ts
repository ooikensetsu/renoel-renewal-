import { test } from "node:test";
import assert from "node:assert/strict";
import { planImageUploads, type MappingRow } from "./imageBulkPlan.ts";

/** D-06：一括登録の件数。上限・対象外・登録済みの扱いを固定する。 */

function rows(objMngNo: string, count: number, dir = "imgs"): MappingRow[] {
  return Array.from({ length: count }, (_, i) => ({
    oldName: `${objMngNo}_${i + 1}.jpg`,
    objMngNo,
    newPath: `${dir}/x_${i + 1}.jpg`,
  }));
}

test("1物件の上限を超えた分は連番の若い順に残し、落とした枚数を数える", () => {
  const plan = planImageUploads(rows("1000000001", 25), [{ id: 1, objMngNo: "1000000001", imagePaths: [] }], 20);
  assert.equal(plan.uploads.length, 20);
  assert.deepEqual(plan.uploads.map((u) => u.order), Array.from({ length: 20 }, (_, i) => i + 1));
  assert.equal(plan.droppedOverLimit, 5);
  assert.equal(plan.uploads[0].storagePath, "1000000001/001.jpg");
});

test("連番は数として並べる（10枚目が2枚目より前に来ない）", () => {
  const shuffled = rows("1000000001", 12).reverse();
  const plan = planImageUploads(shuffled, [{ id: 1, objMngNo: "1000000001", imagePaths: [] }], 3);
  assert.deepEqual(plan.uploads.map((u) => u.order), [1, 2, 3]);
});

test("DBに物件が無い番号は登録せず一覧に出す", () => {
  const plan = planImageUploads(rows("1000000002", 3), [], 20);
  assert.equal(plan.uploads.length, 0);
  assert.deepEqual(plan.noProperty, ["1000000002"]);
});

test("人が登録した画像がある物件は丸ごと除く", () => {
  const plan = planImageUploads(
    rows("1000000003", 3),
    [{ id: 3, objMngNo: "1000000003", imagePaths: ["1000000003/001.png"] }],
    20
  );
  assert.equal(plan.uploads.length, 0);
  assert.deepEqual(plan.alreadyHasOtherImages, ["1000000003"]);
});

test("再実行：自分が登録した分だけがある物件は対象に残す（登録済みかは実行時に1枚ずつ見る）", () => {
  const plan = planImageUploads(
    rows("1000000004", 3),
    [{ id: 4, objMngNo: "1000000004", imagePaths: ["1000000004/001.jpg", "1000000004/002.jpg"] }],
    20
  );
  assert.equal(plan.uploads.length, 3);
  assert.deepEqual(plan.alreadyHasOtherImages, []);
});

test("旧ファイル名が物件管理番号と合わない行は読めないとして除く", () => {
  const plan = planImageUploads(
    [{ oldName: "999_1.jpg", objMngNo: "1000000005", newPath: "a.jpg" }, { oldName: "1000000005.jpg", objMngNo: "1000000005", newPath: "b.jpg" }],
    [{ id: 5, objMngNo: "1000000005", imagePaths: [] }],
    20
  );
  assert.equal(plan.uploads.length, 0);
  assert.deepEqual(plan.unreadable, ["999_1.jpg", "1000000005.jpg"]);
});
