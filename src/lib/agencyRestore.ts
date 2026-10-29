/**
 * 取扱会社の保存・統合を、控え（PropertyImportBackup）から戻すときの判定（2026-10-22）。
 * 実際に戻すのは scripts/restore-agency-backup.mjs。DBに触らない純関数にしてテストで固定している（D-06）。
 *
 * 控えを取ったあとに人が物件を直していた場合、黙って上書きすると直した内容が消える。
 * 操作の直後の値のままの物件だけを戻し、変わっている物件は飛ばして一覧で知らせる。
 */

export type AgencyColumnsRow = {
  id: number;
  agencyName: string | null;
  agencyAddress: string | null;
  agencyTel: string | null;
  agencyLicense: string | null;
};

type Written = Partial<Omit<AgencyColumnsRow, "id">>;

export type RestorePlan = {
  /** 控えの値へ戻す物件 */
  restore: AgencyColumnsRow[];
  /** 操作のあとに値が変わっているため飛ばす物件の id */
  changedSince: number[];
  /** 削除されていて戻せない物件の id */
  missing: number[];
};

/**
 * @param backupRows 控えにある操作前の値
 * @param written 操作が書き込んだ値（保存＝会社情報の列、統合＝会社名）
 * @param current いまの物件の値
 */
export function planAgencyRestore(
  backupRows: readonly AgencyColumnsRow[],
  written: Written,
  current: readonly AgencyColumnsRow[]
): RestorePlan {
  const currentOf = new Map(current.map((row) => [row.id, row]));
  const plan: RestorePlan = { restore: [], changedSince: [], missing: [] };
  for (const before of backupRows) {
    const now = currentOf.get(before.id);
    if (!now) {
      plan.missing.push(before.id);
      continue;
    }
    const untouched = Object.entries(written).every(([col, value]) => now[col as keyof Written] === value);
    if (untouched) plan.restore.push(before);
    else plan.changedSince.push(before.id);
  }
  return plan;
}
