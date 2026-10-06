/**
 * 物件の一括取込を **新規1文＋更新1文** で行うための組み立て。
 *
 * 【なぜ必要か】
 * 以前は行数分の upsert を送っていた。ローカルでは959行が0.7秒で終わるが、
 * 本番は Vercel（関数）と Supabase（DB）が離れており、
 * 1文ごとの往復時間が積み上がる。959文 × 往復およそ0.3秒で300秒を超え、
 * `Vercel Runtime Timeout Error: Task timed out after 300 seconds` で
 * 中止していた（2026-09-02・モリシタ版で発生。RENOEL へは 2026-10-13 に移植）。文の数を減らさない限り、トランザクションの
 * 書き方を変えても解決しない。
 *
 * 【やり方】
 * 全行を JSON 1個にまとめて引数1つで渡し、`jsonb_array_elements` で行に開いて
 * 1文で流し込む。行数がいくつでも、送る文は1つ・引数は1つ。
 *
 * 【なぜ列ごとの配列ではなく JSON なのか】
 * 列ごとに配列を渡す形も試したが、ある列が全行 null だと、
 * ドライバがその配列の型を決められず `integer[]` として送ってしまい、
 * `cannot cast type integer[] to timestamp without time zone[]` で落ちた
 * （publishedOn / nextUpdateOn は空のことがあるため、実際に起きる）。
 * JSON なら値の型を推測させず、列ごとに SQL 側で明示的に変換できる。
 * 文字列の引用符・カンマ・波括弧の扱いも JSON に任せられる。
 *
 * 【SQL文を組み立てているが、入力は混ぜていない】
 * 文字列として組み立てるのは、下の表に**直書きした列名と型だけ**。
 * 取り込む値は JSON 1個にまとめて引数として渡す（SQL文には入らない）。
 */

export const BULK_UPSERT_COLUMNS = [
  ["objMngNo", "bigint"],
  ["syubetu", "integer"],
  ["syumoku", "text"],
  ["title", "text"],
  ["priceMan", "integer"],
  ["madori", "text"],
  ["landMen", "double precision"],
  ["bldMen", "double precision"],
  ["bldStructure", "text"],
  ["bldY", "integer"],
  ["bldM", "integer"],
  ["address", "text"],
  ["prefCd", "text"],
  ["cityCd", "text"],
  ["disclosureLevel", "integer"],
  ["currentState", "text"],
  ["trafficNote", "text"],
  ["trafficLine", "text"],
  ["trafficStation", "text"],
  ["walkMinutes", "integer"],
  ["leaseTermRent", "text"],
  ["keyMoney", "text"],
  ["depositGuarantee", "text"],
  ["maintenanceCost", "text"],
  ["otherLumpSum", "text"],
  ["floorsInfo", "text"],
  ["parking", "text"],
  ["landRight", "text"],
  ["deliveryTiming", "text"],
  ["transactionType", "text"],
  ["listingCompanyNo", "text"],
  ["publishedOn", "timestamp"],
  ["nextUpdateOn", "timestamp"],
  ["mgmtFeeYen", "integer"],
  ["repairFundYen", "integer"],
  ["totalUnits", "integer"],
  ["floorNo", "integer"],
  ["direction", "text"],
  ["balconyMen", "double precision"],
  ["mgmtForm", "text"],
  ["buildingCoverage", "integer"],
  ["floorAreaRatio", "integer"],
  ["zoning", "text"],
  ["landCategory", "text"],
  ["cityPlanning", "text"],
  ["roadAccess", "text"],
  ["privateRoad", "text"],
  ["agencyName", "text"],
  ["agencyAddress", "text"],
  ["agencyTel", "text"],
  ["agencyLicense", "text"],
] as const satisfies readonly (readonly [string, string])[];

/** 取込1行分。BULK_UPSERT_COLUMNS の列名をすべて持つ。 */
export type BulkUpsertRow = Record<
  (typeof BULK_UPSERT_COLUMNS)[number][0],
  string | number | bigint | boolean | Date | null
>;

