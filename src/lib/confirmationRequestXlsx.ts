/**
 * 物件確認依頼書（Excel）を取扱会社ごとに作る（2026-10-15）。
 *
 * 様式はモリシタハウスから受け取った xlsx（src/lib/confirmationTemplate.ts に埋め込んである）。
 * 様式の見た目を崩さないよう、xlsx を開いて表のシートを複製し、セルの値だけを書き換える。
 * Excel 操作の部品（exceljs）は依存が9個あるため使わず、zip の展開と圧縮だけを fflate で行う。
 *
 * - 1枚に10件。10件を超える会社は2枚目以降のシートに続ける（No. は通し番号）
 * - 取扱会社が未登録の物件は書き出さない（宛先が無いため）
 * - 「使い方」シートは送付先に要らないため外す
 * - 弊社管理番号の欄には掲載会社管理番号を入れる（2026-10-15 大野の指示）。御社管理番号の欄は空けておく
 * - 直近確認時の状況の欄には、物件確認の最新の状況（有・商談・保留・中止・済）を入れる。記録が無ければ空欄
 *   （2026-10-27 大野の指示。それまでは公開状態を入れていたが、公開状態は社内の区分で取扱会社には意味が無い）
 * - 分譲地名・マンション名の欄には、マンションの物件名だけを入れる。戸建て・土地の物件名は
 *   所在地と駅から自動で作った文（例「姫路市 相野（太市駅） 2階建 4LDK」）で、分譲地名ではない
 * - 様式の欄に収まらない値があるため、書式を2つ足す（Excel で開いて確かめた。2026-10-15）
 *   掲載会社管理番号は15桁あり両端が切れた → 「縮小して全体を表示」
 *   マンション名は9ポイントで3行になり上下が切れた → 8ポイント
 *
 * DBに触らない純関数にして、テストで固定している（D-06）。
 */

// 相対パス＋拡張子つきで書くのは、node の標準テストランナーから読めるようにするため。
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { PROPERTY_TYPE, PROPERTY_TYPE_LABEL } from "../config/property.ts";
import { isBlankMark } from "./blank.ts";
import { compareAgencies } from "./agencyReading.ts";

export const ROWS_PER_SHEET = 10;
/** 1件目の上段の行。1件は上下2行を使う（様式の12〜31行目）。 */
const FIRST_ROW = 12;
const SHEET_PATH = "xl/worksheets/sheet1.xml";

export type ConfirmationProperty = {
  agencyName: string | null;
  agencyTel: string | null;
  listingCompanyNo: string | null;
  syubetu: number;
  /** 物件確認の最新の状況（PropertyConfirmation の直近の行）。記録が無ければ null */
  confirmationStatus: string | null;
  title: string;
  address: string | null;
  landMen: number | null;
  bldMen: number | null;
  priceMan: number;
};

export type ConfirmationGroup = {
  agencyName: string;
  /** 50音順に並べるための読み。未登録なら null（並びの最後に置く） */
  reading: string | null;
  agencyTel: string;
  /** 取扱会社の台帳のFAX番号。台帳に無ければ空（様式の欄を手書き用に空ける） */
  agencyFax: string;
  properties: ConfirmationProperty[];
};

/** 取扱会社の台帳（Agency）の連絡先。会社名 → 値 */
export type AgencyContact = { tel: string | null; fax: string | null };

const text = (value: unknown) => (isBlankMark(value) ? "" : String(value).trim());

/**
 * 取扱会社ごとにまとめる。会社は読みの50音順（2026-10-19。読みの無い会社は最後に会社名順）、
 * 会社の中は掲載会社管理番号順。
 * 電話番号は台帳（会社側が正本）を優先し、台帳に無ければ物件で最初に見つかった番号を使う。
 * FAX番号は台帳にだけある（2026-10-26 から書く）。
 * @param readings 会社名 → 読み（AgencyReading 表の値）
 * @param contacts 会社名 → 台帳の電話・FAX（Agency 表の値）
 */
