import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import {
  ROWS_PER_SHEET,
  areaText,
  buildConfirmationWorkbook,
  buildConfirmationZip,
  confirmationFileName,
  confirmationSheetName,
  excelDateSerial,
  groupForConfirmation,
  type ConfirmationProperty,
} from "./confirmationRequestXlsx.ts";
import { confirmationTemplate } from "./confirmationTemplate.ts";

/**
 * D-06：物件確認依頼書（2026-10-15）。
 * 守りたいのは「様式の正しい欄に正しい値が入る」ことと「Excel が開ける形を保つ」こと。
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

/** 出来た xlsx を開いて、シート名と各シートの XML を返す。 */
function open(bytes: Uint8Array) {
  const files = unzipSync(bytes);
  const workbook = strFromU8(files["xl/workbook.xml"]);
  const names = [...workbook.matchAll(/<sheet name="([^"]*)"/g)].map((m) => m[1]);
  const sheets = names.map((_, i) => strFromU8(files[`xl/worksheets/sheet${i + 1}.xml`]));
  return { files, workbook, names, sheets };
}

/** セルの値（数値・インライン文字列・共有文字列の番号）を読む。空のセルは ""。 */
function cell(xml: string, ref: string): string {
  const m = xml.match(new RegExp(`<c r="${ref}"(?: [^>]*?)?(?:/>|>([\\s\\S]*?)</c>)`));
  assert.ok(m, `${ref} が無い`);
  const inner = m[1] ?? "";
  const t = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
  if (t) return t[1];
  const v = inner.match(/<v>([\s\S]*?)<\/v>/);
  return v ? v[1] : "";
}

test("埋め込んだ様式に、様式を作った人の手元のフォルダ名が無い（リポジトリは public）", () => {
  const files = unzipSync(template);
  for (const [path, data] of Object.entries(files)) {
    assert.doesNotMatch(strFromU8(data), /absPath|C:\\Users/, path);
  }
});

// 原本の xlsx はリポジトリに入れていない（.gitignore の *.xlsx）。手元にあるときだけ照合する。
const SOURCE = new URL("../templates/property-confirmation-request.xlsx", import.meta.url);
test(
  "埋め込んだ様式は原本の xlsx と表・書式が同じ（様式を差し替えたら scripts/embed-confirmation-template.mjs を流す）",
  { skip: !existsSync(SOURCE) && "原本の xlsx が手元に無い" },
  () => {
    const embedded = unzipSync(template);
    const source = unzipSync(readFileSync(SOURCE));
    assert.deepEqual(Object.keys(embedded).sort(), Object.keys(source).sort());
    for (const path of Object.keys(source).filter((p) => p !== "xl/workbook.xml")) {
      assert.deepEqual(Buffer.from(embedded[path]), Buffer.from(source[path]), path);
    }
  }
);

test("取扱会社ごとにまとめ、会社名順・掲載会社管理番号順に並べる。会社名の無い物件は数えて外す", () => {
  const { groups, skipped } = groupForConfirmation([
    property({ agencyName: "ハッピーホーム(株)", listingCompanyNo: "10", agencyTel: null }),
    property({ agencyName: null }),
    property({ agencyName: "ハッピーホーム(株)", listingCompanyNo: "9", agencyTel: "079-111-1111" }),
    property({ agencyName: " - " }),
    property({ agencyName: "(株)タテイワ" }),
  ]);
  assert.equal(skipped, 2);
  assert.deepEqual(
    groups.map((g) => g.agencyName),
    ["(株)タテイワ", "ハッピーホーム(株)"]
  );
  assert.deepEqual(
    groups[1].properties.map((p) => p.listingCompanyNo),
    ["9", "10"]
  );
  // 電話番号は空でない最初の番号
  assert.equal(groups[1].agencyTel, "079-111-1111");
});

