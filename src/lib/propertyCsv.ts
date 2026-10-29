/**
 * 物件CSVの列（書き出しと取込で共用。2026-10-15）。
 *
 * 掲載会社へ掲載許可を取るための確認表として書き出し、公開状態などを直して
 * 「一括入力 (CSV)」で戻すと、HPと管理画面の物件情報が上書きされる（大野の決定・案B）。
 *
 * - 書き出しは取込が書く列をすべて含める。欠けた列は取込で空に上書きされるため
 *   （propertyCsv.test.ts で BULK_UPSERT_COLUMNS と突き合わせて固定している）
 * - 列名は日本語。取込は日本語・英語（athome 取込用CSVの列名）のどちらも受ける
 * - 公開状態・物件種別は表示名で書き、取込で番号に戻す
 * - 番号の列は ="…" で書く。Excel で開いたときに先頭の0が落ちる・「9/6」が日付になるのを防ぐ
 * - 取扱会社のFAX番号は台帳（Agency 表）から書き出すだけで、取込では読まない（2026-10-29）。
 *   物件にFAXの欄は無く、台帳が正本のため。直すときは管理画面の「取扱会社」で直す
 *
 * DBに触らない純関数にして、テストで固定している（D-06）。
 */

// 相対パス＋拡張子つきで書くのは、node の標準テストランナーから読めるようにするため。
import { DISCLOSURE_LEVEL, DISCLOSURE_LEVEL_LABEL, type DisclosureLevel } from "../config/security.ts";
import { PROPERTY_TYPE_LABEL } from "../config/property.ts";
import { BULK_UPSERT_COLUMNS } from "./propertyBulkUpsert.ts";
import { isBlankMark } from "./blank.ts";
import type { AgencyContact } from "./confirmationRequestXlsx.ts";

/** level＝公開状態の表示名、type＝物件種別の表示名、date＝年月日、code＝Excelに崩させない番号 */
type ColumnFormat = "level" | "type" | "date" | "code";

/**
 * 書き出す列と順番。先頭は取扱会社（会社ごとに確認するため）、次が公開状態。
 * exportOnly の列は書き出すだけで、取込では読まない。
 */
export const PROPERTY_CSV_COLUMNS: readonly {
  key: string;
  header: string;
  format?: ColumnFormat;
  exportOnly?: boolean;
}[] = [
  { key: "agencyName", header: "取扱会社" },
  { key: "disclosureLevel", header: "公開状態", format: "level" },
  { key: "listingCompanyNo", header: "掲載会社管理番号", format: "code" },
  { key: "syubetu", header: "物件種別", format: "type" },
  { key: "title", header: "物件名" },
  { key: "address", header: "所在地" },
  { key: "priceMan", header: "価格（万円）" },
  { key: "madori", header: "間取り" },
  { key: "agencyTel", header: "取扱会社電話番号", format: "code" },
  { key: "agencyFax", header: "取扱会社FAX番号", format: "code", exportOnly: true },
  { key: "agencyAddress", header: "取扱会社所在地" },
  { key: "agencyLicense", header: "取扱会社免許番号" },
  { key: "objMngNo", header: "物件管理番号", format: "code" },
  { key: "syumoku", header: "物件種目" },
  { key: "landMen", header: "土地面積（㎡）" },
  { key: "bldMen", header: "建物面積（㎡）" },
  { key: "bldStructure", header: "建物構造" },
  { key: "bldY", header: "築年" },
  { key: "bldM", header: "築月" },
  { key: "floorsInfo", header: "階建/階" },
  { key: "parking", header: "駐車場" },
  { key: "currentState", header: "現況" },
  { key: "prefCd", header: "都道府県コード", format: "code" },
  { key: "cityCd", header: "市区町村コード", format: "code" },
  { key: "trafficNote", header: "交通" },
  { key: "trafficLine", header: "沿線名" },
  { key: "trafficStation", header: "駅名" },
  { key: "walkMinutes", header: "駅から徒歩（分）" },
  { key: "leaseTermRent", header: "借地期間・地代" },
  { key: "keyMoney", header: "権利金" },
  { key: "depositGuarantee", header: "敷金・保証金" },
  { key: "maintenanceCost", header: "維持費等" },
  { key: "otherLumpSum", header: "その他一時金" },
  { key: "landRight", header: "土地権利" },
  { key: "deliveryTiming", header: "引渡可能時期" },
  { key: "transactionType", header: "取引態様" },
  { key: "publishedOn", header: "情報公開日", format: "date" },
  { key: "nextUpdateOn", header: "次回更新予定日", format: "date" },
  { key: "mgmtFeeYen", header: "管理費（円/月）" },
  { key: "repairFundYen", header: "修繕積立金（円/月）" },
  { key: "totalUnits", header: "総戸数" },
  { key: "floorNo", header: "所在階" },
  { key: "direction", header: "向き" },
  { key: "balconyMen", header: "バルコニー面積（㎡）" },
  { key: "mgmtForm", header: "管理形態" },
  { key: "buildingCoverage", header: "建ぺい率（%）" },
  { key: "floorAreaRatio", header: "容積率（%）" },
  { key: "zoning", header: "用途地域" },
  { key: "landCategory", header: "地目" },
  { key: "cityPlanning", header: "都市計画" },
  { key: "roadAccess", header: "接道状況" },
  { key: "privateRoad", header: "私道負担" },
];

/** 書き出すだけの列の列名。取込では捨てる。 */
const EXPORT_ONLY_HEADERS = new Set(PROPERTY_CSV_COLUMNS.filter((c) => c.exportOnly).map((c) => c.header));

