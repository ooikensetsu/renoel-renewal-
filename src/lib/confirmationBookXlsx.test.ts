import { test } from "node:test";
import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";
import { PAGES_PER_SHEET, ROWS_PER_PAGE, buildConfirmationBook, shiftPage } from "./confirmationBookXlsx.ts";
import { groupForConfirmation, type ConfirmationProperty } from "./confirmationRequestXlsx.ts";
import { confirmationTemplate } from "./confirmationTemplate.ts";

/**
 * D-06：一括印刷用の1冊（2026-10-19）。
 * 守りたいのは「全社が1シートに50音順で並び、会社ごと・10件ごとに改ページされる」ことと
 * 「Excel が改ページを無視しない印刷設定」。Excel で開けることは PDF にして確かめた（785ページ）。
 */

const template = confirmationTemplate();

function property(over: Partial<ConfirmationProperty> = {}): ConfirmationProperty {
  return {
    agencyName: "くらすONE(株)",
    agencyTel: "079-000-0000",
    listingCompanyNo: "0123",
    syubetu: 2,
    disclosureLevel: 0,
    title: "姫路市 相野（太市駅） 2階建 4LDK",
    address: "兵庫県姫路市相野",
    landMen: 118.75,
    bldMen: 109.3,
    priceMan: 1850,
    ...over,
  };
}

function open(bytes: Uint8Array) {
  const files = unzipSync(bytes);
  const workbook = strFromU8(files["xl/workbook.xml"]);
  const names = [...workbook.matchAll(/<sheet name="([^"]*)"/g)].map((m) => m[1]);
  const sheets = names.map((_, i) => strFromU8(files[`xl/worksheets/sheet${i + 1}.xml`]));
  return { workbook, names, sheets };
}

function cell(xml: string, ref: string): string {
  const m = xml.match(new RegExp(`<c r="${ref}"(?: [^>]*?)?(?:/>|>([\\s\\S]*?)</c>)`));
  assert.ok(m, `${ref} が無い`);
  const inner = m[1] ?? "";
  const t = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
  if (t) return t[1];
  const v = inner.match(/<v>([\s\S]*?)<\/v>/);
  return v ? v[1] : "";
}

test("全社を1シートに50音順で縦に並べ、会社ごと・10件ごとに改ページする", () => {
  const { groups } = groupForConfirmation(
    [
      ...Array.from({ length: 12 }, (_, i) => property({ agencyName: "播磨不動産（株）", listingCompanyNo: String(i + 1) })),
      property({ agencyName: "(株)赤鹿地所" }),
    ],
    new Map([
      ["播磨不動産（株）", "はりまふどうさん"],
      ["(株)赤鹿地所", "あかしかじしょ"],
    ])
  );
  const { bytes, pages } = buildConfirmationBook(template, groups, new Date(2026, 9, 19));
  assert.equal(pages, 3);
  const { names, sheets, workbook } = open(bytes);
  assert.deepEqual(names, ["一括印刷"]);
  const xml = sheets[0];
  // 1ページ目：赤鹿地所、2・3ページ目：播磨不動産
  assert.equal(cell(xml, "A3"), "(株)赤鹿地所");
  assert.equal(cell(xml, `A${3 + ROWS_PER_PAGE}`), "播磨不動産（株）");
  assert.equal(cell(xml, `R${1 + ROWS_PER_PAGE}`), "1/2頁");
  assert.equal(cell(xml, `R${1 + ROWS_PER_PAGE * 2}`), "2/2頁");
  assert.equal(cell(xml, `A${12 + ROWS_PER_PAGE * 2}`), "11", "No. は会社の中で通し番号");
  // 件数の数式は各ページの所在地の欄を数える
  assert.match(xml, new RegExp(`<c r="O${1 + ROWS_PER_PAGE}"[^>]*><f>COUNTA\\(E${12 + ROWS_PER_PAGE}:E${31 + ROWS_PER_PAGE}\\)`));
  // 改ページは各ページの最終行の後ろに2つ（最後のページの後ろには入れない）
  assert.match(xml, /<rowBreaks count="2" manualBreakCount="2"><brk id="33" max="16383" man="1"\/><brk id="66" max="16383" man="1"\/><\/rowBreaks>/);
  assert.match(xml, /<dimension ref="A1:R99"\/>/);
  assert.match(workbook, /<definedName name="_xlnm.Print_Area" localSheetId="0">'一括印刷'!\$A\$1:\$R\$99</);
});

