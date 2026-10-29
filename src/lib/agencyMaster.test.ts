import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agencyColumnsToWrite,
  applyAgencyMaster,
  findSpellingWarnings,
  groupSpellingVariants,
  planAgencyMerge,
  sameCompanyKey,
  summarizeAgencyColumns,
} from "./agencyMaster.ts";

/** D-06：取扱会社の台帳（2026-10-22）。統合の可否・取込時の読み替え・物件へ書く列を固定する。 */

test("表記ゆれの比較では、会社の種類・括弧の全角半角・空白を無視する", () => {
  assert.equal(sameCompanyKey("(株)ここいえ 姫路店"), sameCompanyKey("（株）ここいえ姫路店"));
  assert.equal(sameCompanyKey("株式会社ＪＵＮ"), sameCompanyKey("jun(株)"));
  assert.notEqual(sameCompanyKey("ここいえ姫路店"), sameCompanyKey("ここいえ加古川店"));
});

test("表記ゆれの候補は2社以上の組だけ。同じ名前の重複は1社に数える", () => {
  const groups = groupSpellingVariants([
    "(株)ここいえ 姫路店",
    "（株）ここいえ姫路店",
    "（株）ここいえ姫路店",
    "播磨不動産",
    "株式会社",
  ]);
  assert.deepEqual(groups, [["(株)ここいえ 姫路店", "（株）ここいえ姫路店"]]);
});

test("新しい表記が登録済みの会社と同じ形になるときだけ警告する", () => {
  const known = ["（株）ここいえ姫路店", "播磨不動産"];
  assert.deepEqual(findSpellingWarnings(["株式会社ここいえ 姫路店"], known), [
    { name: "株式会社ここいえ 姫路店", similar: ["（株）ここいえ姫路店"] },
  ]);
  // 登録済みの表記・似た会社が無い新しい会社・空欄は警告しない
  assert.deepEqual(findSpellingWarnings(["（株）ここいえ姫路店", " 播磨不動産 ", "新しい不動産", "", null, "－"], known), []);
});

test("同じ取込の中の新しい表記どうしも警告する。同じ名前は1件にまとめる", () => {
  assert.deepEqual(findSpellingWarnings(["(株)北はりま", "株式会社 北はりま", "(株)北はりま"], []), [
    { name: "(株)北はりま", similar: ["株式会社 北はりま"] },
    { name: "株式会社 北はりま", similar: ["(株)北はりま"] },
  ]);
});

test("物件へ書く会社情報は空欄と「－」を含めない（物件側の値を消さない）", () => {
  assert.deepEqual(agencyColumnsToWrite({ address: "姫路市1-1", tel: "", license: "－" }), {
    agencyAddress: "姫路市1-1",
  });
  assert.deepEqual(agencyColumnsToWrite({ address: null, tel: " 079-000-0000 ", license: "兵庫県知事(1)第1号" }), {
    agencyTel: "079-000-0000",
    agencyLicense: "兵庫県知事(1)第1号",
  });
});

test("物件側の会社情報を項目ごとに多い順で数える（空欄は数えない）", () => {
  const summary = summarizeAgencyColumns([
    { agencyAddress: "A", agencyTel: "1", agencyLicense: null },
    { agencyAddress: "B", agencyTel: "1", agencyLicense: "-" },
    { agencyAddress: "B", agencyTel: null, agencyLicense: null },
  ]);
  assert.deepEqual(summary.address, [{ value: "B", count: 2 }, { value: "A", count: 1 }]);
  assert.deepEqual(summary.tel, [{ value: "1", count: 2 }]);
  assert.deepEqual(summary.license, []);
});

test("統合：書き換えるのは統合元の物件だけ。前後の空白がある会社名も同じ会社に数える", () => {
  const plan = planAgencyMerge("A社", ["A 社"], [
    { id: 1, agencyName: "A社", listingCompanyNo: "1" },
    { id: 2, agencyName: " A 社 ", listingCompanyNo: "2" },
    { id: 3, agencyName: "B社", listingCompanyNo: "1" },
  ]);
  assert.deepEqual(plan, { ok: true, propertyIds: [2] });
});

test("統合：同じ掲載会社管理番号の物件ができるなら中止し、ぶつかる物件を返す", () => {
  const plan = planAgencyMerge("A社", ["A 社", "Ａ社"], [
    { id: 5, agencyName: "A社", listingCompanyNo: "100" },
    { id: 2, agencyName: "A 社", listingCompanyNo: " 100" },
    { id: 7, agencyName: "Ａ社", listingCompanyNo: "200" },
    { id: 8, agencyName: "A社", listingCompanyNo: "200" },
    { id: 9, agencyName: "A 社", listingCompanyNo: "300" },
  ]);
  assert.equal(plan.ok, false);
  if (plan.ok) return;
  assert.deepEqual(plan.conflicts, [
    { listingCompanyNo: "100", ids: [2, 5] },
    { listingCompanyNo: "200", ids: [7, 8] },
  ]);
});

test("統合：掲載会社管理番号が空の物件はぶつからない", () => {
  const plan = planAgencyMerge("A社", ["A 社"], [
    { id: 1, agencyName: "A社", listingCompanyNo: null },
    { id: 2, agencyName: "A 社", listingCompanyNo: "－" },
  ]);
  assert.deepEqual(plan, { ok: true, propertyIds: [2] });
});

test("取込：旧表記は正式名に読み替え、台帳の会社情報（空欄以外）で上書きする", () => {
  const aliases = new Map([["（株）ここいえ姫路店", "(株)ここいえ 姫路店"]]);
  const agencies = new Map([["(株)ここいえ 姫路店", { address: "姫路市1-1", tel: null, license: "免許1" }]]);
  const row = { title: "物件", agencyName: " （株）ここいえ姫路店 ", agencyAddress: "古い住所", agencyTel: "079", agencyLicense: null };
  assert.deepEqual(applyAgencyMaster(row, aliases, agencies), {
    title: "物件",
    agencyName: "(株)ここいえ 姫路店",
    agencyAddress: "姫路市1-1",
    agencyTel: "079",
    agencyLicense: "免許1",
  });
});

test("取込：台帳に無い会社と会社名が空の行は、入ってきた値のまま", () => {
  const empty = new Map();
  const row = { agencyName: "播磨不動産", agencyTel: "079" };
  assert.deepEqual(applyAgencyMaster(row, empty, empty), row);
  const noName = { agencyName: "", agencyTel: "079" };
  assert.equal(applyAgencyMaster(noName, empty, empty), noName);
});