export function groupForConfirmation(
  properties: readonly ConfirmationProperty[],
  readings: ReadonlyMap<string, string> = new Map(),
  contacts: ReadonlyMap<string, AgencyContact> = new Map()
): {
  groups: ConfirmationGroup[];
  skipped: number;
  /** 読みが未登録の会社の数 */
  unread: number;
} {
  const byAgency = new Map<string, ConfirmationGroup>();
  let skipped = 0;
  for (const p of properties) {
    const name = text(p.agencyName);
    if (name === "") {
      skipped++;
      continue;
    }
    const group = byAgency.get(name) ?? {
      agencyName: name,
      reading: readings.get(name) || null,
      agencyTel: text(contacts.get(name)?.tel),
      agencyFax: text(contacts.get(name)?.fax),
      properties: [],
    };
    if (group.agencyTel === "") group.agencyTel = text(p.agencyTel);
    group.properties.push(p);
    byAgency.set(name, group);
  }
  const groups = [...byAgency.values()].sort(compareAgencies);
  for (const g of groups) {
    g.properties.sort((a, b) =>
      text(a.listingCompanyNo).localeCompare(text(b.listingCompanyNo), "ja", { numeric: true })
    );
  }
  return { groups, skipped, unread: groups.filter((g) => !g.reading).length };
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 様式のセル要素（<c r="A3" .../> または <c r="A3" ...>…</c>）を探す。 */
function cellPattern(ref: string): RegExp {
  return new RegExp(`<c r="${ref}"(?: [^>]*?)?(?:/>|>[\\s\\S]*?</c>)`);
}

/**
 * セルの値を書き換える。書式（s 属性）は様式のまま残す。
 * 様式に無いセルは書けないため止める（様式が差し替えられて位置がずれたことに気付くため）。
 */
function setCell(
  xml: string,
  ref: string,
  value: string | number | null,
  restyle?: (style: number) => number
): string {
  const pattern = cellPattern(ref);
  const found = xml.match(pattern);
  if (!found) throw new Error(`様式に ${ref} のセルがありません`);
  const style = found[0].match(/ s="(\d+)"/);
  const s = style ? ` s="${restyle ? restyle(Number(style[1])) : style[1]}"` : "";
  let cell: string;
  if (value === null || value === "") cell = `<c r="${ref}"${s}/>`;
  else if (typeof value === "number") cell = `<c r="${ref}"${s}><v>${value}</v></c>`;
  else cell = `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
  return xml.replace(pattern, cell);
}

/** 数式のセルに、開いた直後に見える値（再計算前の値）を入れる。 */
function setCachedValue(xml: string, ref: string, value: string | number): string {
  const pattern = cellPattern(ref);
  const found = xml.match(pattern);
  if (!found || !found[0].includes("<f")) throw new Error(`様式の ${ref} に数式がありません`);
  return xml.replace(pattern, found[0].replace(/<v>[\s\S]*?<\/v>/, `<v>${escapeXml(String(value))}</v>`));
}

/**
 * 様式の書式表（xl/styles.xml）に、既存の書式を元にした書式を足す。
 * 同じ元の書式からは1回だけ作り、番号を使い回す。
 */
export class TemplateStyles {
  private fonts: string[];
  private xfs: string[];
  private made = new Map<string, number>();
  private xml: string;

  constructor(xml: string) {
    this.xml = xml;
    this.fonts = this.items(/<fonts\b[^>]*>([\s\S]*?)<\/fonts>/, /<font\/>|<font>[\s\S]*?<\/font>/g);
    this.xfs = this.items(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/, /<xf [^>]*?\/>|<xf [^>]*?>[\s\S]*?<\/xf>/g);
  }

  private items(section: RegExp, item: RegExp): string[] {
    const inner = this.xml.match(section);
    if (!inner) throw new Error("様式の書式表を読めません");
    return inner[1].match(item) ?? [];
  }

  /** 「縮小して全体を表示」にした書式（折り返しは外す。Excel は両方を同時に効かせない） */
  shrink = (style: number): number =>
    this.derive(style, "shrink", (xf) => {
      const base = xf.replace(/ wrapText="1"/, "");
      if (base.includes("<alignment")) return base.replace("<alignment", '<alignment shrinkToFit="1"');
      return base
        .replace(/\/>$/, "><alignment shrinkToFit=\"1\"/></xf>")
        .replace(/^<xf /, '<xf applyAlignment="1" ');
    });

  /** 文字を8ポイントにした書式 */
  small = (style: number): number =>
    this.derive(style, "small", (xf) => {
      const fontId = Number(xf.match(/ fontId="(\d+)"/)?.[1] ?? 0);
      const font = this.fonts[fontId].replace(/<sz val="[^"]*"\/>/, '<sz val="8"/>');
      this.fonts.push(font);
      return xf.replace(/ fontId="\d+"/, ` fontId="${this.fonts.length - 1}"`);
    });

  private derive(style: number, kind: string, change: (xf: string) => string): number {
    const key = `${kind}:${style}`;
    const done = this.made.get(key);
    if (done !== undefined) return done;
    const xf = this.xfs[style];
    if (!xf) throw new Error(`様式に書式 ${style} がありません`);
    this.xfs.push(change(xf));
    const id = this.xfs.length - 1;
    this.made.set(key, id);
    return id;
  }

  toXml(): string {
    return this.xml
      .replace(
        /<fonts count="\d+"([^>]*)>[\s\S]*?<\/fonts>/,
        `<fonts count="${this.fonts.length}"$1>${this.fonts.join("")}</fonts>`
      )
      .replace(/<cellXfs count="\d+">[\s\S]*?<\/cellXfs>/, `<cellXfs count="${this.xfs.length}">${this.xfs.join("")}</cellXfs>`);
  }
}

/** 面積の欄。様式の使い方どおり「土地:142.61」「建物:92.74」を改行で2行にする。 */
export function areaText(p: Pick<ConfirmationProperty, "landMen" | "bldMen">): string {
  const lines: string[] = [];
  if (p.landMen) lines.push(`土地:${p.landMen}`);
  if (p.bldMen) lines.push(`建物:${p.bldMen}`);
  return lines.join("\n");
}

/** Excel の日付の値（1900年方式。1899-12-30 からの日数）。日付は利用者の手元の日付で数える。 */
export function excelDateSerial(date: Date): number {
  const local = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((local - Date.UTC(1899, 11, 30)) / 86_400_000);
}

/**
 * Excel がシート名を同じとみなすかの比較用。大文字小文字・全角半角・ひらがなカタカナを区別しない。
 * 「(株)Cu life」と「（株）Cu life」、「あいホーム」と「アイホーム」の2シートを持つ版は、
 * どちらも Excel が黙って開かなかった（2026-10-15 に Excel で確かめた）。
 */
function sheetNameKey(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u3041-\u3096]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

/**
 * シート名。Excel の制約（31字以内・\ / ? * [ ] : を使えない・重複不可）に合わせる。
 * 2枚以上ある会社は「2枚目」のように枚数を後ろに付ける（「/」はシート名に使えない。
 * 「(1/3)」と付けた版は Excel が黙って開かなかった）。
 */
export function confirmationSheetName(
  agencyName: string,
  page: number,
  pages: number,
  used: Set<string>
): string {
  const suffix = pages > 1 ? ` ${page}枚目` : "";
  const base =
    [...agencyName]
      .map((ch) => {
        // Excel は全角と半角を同じ文字とみなすため、半角にした形で判定する
        // （全角の「／」なども使えない文字になる）
        const half = ch.normalize("NFKC");
        if (/[\\/?*[\]:]/.test(half)) return "";
        // 引用符（’‘＇）は Excel が「'」と同じに扱い、印刷範囲の式（'シート名'!…）が壊れて
        // 開けなかった（実例「(株)ANNE’S HOUSE」「（同）K＇sクルー」）。「'」にそろえ、式の側で二重にする
        if (half === "'" || ch === "\u2018" || ch === "\u2019") return "'";
        return ch;
      })
      .join("")
      .replace(/^'+|'+$/g, "")
      .trim() || "取扱会社";
  let name = [...base].slice(0, 31 - suffix.length).join("") + suffix;
  for (let n = 2; used.has(sheetNameKey(name)); n++) {
    const tail = `~${n}${suffix}`;
    name = [...base].slice(0, 31 - tail.length).join("") + tail;
  }
  used.add(sheetNameKey(name));
  return name;
}

/** 1枚分のシートを作る。 */
export function fillSheet(
  template: string,
  styles: TemplateStyles,
  group: ConfirmationGroup,
  page: number,
  pages: number,
  today: number,
  first: boolean
): string {
  const rows = group.properties.slice((page - 1) * ROWS_PER_SHEET, page * ROWS_PER_SHEET);
  let xml = template
    // 複製したシートで同じ識別子を持たないよう外す（Excel が保存時に付け直す）
    .replace(/ xr:uid="\{[^"]*\}"/, "")
    // 開いたときに選ばれているシートは1枚目だけにする
    .replace(/ tabSelected="1"/, first ? ' tabSelected="1"' : "")
    // プリンター固有の設定（printerSettings1.bin）への参照。複製に持ち越さない
    .replace(/(<pageSetup [^>]*?) r:id="[^"]*"/, "$1");

  xml = setCell(xml, "A3", group.agencyName);
  xml = setCell(xml, "C4", group.agencyTel ? `TEL: ${group.agencyTel}` : "TEL:");
  // 台帳にFAXが無い会社は、様式の「000-000-0000」を消し、手書きできるよう空ける
  xml = setCell(xml, "F4", group.agencyFax ? `FAX: ${group.agencyFax}` : "FAX:");
  xml = setCell(xml, "R1", `${page}/${pages}頁`);
  xml = setCachedValue(xml, "L1", today);
  xml = setCachedValue(xml, "O1", `${rows.length}件`);

  for (let i = 0; i < ROWS_PER_SHEET; i++) {
    const top = FIRST_ROW + i * 2;
    const bottom = top + 1;
    const p = rows[i];
    xml = setCell(xml, `A${top}`, (page - 1) * ROWS_PER_SHEET + i + 1);
    if (!p) continue;
    xml = setCell(xml, `B${bottom}`, text(p.listingCompanyNo), styles.shrink);
    xml = setCell(xml, `C${top}`, PROPERTY_TYPE_LABEL[p.syubetu] ?? "");
    xml = setCell(xml, `C${bottom}`, text(p.confirmationStatus));
    xml = setCell(xml, `D${top}`, p.syubetu === PROPERTY_TYPE.MANSION ? text(p.title) : "", styles.small);
    xml = setCell(xml, `E${top}`, text(p.address));
    xml = setCell(xml, `F${top}`, areaText(p));
    xml = setCell(xml, `G${top}`, p.priceMan);
  }
  return xml;
}

const SHEET_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/**
 * 確認依頼書の xlsx を作る。会社ごと・10件ごとに1シート。
 * @param template 様式の xlsx（confirmationTemplate() の値）
 * @param today    依頼日（様式の L1。開いたときに TODAY() で付け直される）
 */
export function buildConfirmationWorkbook(
  template: Uint8Array,
  groups: readonly ConfirmationGroup[],
  today: Date
): Uint8Array {
  if (groups.length === 0) throw new Error("取扱会社が登録された物件がありません");
  const book = openTemplate(template);
  const serial = excelDateSerial(today);
  const used = new Set<string>();
  const sheets: FinishedSheet[] = [];
  for (const group of groups) {
    const pages = Math.ceil(group.properties.length / ROWS_PER_SHEET);
    for (let page = 1; page <= pages; page++) {
      const xml = fillSheet(book.sheetTemplate, book.styles, group, page, pages, serial, sheets.length === 0);
      sheets.push({ name: confirmationSheetName(group.agencyName, page, pages, used), xml, lastRow: 33 });
    }
  }
  return finishWorkbook(book, sheets);
}

export type TemplateBook = {
  files: Record<string, Uint8Array>;
  /** 様式の表のシート（1枚分）の XML */
  sheetTemplate: string;
  styles: TemplateStyles;
};

export type FinishedSheet = { name: string; xml: string; /** 印刷範囲の最終行 */ lastRow: number };

/** 様式を開き、表のシート以外（使い方・計算順の記録・プリンター設定）を外す。 */
export function openTemplate(template: Uint8Array): TemplateBook {
  const files = unzipSync(template);
  const sheetTemplate = strFromU8(files[SHEET_PATH]);
  const styles = new TemplateStyles(strFromU8(files["xl/styles.xml"]));
  for (const path of Object.keys(files)) {
    if (/^xl\/worksheets\/|^xl\/calcChain\.xml$|^xl\/printerSettings\//.test(path)) delete files[path];
  }
  return { files, sheetTemplate, styles };
}

/** 作ったシートを入れ、シートの一覧・印刷範囲・参照先を作り直して xlsx に仕上げる。 */
export function finishWorkbook(book: TemplateBook, finished: readonly FinishedSheet[]): Uint8Array {
  const { files, styles } = book;
  const sheets = finished.map((s, i) => ({ ...s, path: `xl/worksheets/sheet${i + 1}.xml` }));
  for (const s of sheets) files[s.path] = strToU8(s.xml);
  files["xl/styles.xml"] = strToU8(styles.toXml());

  // workbook.xml：シートの一覧と印刷範囲を作り直す。開いたときに数式（日付・件数）を計算させる
  const quoted = (name: string) => `'${name.replace(/'/g, "''")}'`;
  let workbook = strFromU8(files["xl/workbook.xml"]);
  workbook = workbook
    .replace(
      /<sheets>[\s\S]*?<\/sheets>/,
      `<sheets>${sheets
        .map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join("")}</sheets>`
    )
    .replace(
      /<definedNames>[\s\S]*?<\/definedNames>/,
      `<definedNames>${sheets
        .map(
          (s, i) =>
            `<definedName name="_xlnm.Print_Area" localSheetId="${i}">${escapeXml(quoted(s.name))}!$A$1:$R$${s.lastRow}</definedName>`
        )
        .join("")}</definedNames>`
    )
    // 様式を作った人の手元のフォルダ名（C:\Users\…）を送付先に渡さない
    .replace(/<mc:AlternateContent[\s\S]*?<\/mc:AlternateContent>/, "")
    .replace(/<calcPr ([^/]*?)\/>/, '<calcPr $1 fullCalcOnLoad="1"/>');
  files["xl/workbook.xml"] = strToU8(workbook);

  const others = sheets.length;
  files["xl/_rels/workbook.xml.rels"] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets
        .map((s, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="${s.path.slice(3)}"/>`)
        .join("") +
      `<Relationship Id="rId${others + 1}" Type="${REL}/theme" Target="theme/theme1.xml"/>` +
      `<Relationship Id="rId${others + 2}" Type="${REL}/styles" Target="styles.xml"/>` +
      `<Relationship Id="rId${others + 3}" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/>` +
      "</Relationships>"
  );

  let types = strFromU8(files["[Content_Types].xml"]);
  types = types
    .replace(/<Override PartName="\/xl\/(worksheets\/[^"]+|calcChain\.xml)"[^>]*\/>/g, "")
    .replace(/<Default Extension="bin"[^>]*\/>/, "")
    .replace(
      "</Types>",
      sheets.map((s) => `<Override PartName="/${s.path}" ContentType="${SHEET_TYPE}"/>`).join("") + "</Types>"
    );
  files["[Content_Types].xml"] = strToU8(types);

  // シート名の一覧（docProps/app.xml）は様式の2枚分のまま食い違うため、最小の内容にする
  files["docProps/app.xml"] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
      "<Application>Microsoft Excel</Application></Properties>"
  );

  return zipSync(files, { level: 6 });
}

/**
 * ファイル名（拡張子なし）。Windows で使えない文字を外し、同じ名前が出たら「~2」を付ける。
 * Windows と macOS は大文字小文字を区別しないため、比較は小文字で行う。
 */
export function confirmationFileName(agencyName: string, date: string, used: Set<string>): string {
  const base = agencyName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").trim() || "取扱会社";
  let name = `物件確認依頼_${base}_${date}`;
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `物件確認依頼_${base}~${n}_${date}`;
  used.add(name.toLowerCase());
  return name;
}

/**
 * 複数社の確認依頼書を、会社ごとに1つの xlsx にして zip にまとめる（FAX を会社ごとに送るため）。
 * 1冊に全社を別シートで入れた版（817社・942枚）は、Excel が開いている途中で応答しなくなった（2026-10-15）。
 * 全社を一括で印刷するときは confirmationBookXlsx.ts の1冊を使う。
 * ファイル名の頭に50音順の通し番号（001_）を付け、名前順に並べると50音順になるようにする（2026-10-19）。
 */
export function buildConfirmationZip(
  template: Uint8Array,
  groups: readonly ConfirmationGroup[],
  today: Date,
  date: string
): Uint8Array {
  if (groups.length === 0) throw new Error("取扱会社が登録された物件がありません");
  const used = new Set<string>();
  const files: Record<string, Uint8Array> = {};
  const digits = Math.max(3, String(groups.length).length);
  groups.forEach((group, i) => {
    const order = String(i + 1).padStart(digits, "0");
    // xlsx はすでに圧縮されているため、zip では圧縮しない（時間がかかるだけで小さくならない）
    files[`${order}_${confirmationFileName(group.agencyName, date, used)}.xlsx`] = buildConfirmationWorkbook(
      template,
      [group],
      today
    );
  });
  return zipSync(files, { level: 0 });
}
