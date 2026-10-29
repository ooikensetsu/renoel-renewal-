import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeFax, planFaxImport } from "./agencyFax.ts";

/** D-06：取扱会社のFAX番号の一括登録（2026-10-22）。人の入力を上書きしないことと、読み替えを固定する。 */

test("FAX番号の形をそろえる（全角・長音記号・空白）。桁数が合わないものは読めない扱い", () => {
  assert.equal(normalizeFax("０７９－２６３－８１２７"), "079-263-8127");
  assert.equal(normalizeFax(" 0798-26-0505 "), "0798-26-0505");
  assert.equal(normalizeFax("079ー263ー8127"), "079-263-8127");
  assert.equal(normalizeFax("079-263-812"), null);
  assert.equal(normalizeFax("－"), null);
  assert.equal(normalizeFax("FAX無し"), null);
});

const ctx = {
  aliases: new Map([["（株）A不動産", "(株)A不動産"]]),
  knownNames: new Set(["(株)A不動産", "B住建", "C建設", "D社"]),
  currentFax: new Map<string, string | null>([["B住建", "079-000-0002"], ["C建設", null]]),
};

test("台帳に無い会社は台帳を作り、FAXが空の会社は入れる。旧表記は正式名へ読み替える", () => {
  const plan = planFaxImport(
    [
      { agencyName: "（株）A不動産", fax: "079-000-0001" },
      { 取扱会社名: "C建設", agencyFax: "079-000-0003" },
    ],
    ctx
  );
  assert.deepEqual(plan.write, [
    { agencyName: "(株)A不動産", fax: "079-000-0001", createAgency: true },
    { agencyName: "C建設", fax: "079-000-0003", createAgency: false },
  ]);
});

test("人が入れたFAXは上書きしない。同じ値なら何もしない", () => {
  const plan = planFaxImport(
    [{ agencyName: "B住建", fax: "079-000-9999" }, { agencyName: "B住建 ", fax: "079-000-9999" }],
    ctx
  );
  assert.deepEqual(plan.write, []);
  assert.deepEqual(plan.differs, [{ agencyName: "B住建", current: "079-000-0002", incoming: "079-000-9999" }]);
  // ハイフンの有無だけの違いは同じ番号とみなす
  assert.deepEqual(planFaxImport([{ agencyName: "B住建", fax: "0790000002" }], ctx).same, ["B住建"]);
  assert.deepEqual(planFaxImport([{ agencyName: "B住建", fax: "079-000-0002" }], ctx).same, ["B住建"]);
});

test("同じ会社に違うFAXが2つあれば書かない。知らない会社・読めない値・空欄は分けて返す", () => {
  const plan = planFaxImport(
    [
      { agencyName: "D社", fax: "079-111-1111" },
      { agencyName: "D社", fax: "079-222-2222" },
      { agencyName: "E社", fax: "079-333-3333" },
      { agencyName: "C建設", fax: "123" },
      { agencyName: "C建設", fax: "" },
    ],
    ctx
  );
  assert.deepEqual(plan.write, []);
  assert.deepEqual(plan.conflicting, [{ agencyName: "D社", faxes: ["079-111-1111", "079-222-2222"] }]);
  assert.deepEqual(plan.unknown, ["E社"]);
  assert.deepEqual(plan.invalid, [{ agencyName: "C建設", fax: "123" }]);
});
