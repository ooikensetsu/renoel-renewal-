/**
 * 取扱会社名の読み（2026-10-19）。物件確認依頼書を取扱会社の50音順に並べるために使う。
 *
 * 会社名は漢字が多く（「播磨不動産」「赤鹿地所」など）、文字コード順では50音順にならない。
 * 読みは管理画面（/admin/agency-readings）で登録し、AgencyReading 表に会社名ごとに持つ。
 * 初期値は辞書で推定した読み（scripts/estimate-agency-readings.mjs）で、推定の印を付けておく。
 *
 * - 読みには「株式会社」「(株)」などの会社の種類を含めない（50音順の並べ方の慣例）
 * - 支店名は読みに含めてよい。同じ会社の支店どうしが並ぶ
 * - 読みが無い会社は、並びの最後に会社名順で置く
 *
 * DBに触らない純関数にして、テストで固定している（D-06）。
 */

/** 会社の種類の表記。読みの推定の前に会社名から外す。 */
const CORPORATE_FORMS = [
  "株式会社",
  "有限会社",
  "合同会社",
  "合資会社",
  "合名会社",
  "一般社団法人",
  "一般財団法人",
  "(株)",
  "(有)",
  "(同)",
  "(資)",
  "(名)",
  "㈱",
  "㈲",
];

/** 会社名から会社の種類の表記を外す（全角の括弧も同じに扱う）。読みの推定に使う。 */
export function stripCorporateForm(name: string): string {
  let result = name.normalize("NFKC");
  for (const form of CORPORATE_FORMS) result = result.split(form.normalize("NFKC")).join(" ");
  return result.replace(/\s+/g, " ").trim();
}

/**
 * 読みを保存する形にそろえる。半角カナ・全角英数を直し、カタカナはひらがなにし、空白は1つにする。
 * 長音（ー）はそのまま残す（50音順の比較では直前の母音として扱われる）。
 */
export function normalizeReading(reading: string): string {
  return reading
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, " ")
    .trim();
}

/** 読みとして受け付けるか。ひらがな・長音・英数字・空白・一部の記号だけにする（漢字が残った推定を見分ける）。 */
export function isValidReading(reading: string): boolean {
  return /^[ぁ-ゖー・a-zA-Z0-9 .&'-]+$/.test(normalizeReading(reading));
}

/** 形態素解析（kuromoji）の結果の1語。読みが無い語（英字など）は reading が無いか「*」。 */
export type ReadingToken = { surface_form: string; reading?: string };

/**
 * 形態素解析の結果から読みを作る（推定。scripts/estimate-agency-readings.mjs で使う）。
 * 英字・数字は読みが無いためそのまま残す。括弧・中黒・句読点・空白は外す。
 * 辞書に無い漢字が残ると isValidReading で弾かれ、その会社は未登録のまま残る。
 */
export function readingFromTokens(tokens: readonly ReadingToken[]): string {
  const joined = tokens
    .map((t) => (t.reading && t.reading !== "*" ? t.reading : t.surface_form))
    .join("")
    .replace(/[()（）〔〕［］[\]「」【】・,、.。\s]/g, "");
  return normalizeReading(joined);
}

const collator = new Intl.Collator("ja");

/**
 * 会社を50音順に比べる。読みがある会社が先、読みの無い会社は後ろで会社名順。
 * 読みが同じなら会社名で比べる（「(株)ここいえ 姫路店」と「（株）ここいえ姫路店」が隣に並ぶ）。
 */
export function compareAgencies(
  a: { agencyName: string; reading: string | null },
  b: { agencyName: string; reading: string | null }
): number {
  if (a.reading && !b.reading) return -1;
  if (!a.reading && b.reading) return 1;
  if (a.reading && b.reading) {
    const byReading = collator.compare(a.reading, b.reading);
    if (byReading !== 0) return byReading;
  }
  return collator.compare(a.agencyName, b.agencyName);
}