/** JSON の各値（text）を列の型へ変換する式。値が無ければ null のまま入る。 */
function castSelects(): string {
  return BULK_UPSERT_COLUMNS.map(([name, sqlType]) => {
    const value = `r->>'${name}'`;
    if (sqlType === "text") return value;
    // 日時は UTC の瞬間として解釈してから、時差を持たない列に合わせる
    // （Prisma が書くときと同じ形にそろえる）。
    if (sqlType === "timestamp") return `(${value})::timestamptz AT TIME ZONE 'UTC'`;
    return `(${value})::${sqlType}`;
  }).join(", ");
}

/** 行を JSON にする。BigInt と Date は JSON.stringify がそのままでは扱えない。 */
function toPayload(rows: readonly BulkUpsertRow[], ids?: readonly number[]): string {
  // 数値は文字列にしても SQL 側で列の型へ変換するため、精度は落ちない。
  const payload = rows.map((row, i) => {
    const out: Record<string, string | number | boolean | null> = {};
    for (const [name] of BULK_UPSERT_COLUMNS) {
      const value = row[name];
      out[name] =
        value === null || value === undefined ? null
        : typeof value === "bigint" ? value.toString()
        : value instanceof Date ? value.toISOString()
        : value;
    }
    if (ids) out.id = ids[i];
    return out;
  });
  return JSON.stringify(payload);
}

/**
 * 新規の行をまとめて1文で入れる SQL と、その引数を組み立てる。
 *
 * 突合（どの行が新規か）は呼び出し側が src/lib/importMatch.ts で決めてから渡す。
 * 2026-10-06 まではここで `ON CONFLICT ("objMngNo")` により突合していたが、
 * 突合キーを「取扱店＋掲載会社管理番号」に変えたため、DBの一意制約では判定しない。
 * 物件管理番号が既存と重なれば一意制約で落ち、トランザクションごと巻き戻る。
 *
 * @returns `sql` は `$1` を1つだけ含む文。`values` はその引数（JSON 文字列1個）。
 */
export function buildBulkInsert(rows: readonly BulkUpsertRow[]): {
  sql: string;
  values: [string];
} {
  if (rows.length === 0) {
    throw new Error("buildBulkInsert: 行が空のまま呼ばれた");
  }
  const columnNames = BULK_UPSERT_COLUMNS.map(([name]) => `"${name}"`).join(", ");
  const sql =
    `INSERT INTO "Property" (${columnNames}, "createdAt", "updatedAt") ` +
    `SELECT ${castSelects()}, NOW(), NOW() ` +
    `FROM jsonb_array_elements($1::jsonb) AS r`;
  return { sql, values: [toPayload(rows)] };
}

/**
 * 既存の行を id 指定でまとめて1文で更新する SQL と、その引数を組み立てる。
 * 物件管理番号を含む全列を取込の値で上書きする（2026-10-06 大野の決定）。
 * `createdAt` は触らない。`updatedAt` はここで明示的に入れる（Prisma の `@updatedAt` が効かない経路）。
 *
 * @param ids rows と同じ順で、上書きする既存物件の id
 */
export function buildBulkUpdateById(
  rows: readonly BulkUpsertRow[],
  ids: readonly number[]
): { sql: string; values: [string] } {
  if (rows.length === 0) {
    throw new Error("buildBulkUpdateById: 行が空のまま呼ばれた");
  }
  if (rows.length !== ids.length || !ids.every((id) => Number.isInteger(id) && id > 0)) {
    throw new Error("buildBulkUpdateById: 行と id の数が合わないか、id が正しくない");
  }
  const columnNames = BULK_UPSERT_COLUMNS.map(([name]) => `"${name}"`).join(", ");
  const assignments = BULK_UPSERT_COLUMNS.map(([name]) => `"${name}" = v."${name}"`).join(", ");
  const sql =
    `UPDATE "Property" AS p SET ${assignments}, "updatedAt" = NOW() ` +
    `FROM (SELECT (r->>'id')::integer AS "id", ${castSelects()} ` +
    `FROM jsonb_array_elements($1::jsonb) AS r) AS v(id, ${columnNames}) ` +
    `WHERE p."id" = v."id"`;
  return { sql, values: [toPayload(rows, ids)] };
}