test("読みがあれば会社を50音順に並べ、読みの無い会社は最後に会社名順で置く", () => {
  const { groups, unread } = groupForConfirmation(
    [
      property({ agencyName: "播磨不動産（株）" }),
      property({ agencyName: "(株)赤鹿地所" }),
      property({ agencyName: "（株）髙岡エステート" }),
      property({ agencyName: "タカセ不動産(株) 姫路店" }),
      property({ agencyName: "(株)タテイワ" }),
    ],
    new Map([
      ["播磨不動産（株）", "はりまふどうさん"],
      ["(株)赤鹿地所", "あかしかじしょ"],
      ["タカセ不動産(株) 姫路店", "たかせふどうさん ひめじてん"],
    ])
  );
  assert.deepEqual(
    groups.map((g) => g.agencyName),
    ["(株)赤鹿地所", "タカセ不動産(株) 姫路店", "播磨不動産（株）", "(株)タテイワ", "（株）髙岡エステート"]
  );
  assert.equal(unread, 2);
  assert.equal(groups[0].reading, "あかしかじしょ");
  assert.equal(groups[4].reading, null);
});

test("様式の欄に値が入る（弊社管理番号＝掲載会社管理番号、直近確認時の状況＝公開状態）", () => {
  const { groups } = groupForConfirmation([
    property({ disclosureLevel: 1, syubetu: 3, landMen: null, bldMen: 65.2, title: "A&B <マンション>" }),
  ]);
  const { sheets, names } = open(buildConfirmationWorkbook(template, groups, new Date(2026, 9, 15)));
  assert.deepEqual(names, ["くらすONE(株)"]);
  const xml = sheets[0];
  assert.equal(cell(xml, "A3"), "くらすONE(株)");
  assert.equal(cell(xml, "C4"), "TEL: 079-000-0000");
  assert.equal(cell(xml, "F4"), "FAX:");
  assert.equal(cell(xml, "R1"), "1/1頁");
  assert.equal(cell(xml, "O1"), "1件");
  assert.equal(cell(xml, "L1"), "46310");
  assert.equal(cell(xml, "A12"), "1");
  assert.equal(cell(xml, "B12"), "", "御社管理番号は空けておく");
  assert.equal(cell(xml, "B13"), "0123");
  assert.equal(cell(xml, "C12"), "マンション");
  assert.equal(cell(xml, "C13"), "会員限定");
  assert.equal(cell(xml, "D12"), "A&amp;B &lt;マンション&gt;");
  assert.equal(cell(xml, "E12"), "兵庫県姫路市相野");
  assert.equal(cell(xml, "F12"), "建物:65.2");
  assert.equal(cell(xml, "G12"), "1850");
  // 2件目の行は空のまま（No. だけ入る）
  assert.equal(cell(xml, "A14"), "2");
  assert.equal(cell(xml, "E14"), "");
  // 相手先が記入する欄は空のまま
  for (const ref of ["H12", "I12", "N12", "Q12", "R12"]) assert.equal(cell(xml, ref), "");
  // 書式（s 属性）は様式のまま
  assert.match(xml, /<c r="G12" s="33"><v>1850<\/v><\/c>/);
});

test("分譲地名・マンション名の欄はマンションだけ。戸建て・土地の自動の物件名は入れない", () => {
  const { groups } = groupForConfirmation([
    property({ listingCompanyNo: "1", syubetu: 2 }),
    property({ listingCompanyNo: "2", syubetu: 1, title: "姫路市 書写 土地" }),
    property({ listingCompanyNo: "3", syubetu: 3, title: "ライオンズマンション姫路野里 2階 3LDK" }),
  ]);
  const { sheets } = open(buildConfirmationWorkbook(template, groups, new Date(2026, 9, 15)));
  assert.equal(cell(sheets[0], "D12"), "");
  assert.equal(cell(sheets[0], "D14"), "");
  assert.equal(cell(sheets[0], "D16"), "ライオンズマンション姫路野里 2階 3LDK");
});

test("欄に収まらない値の書式：管理番号は縮小して全体を表示、マンション名は8ポイント（ほかの書式は変えない）", () => {
  const { groups } = groupForConfirmation([property({ syubetu: 3, listingCompanyNo: "361720000377523" })]);
  const { files, sheets } = open(buildConfirmationWorkbook(template, groups, new Date(2026, 9, 15)));
  const styles = strFromU8(files["xl/styles.xml"]);
  const xfs = styles.match(/<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/)!;
  const list = xfs[2].match(/<xf [^>]*?\/>|<xf [^>]*?>[\s\S]*?<\/xf>/g)!;
  assert.equal(Number(xfs[1]), list.length, "count と実数が合う");
  const fonts = styles.match(/<fonts count="(\d+)"[^>]*>([\s\S]*?)<\/fonts>/)!;
  const fontList = fonts[2].match(/<font\/>|<font>[\s\S]*?<\/font>/g)!;
  assert.equal(Number(fonts[1]), fontList.length);

  const styleOf = (ref: string) => Number(sheets[0].match(new RegExp(`<c r="${ref}" s="(\\d+)"`))![1]);
  const b13 = list[styleOf("B13")];
  assert.match(b13, /shrinkToFit="1"/);
  assert.match(b13, / borderId="14"/, "罫線は様式のまま");
  const d12 = list[styleOf("D12")];
  const font = fontList[Number(d12.match(/ fontId="(\d+)"/)![1])];
  assert.match(font, /<sz val="8"\/>/);
  assert.match(font, /BIZ UDPゴシック/);
  assert.match(d12, / borderId="11"/);
  // 書き込んでいない欄（相手先の記入欄）は様式の書式のまま
  assert.equal(styleOf("I12"), 29);
});