test("印刷設定：横1ページ・縦は自動（改ページを効かせる）、印刷部数の指定は外す", () => {
  const { groups } = groupForConfirmation([property()]);
  const { sheets } = open(buildConfirmationBook(template, groups, new Date(2026, 9, 19)).bytes);
  const setup = sheets[0].match(/<pageSetup [^>]*\/>/)![0];
  assert.match(setup, /fitToWidth="1"/);
  assert.match(setup, /fitToHeight="0"/);
  assert.doesNotMatch(setup, /copies=/);
  assert.doesNotMatch(setup, /r:id=/);
  assert.match(sheets[0], /tabSelected="1"/);
  assert.doesNotMatch(sheets[0], /<rowBreaks/, "1ページなら改ページは要らない");
});

test("結合セルもページごとにずらす（様式1枚分の結合が各ページにある）", () => {
  const { groups } = groupForConfirmation([property(), property({ agencyName: "(株)タテイワ" })]);
  const { sheets } = open(buildConfirmationBook(template, groups, new Date(2026, 9, 19)).bytes);
  const merges = [...sheets[0].matchAll(/<mergeCell ref="([^"]+)"\/>/g)].map((m) => m[1]);
  assert.equal(merges.length, 188 * 2);
  assert.ok(merges.includes("A3:E3"));
  assert.ok(merges.includes(`A${3 + ROWS_PER_PAGE}:E${3 + ROWS_PER_PAGE}`));
  assert.ok(merges.includes(`A${33 + ROWS_PER_PAGE}:R${33 + ROWS_PER_PAGE}`));
  assert.match(sheets[0], /<mergeCells count="376">/);
});

test("行のずらし：行番号・セル番地・数式の参照を下げ、関数名は変えない", () => {
  const xml =
    '<sheetData><row r="1"><c r="O1" t="str"><f>COUNTA(E12:E31)&amp;"件"</f><v>0件</v></c>' +
    '<c r="L1"><f ca="1">TODAY()</f></c></row></sheetData><mergeCells count="1"><mergeCell ref="A1:J1"/></mergeCells>';
  const { rows, merges } = shiftPage(xml, 33);
  assert.equal(
    rows,
    '<row r="34"><c r="O34" t="str"><f>COUNTA(E45:E64)&amp;"件"</f><v>0件</v></c><c r="L34"><f ca="1">TODAY()</f></c></row>'
  );
  assert.deepEqual(merges, ["A34:J34"]);
});

test("改ページの上限（1シート1,026個）を超える量はシートを分ける", () => {
  assert.ok(PAGES_PER_SHEET - 1 <= 1026);
  const many = Array.from({ length: PAGES_PER_SHEET + 1 }, (_, i) => property({ agencyName: `会社${String(i).padStart(4, "0")}` }));
  const { groups } = groupForConfirmation(many);
  const { bytes, pages } = buildConfirmationBook(template, groups, new Date(2026, 9, 19));
  assert.equal(pages, PAGES_PER_SHEET + 1);
  const { names, sheets } = open(bytes);
  assert.deepEqual(names, ["一括印刷1", "一括印刷2"]);
  assert.match(sheets[0], new RegExp(`<rowBreaks count="${PAGES_PER_SHEET - 1}"`));
  assert.equal(cell(sheets[1], "A3"), `会社${String(PAGES_PER_SHEET).padStart(4, "0")}`);
  assert.doesNotMatch(sheets[1], /tabSelected="1"/);
});

test("取扱会社が1社も無ければ作らない", () => {
  assert.throws(() => buildConfirmationBook(template, [], new Date()), /取扱会社が登録された物件がありません/);
});
