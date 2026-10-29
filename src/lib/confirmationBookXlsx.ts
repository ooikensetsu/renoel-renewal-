/**
 * 物件確認依頼書を全社まとめて1冊にする（一括印刷用。2026-10-19）。
 *
 * 会社ごとの xlsx を1つずつ開いて印刷する手間をなくすため、全社を1枚のシートに縦に並べ、
 * 様式1枚分（33行）ごとに改ページを入れる。会社の並びは groupForConfirmation の50音順。
 *
 * - 会社ごとにシートを分けた版（817社・942枚）は Excel が応答しなくなったため、シートは分けない
 * - 様式は「1ページに収める」設定（fitToPage）。このままだとシート全体が1ページに縮むため、
 *   「横1ページ・縦は自動」にする。様式の倍率80%で刷ると右端のR列が別ページにはみ出した
 *   （どちらも Excel で PDF にして確かめた。2026-10-19）
 * - Excel の手動の改ページは1シート1,026個まで。それを超える量はシートを分ける（PAGES_PER_SHEET）
 * - 様式の印刷部数（copies="4"）はこの1冊では外す（全社分を4部ずつ刷らないため）
 *
 * DBに触らない純関数にして、テストで固定している（D-06）。
 */

import {
  ROWS_PER_SHEET,
  excelDateSerial,
  fillSheet,
  finishWorkbook,
  openTemplate,
  type ConfirmationGroup,
  type FinishedSheet,
} from "./confirmationRequestXlsx.ts";

/** 様式1枚分の行数（1〜33行目） */
export const ROWS_PER_PAGE = 33;
/** 1シートに入れる様式の枚数。改ページの上限（1,026）に余裕を持たせる */
export const PAGES_PER_SHEET = 1000;

/** 行番号を offset だけ下へずらす（セル番地・行・数式の参照）。 */
function shiftRef(ref: string, offset: number): string {
  return ref.replace(/^(\$?[A-Z]{1,3}\$?)(\d+)$/, (_, col: string, row: string) => `${col}${Number(row) + offset}`);
}

function shiftFormula(formula: string, offset: number): string {
  // 関数名（COUNTA など）は後ろに数字が無いので当たらない
  return formula.replace(/(\$?[A-Z]{1,3}\$?)(\d+)(?![\d(])/g, (_, col: string, row: string) => `${col}${Number(row) + offset}`);
}

/** 1枚分のシートから行（sheetData の中身）と結合セルを取り出し、offset 行下へずらす。 */
export function shiftPage(sheetXml: string, offset: number): { rows: string; merges: string[] } {
  const data = sheetXml.match(/<sheetData>([\s\S]*?)<\/sheetData>/);
  if (!data) throw new Error("様式の表を読めません");
  const rows = data[1]
    .replace(/<row r="(\d+)"/g, (_, row: string) => `<row r="${Number(row) + offset}"`)
    .replace(/<c r="([A-Z]{1,3}\d+)"/g, (_, ref: string) => `<c r="${shiftRef(ref, offset)}"`)
    .replace(/(<f\b[^>]*>)([\s\S]*?)(<\/f>)/g, (_, open: string, f: string, close: string) => open + shiftFormula(f, offset) + close);
  const merges = [...sheetXml.matchAll(/<mergeCell ref="([A-Z]+\d+):([A-Z]+\d+)"\/>/g)].map(
    (m) => `${shiftRef(m[1], offset)}:${shiftRef(m[2], offset)}`
  );
  return { rows, merges };
}

/** 様式を縦に並べた1シートを作る。pages は fillSheet で作った1枚分のシートの XML。 */
function stackPages(pages: readonly string[], first: boolean): string {
  const rows: string[] = [];
  const merges: string[] = [];
  pages.forEach((page, i) => {
    const shifted = shiftPage(page, i * ROWS_PER_PAGE);
    rows.push(shifted.rows);
    merges.push(...shifted.merges);
  });
  const lastRow = pages.length * ROWS_PER_PAGE;
  // 改ページは各ページの最終行の後ろ（最後のページの後ろには入れない）
  const breaks = Array.from(
    { length: pages.length - 1 },
    (_, i) => `<brk id="${(i + 1) * ROWS_PER_PAGE}" max="16383" man="1"/>`
  );
  return pages[0]
    .replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:R${lastRow}"/>`)
    .replace(/ tabSelected="1"/, first ? ' tabSelected="1"' : "")
    .replace(/<sheetData>[\s\S]*?<\/sheetData>/, `<sheetData>${rows.join("")}</sheetData>`)
    .replace(
      /<mergeCells count="\d+">[\s\S]*?<\/mergeCells>/,
      `<mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>`
    )
    .replace(/(<pageSetup [^>]*?) copies="\d+"/, "$1")
    .replace(/<pageSetup /, '<pageSetup fitToWidth="1" fitToHeight="0" ')
    .replace(
      /(<pageSetup [^>]*\/>)/,
      breaks.length > 0
        ? `$1<rowBreaks count="${breaks.length}" manualBreakCount="${breaks.length}">${breaks.join("")}</rowBreaks>`
        : "$1"
    );
}

/** シート名。1シートに収まれば「一括印刷」、分けるときは「一括印刷1」「一括印刷2」。 */
function bookSheetName(index: number, count: number): string {
  return count === 1 ? "一括印刷" : `一括印刷${index + 1}`;
}

/**
 * 全社の確認依頼書を1冊の xlsx にする。
 * @returns xlsx と、様式の枚数（印刷されるページ数）
 */
export function buildConfirmationBook(
  template: Uint8Array,
  groups: readonly ConfirmationGroup[],
  today: Date
): { bytes: Uint8Array; pages: number } {
  if (groups.length === 0) throw new Error("取扱会社が登録された物件がありません");
  const book = openTemplate(template);
  const serial = excelDateSerial(today);
  const pages: string[] = [];
  for (const group of groups) {
    const count = Math.ceil(group.properties.length / ROWS_PER_SHEET);
    for (let page = 1; page <= count; page++) {
      // 開いたとき選ばれている印（tabSelected）は stackPages が1シート目だけに残す
      pages.push(fillSheet(book.sheetTemplate, book.styles, group, page, count, serial, true));
    }
  }
  const sheetCount = Math.ceil(pages.length / PAGES_PER_SHEET);
  const sheets: FinishedSheet[] = Array.from({ length: sheetCount }, (_, i) => {
    const part = pages.slice(i * PAGES_PER_SHEET, (i + 1) * PAGES_PER_SHEET);
    return {
      name: bookSheetName(i, sheetCount),
      xml: stackPages(part, i === 0),
      lastRow: part.length * ROWS_PER_PAGE,
    };
  });
  return { bytes: finishWorkbook(book, sheets), pages: pages.length };
}