test("10件を超える会社は次のシートに続け、No. を通し番号にする", () => {
  const many = Array.from({ length: 23 }, (_, i) => property({ listingCompanyNo: String(i + 1) }));
  const { groups } = groupForConfirmation(many);
  const { sheets, names } = open(buildConfirmationWorkbook(template, groups, new Date(2026, 9, 15)));
  assert.equal(ROWS_PER_SHEET, 10);
  assert.deepEqual(names, ["くらすONE(株) 1枚目", "くらすONE(株) 2枚目", "くらすONE(株) 3枚目"]);
  assert.equal(cell(sheets[2], "R1"), "3/3頁");
  assert.equal(cell(sheets[2], "O1"), "3件");
  assert.equal(cell(sheets[2], "A12"), "21");
  assert.equal(cell(sheets[2], "B13"), "21");
  assert.equal(cell(sheets[2], "B17"), "23");
  assert.equal(cell(sheets[2], "E18"), "", "24件目は無い");
  assert.equal(cell(sheets[1], "A30"), "20");
  // 開いたとき選ばれているシートは1枚目だけ
  assert.match(sheets[0], /tabSelected="1"/);
  assert.doesNotMatch(sheets[1], /tabSelected="1"/);
});

test("Excel が開ける形を保つ（使い方シート・計算順・プリンター設定を外し、参照先がすべて存在する）", () => {
  const { groups } = groupForConfirmation([property(), property({ agencyName: "(株)タテイワ" })]);
  const { files, workbook, names } = open(buildConfirmationWorkbook(template, groups, new Date(2026, 9, 15)));
  assert.deepEqual(names, ["(株)タテイワ", "くらすONE(株)"]);
  assert.ok(!files["xl/calcChain.xml"]);
  assert.ok(!files["xl/worksheets/_rels/sheet1.xml.rels"]);
  assert.ok(!Object.keys(files).some((p) => p.startsWith("xl/printerSettings/")));
  assert.doesNotMatch(workbook, /使い方|absPath|C:\\Users/);
  assert.match(workbook, /fullCalcOnLoad="1"/);
  assert.match(workbook, /<definedName name="_xlnm.Print_Area" localSheetId="1">'くらすONE\(株\)'!\$A\$1:\$R\$33/);

  const rels = strFromU8(files["xl/_rels/workbook.xml.rels"]);
  for (const [, target] of rels.matchAll(/Target="([^"]+)"/g)) assert.ok(files[`xl/${target}`], `${target} が無い`);
  const ids = [...rels.matchAll(/Id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, "rId が重複している");
  for (const [, id] of workbook.matchAll(/r:id="([^"]+)"/g)) assert.ok(ids.includes(id), `${id} が無い`);

  const types = strFromU8(files["[Content_Types].xml"]);
  for (const [, part] of types.matchAll(/PartName="\/([^"]+)"/g)) assert.ok(files[part], `${part} が無い`);
  for (const path of Object.keys(files).filter((p) => p.startsWith("xl/worksheets/")))
    assert.ok(types.includes(`/${path}"`), `${path} の種類が無い`);
});

test("シート名は Excel の制約に合わせる（31字以内・使えない文字を外す・重複しない）", () => {
  const used = new Set<string>();
  assert.equal(confirmationSheetName("A/B:C[本店]", 1, 1, used), "ABC本店");
  const long = "とても長い名前の不動産会社株式会社 姫路駅前支店 営業部 第二課";
  const first = confirmationSheetName(long, 1, 2, used);
  assert.equal([...first].length, 31);
  assert.ok(first.endsWith(" 1枚目"));
  // Excel がシート名に許さない文字を、付け足した部分も含めて使わない（「/」入りの版は開けなかった）
  for (const name of used) assert.doesNotMatch(name, /[\\/?*[\]:]/, name);
  assert.equal(confirmationSheetName("abc本店", 1, 1, used), "abc本店~2", "大文字小文字だけ違う名前も重複");
  assert.equal(confirmationSheetName("'", 1, 1, used), "取扱会社");
  // 全角と半角の違いだけの名前も Excel では重複になる（開けなかった実例：(株) と（株））
  assert.equal(confirmationSheetName("(株)Cu life", 1, 1, used), "(株)Cu life");
  assert.equal(confirmationSheetName("（株）Cu life", 1, 1, used), "（株）Cu life~2");
  // 全角の引用符は「'」にそろえる（開けなかった実例）
  assert.equal(confirmationSheetName("(株)ANNE’S HOUSE", 1, 1, used), "(株)ANNE'S HOUSE");
  assert.equal(confirmationSheetName("（同）K＇sクルー", 1, 1, used), "（同）K'sクルー");
  assert.equal(confirmationSheetName("Ａ／Ｂ：Ｃ", 1, 1, used), "ＡＢＣ", "全角の使えない文字も外す");
  // ひらがなとカタカナの違いだけの名前も同じ（開けなかった実例）
  assert.equal(confirmationSheetName("あいホーム", 1, 1, used), "あいホーム");
  assert.equal(confirmationSheetName("アイホーム", 1, 1, used), "アイホーム~2");
});

test("引用符を含む会社名は、印刷範囲の式で「'」を二重にする", () => {
  const { groups } = groupForConfirmation([property({ agencyName: "(株)ANNE’S HOUSE" })]);
  const { workbook, names } = open(buildConfirmationWorkbook(template, groups, new Date(2026, 9, 15)));
  assert.deepEqual(names, ["(株)ANNE'S HOUSE"]);
  assert.match(workbook, /localSheetId="0">'\(株\)ANNE''S HOUSE'!\$A\$1:\$R\$33</);
});

test("面積は土地・建物を改行で並べ、無い方は書かない", () => {
  assert.equal(areaText({ landMen: 142.61, bldMen: 92.74 }), "土地:142.61\n建物:92.74");
  assert.equal(areaText({ landMen: 230.72, bldMen: null }), "土地:230.72");
  assert.equal(areaText({ landMen: null, bldMen: null }), "");
});

test("依頼日は Excel の日付の値にする（様式の TODAY() と同じ値）", () => {
  assert.equal(excelDateSerial(new Date(2026, 9, 15, 23, 59)), 46310);
  assert.equal(excelDateSerial(new Date(1900, 2, 1)), 61);
});

test("取扱会社が1社も無ければ作らない", () => {
  assert.throws(() => buildConfirmationWorkbook(template, [], new Date()), /取扱会社が登録された物件がありません/);
});

test("複数社は会社ごとの xlsx を zip にまとめ、ファイル名の頭に50音順の通し番号を付ける", () => {
  const { groups } = groupForConfirmation([
    property({ agencyName: "(株)タテイワ" }),
    property({ agencyName: "くらすONE(株)" }),
    property({ agencyName: "くらすONE(株)", listingCompanyNo: "2" }),
  ]);
  const zip = unzipSync(buildConfirmationZip(template, groups, new Date(2026, 9, 15), "20261015"));
  assert.deepEqual(Object.keys(zip), [
    "001_物件確認依頼_(株)タテイワ_20261015.xlsx",
    "002_物件確認依頼_くらすONE(株)_20261015.xlsx",
  ]);
  const { names, sheets } = open(zip["002_物件確認依頼_くらすONE(株)_20261015.xlsx"]);
  assert.deepEqual(names, ["くらすONE(株)"]);
  assert.equal(cell(sheets[0], "O1"), "2件");
});

test("ファイル名は Windows で使えない文字を外し、重複しない", () => {
  const used = new Set<string>();
  assert.equal(confirmationFileName('A/B:C*"本店"', "20261015", used), "物件確認依頼_ABC本店_20261015");
  assert.equal(confirmationFileName("abc本店", "20261015", used), "物件確認依頼_abc本店~2_20261015", "大文字小文字だけの違いも重複");
});