/** 列名（日本語）→ 取込の項目名。変更箇所の表示にも使う。 */
const KEY_OF_HEADER = new Map(PROPERTY_CSV_COLUMNS.map((c) => [c.header, c.key]));
const HEADER_OF_KEY = new Map(PROPERTY_CSV_COLUMNS.map((c): [string, string] => [c.key, c.header]));

/** 項目名の日本語表記。CSVの列に無い項目は項目名のまま。 */
export function propertyCsvHeaderOf(key: string): string {
  return HEADER_OF_KEY.get(key) ?? key;
}

/** 運用で「非公開」と呼ぶため、「非表示」と同じに扱う。 */
const LEVEL_ALIASES: Record<string, DisclosureLevel> = { 非公開: DISCLOSURE_LEVEL.HIDDEN };

function codeOfLabel(labels: Record<number, string>, value: string): string | null {
  const hit = Object.entries(labels).find(([, label]) => label === value);
  return hit ? hit[0] : null;
}

/** 日付を「2026/10/15」で書く。DBの日付は UTC の0時で入っている（src/lib/dates.ts）。 */
function formatDate(value: unknown): string {
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}/${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())}`;
}

function formatValue(value: unknown, format: ColumnFormat | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  if (format === "level") return DISCLOSURE_LEVEL_LABEL[value as DisclosureLevel] ?? String(value);
  if (format === "type") return PROPERTY_TYPE_LABEL[value as number] ?? String(value);
  if (format === "date") return formatDate(value);
  if (format === "code") return `="${String(value).replace(/"/g, "")}"`;
  return String(value);
}

/** CSVの1セル。カンマ・引用符・改行を含めば引用符で囲む（RFC 4180）。 */
function csvCell(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * 物件のCSV本文（BOM なし・改行 CRLF）。取扱会社→掲載会社管理番号の順に並べ、
 * 取扱会社が未登録の物件は最後にまとめる。
 * @param contacts 会社名 → 台帳の電話・FAX（確認依頼書と同じ getAgencyContactMap の値）。FAX番号の列に使う
 */
export function buildPropertyCsv(
  properties: readonly Record<string, unknown>[],
  contacts: ReadonlyMap<string, AgencyContact> = new Map()
): string {
  const name = (p: Record<string, unknown>) => String(p.agencyName ?? "").trim();
  const sorted = [...properties].sort((a, b) => {
    const an = name(a);
    const bn = name(b);
    if (an === "" || bn === "") return an === bn ? 0 : an === "" ? 1 : -1;
    return (
      an.localeCompare(bn, "ja") ||
      String(a.listingCompanyNo ?? "").localeCompare(String(b.listingCompanyNo ?? ""), "ja", { numeric: true })
    );
  });
  const header = PROPERTY_CSV_COLUMNS.map((c) => csvCell(c.header)).join(",");
  const lines = sorted.map((p) => {
    const withFax: Record<string, unknown> = { ...p, agencyFax: contacts.get(name(p))?.fax ?? null };
    return PROPERTY_CSV_COLUMNS.map((c) => csvCell(formatValue(withFax[c.key], c.format))).join(",");
  });
  return [header, ...lines].join("\r\n");
}

/** ="…" を外す。Excel を通さずにそのまま戻されたファイルのため。 */
function unwrapExcelText(value: string): string {
  const m = value.match(/^="([\s\S]*)"$/);
  return m ? m[1] : value;
}

/**
 * 取込前に、CSVの1行を取込の項目名と値にそろえる。
 * 日本語の列名は項目名に、公開状態・物件種別の表示名は番号にする。
 * 読めない表示名はそのまま残し、取込側の検証で止める（黙って既定値にしない）。
 */
export function normalizePropertyCsvRow(raw: Record<string, string>): Record<string, string> {
  const row: Record<string, string> = {};
  for (const [header, rawValue] of Object.entries(raw)) {
    if (EXPORT_ONLY_HEADERS.has(header.trim())) continue;
    const key = KEY_OF_HEADER.get(header.trim()) ?? header.trim();
    const value = unwrapExcelText(rawValue.trim()).trim();
    if (key === "disclosureLevel") {
      const alias = LEVEL_ALIASES[value];
      row[key] = alias !== undefined ? String(alias) : (codeOfLabel(DISCLOSURE_LEVEL_LABEL, value) ?? value);
    } else if (key === "syubetu") {
      row[key] = codeOfLabel(PROPERTY_TYPE_LABEL, value) ?? value;
    } else {
      row[key] = value;
    }
  }
  return row;
}

/**
 * 比べるための値。日付は時刻の数値で比べる。
 * 空文字・null・「-」などの値なし記号は同じに扱う。古い取込で「-」のまま入った物件があり
 * （モリシタ版の開発DBで958件）、取込は「-」を空にするが、表示はどちらも同じ（src/lib/blank.ts）。
 */
function comparable(value: unknown): unknown {
  if (isBlankMark(value)) return null;
  if (value instanceof Date) return value.getTime();
  return value;
}

/**
 * 取込で上書きすると変わる項目の日本語名（BULK_UPSERT_COLUMNS の順）。
 * 取込前の確認画面に出す。見ていない列があると、その列だけ変わる取込が「変更なし」に見える。
 */
export function changedPropertyColumns(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>
): string[] {
  return BULK_UPSERT_COLUMNS.filter(([name]) => comparable(existing[name]) !== comparable(incoming[name])).map(
    ([name]) => propertyCsvHeaderOf(name)
  );
}
