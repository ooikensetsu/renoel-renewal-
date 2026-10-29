import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PROPERTY_CSV_COLUMNS,
  buildPropertyCsv,
  normalizePropertyCsvRow,
  changedPropertyColumns,
} from "./propertyCsv.ts";
import { parseCsv } from "./csv.ts";
import { BULK_UPSERT_COLUMNS } from "./propertyBulkUpsert.ts";

/**
 * D-06：書き出したCSVをそのまま戻すと全項目が上書きされる（案B・2026-10-15）。
 * 守りたいのは「書き出し→取込で値が変わらない」ことと「列の欠けで空に上書きされない」こと。
 */

const sample = {
  id: 1,
  agencyName: "パル建設 加古川店",
  disclosureLevel: 2,
  listingCompanyNo: "0123",
  syubetu: 2,
  title: "加古川市 平岡町, 南",
  address: "兵庫県加古川市平岡町",
  priceMan: 1980,
  madori: "4LDK",
  agencyTel: "0794-00-0000",
  objMngNo: "6991580385",
  landMen: 165.3,
  maintenanceCost: '管理費 "月額"\n修繕 5千円',
  publishedOn: new Date(Date.UTC(2026, 9, 1)),
  nextUpdateOn: null,
  cityCd: "28210",
};

test("取込が書く列はすべて書き出す", () => {
  const exported = new Set(PROPERTY_CSV_COLUMNS.map((c) => c.key));
  const missing = BULK_UPSERT_COLUMNS.map(([name]) => name).filter(
    (name) => !exported.has(name)
  );
  assert.deepEqual(missing, []);
});

test("列名は重複しない（取込で別の列に入らない）", () => {
  const headers = PROPERTY_CSV_COLUMNS.map((c) => c.header);
  assert.equal(new Set(headers).size, headers.length);
});

test("先頭は取扱会社、2列目は公開状態", () => {
  const header = buildPropertyCsv([]).split("\r\n")[0].split(",");
  assert.deepEqual(header.slice(0, 2), ["取扱会社", "公開状態"]);
});

test("書き出して読み戻すと、取込の項目名と元の値に戻る", () => {
  const [row] = parseCsv(buildPropertyCsv([sample])).map(normalizePropertyCsvRow);
  assert.equal(row.agencyName, "パル建設 加古川店");
  assert.equal(row.disclosureLevel, "2");
  assert.equal(row.syubetu, "2");
  assert.equal(row.listingCompanyNo, "0123");
  assert.equal(row.agencyTel, "0794-00-0000");
  assert.equal(row.objMngNo, "6991580385");
  assert.equal(row.title, "加古川市 平岡町, 南");
  assert.equal(row.priceMan, "1980");
  assert.equal(row.landMen, "165.3");
  assert.equal(row.maintenanceCost, '管理費 "月額"\n修繕 5千円');
  assert.equal(row.publishedOn, "2026/10/01");
  assert.equal(row.nextUpdateOn, "");
});

test("公開状態は表示名で書き出す", () => {
  const line = buildPropertyCsv([sample]).split("\r\n")[1];
  assert.match(line, /^パル建設 加古川店,非表示,/);
});

test("Excel で保存し直したCSV（=\"…\" が外れた値）も読める", () => {
  const csv = "取扱会社,公開状態,掲載会社管理番号,物件種別\r\nA社,一般公開,0123,マンション\r\n";
  const [row] = parseCsv(csv).map(normalizePropertyCsvRow);
  assert.deepEqual(row, { agencyName: "A社", disclosureLevel: "0", listingCompanyNo: "0123", syubetu: "3" });
});

test("「非公開」は非表示、「会員限定」は1として読む", () => {
  assert.equal(normalizePropertyCsvRow({ 公開状態: "非公開" }).disclosureLevel, "2");
  assert.equal(normalizePropertyCsvRow({ 公開状態: "会員限定" }).disclosureLevel, "1");
});

test("読めない表示名は番号にせずそのまま残す（取込側の検証で止める）", () => {
  assert.equal(normalizePropertyCsvRow({ 公開状態: "公開" }).disclosureLevel, "公開");
  assert.equal(normalizePropertyCsvRow({ 物件種別: "マンシヨン" }).syubetu, "マンシヨン");
});

test("英語の列名（athome 取込用CSV）は従来どおり読める", () => {
  const row = normalizePropertyCsvRow({ objMngNo: "6991580385", disclosureLevel: "1", syubetu: "2" });
  assert.deepEqual(row, { objMngNo: "6991580385", disclosureLevel: "1", syubetu: "2" });
});

test("取扱会社が未登録の物件は最後、それ以外は会社名→掲載会社管理番号の順", () => {
  const csv = buildPropertyCsv([
    { agencyName: null, listingCompanyNo: "1", title: "c" },
    { agencyName: "B社", listingCompanyNo: "10", title: "b10" },
    { agencyName: "B社", listingCompanyNo: "9", title: "b9" },
    { agencyName: "A社", listingCompanyNo: "5", title: "a" },
  ]);
  const titles = parseCsv(csv).map((r) => r["物件名"]);
  assert.deepEqual(titles, ["a", "b9", "b10", "c"]);
});

test("変更箇所：空文字と null、同じ日付は変更なし。違う列だけ日本語名で返す", () => {
  const existing = { title: "A", agencyTel: null, publishedOn: new Date(Date.UTC(2026, 9, 1)), priceMan: 1000, disclosureLevel: 2 };
  const incoming = { title: "A", agencyTel: "", publishedOn: new Date(Date.UTC(2026, 9, 1)), priceMan: 1000, disclosureLevel: 0 };
  assert.deepEqual(changedPropertyColumns(existing, incoming), ["公開状態"]);
});

test("変更箇所：「-」「- / -」と空は同じ値として扱う（表示が変わらないため）", () => {
  const existing = { keyMoney: "-", depositGuarantee: "- / -", leaseTermRent: null };
  const incoming = { keyMoney: null, depositGuarantee: null, leaseTermRent: "" };
  assert.deepEqual(changedPropertyColumns(existing, incoming), []);
});

test("取扱会社のFAX番号は台帳の値を電話番号の右に書き出す（2026-10-29）", () => {
  const contacts = new Map([["パル建設 加古川店", { tel: "079-000-0000", fax: "079-111-2222" }]]);
  const csv = buildPropertyCsv([sample, { ...sample, agencyName: "台帳に無い会社" }], contacts);
  const header = csv.split("\r\n")[0].split(",");
  assert.equal(header.indexOf("取扱会社FAX番号"), header.indexOf("取扱会社電話番号") + 1);
  const [pal, other] = parseCsv(csv);
  assert.equal(pal["取扱会社FAX番号"], '="079-111-2222"');
  assert.equal(other["取扱会社FAX番号"], "");
});

test("FAX番号の列は取込では読まない（台帳が正本）", () => {
  const csv = "取扱会社,取扱会社FAX番号,掲載会社管理番号\r\nA社,079-111-2222,0123\r\n";
  const [row] = parseCsv(csv).map(normalizePropertyCsvRow);
  assert.deepEqual(row, { agencyName: "A社", listingCompanyNo: "0123" });
});
