/**
 * 取扱会社の読みを CSV からまとめて入れるときの判定（2026-10-26）。実際に書くのは scripts/import-agency-readings.mjs。
 *
 * 辞書の推定（scripts/estimate-agency-readings.mjs）は英字をそのまま残すため、英字の社名が50音順の先頭に来ていた。
 * 人（または Claude）がカタカナ読みで書いた CSV で、推定のままの読みを置き換える。
 * 人が管理画面で直した読み（estimated=false）は上書きしない。入れた読みは推定の印を付けたままにする。
 * DBに触らない純関数にしてテストで固定している（D-06）。
 */

// 相対パス＋拡張子つきで書くのは、node の標準テストランナーから読めるようにするため。
import { isValidReading, normalizeReading } from "./agencyReading.ts";
import { blankToNull } from "./blank.ts";

export type ReadingPlan = {
  /** 読みが未登録で、新しく入れる */
  create: { agencyName: string; reading: string }[];
  /** 推定のままの読みを置き換える（before は戻すための控え） */
  replace: { agencyName: string; before: string; reading: string }[];
  /** 今の読みと同じ */
  same: string[];
  /** 人が直した読みと違う（上書きしない） */
  confirmedDiffers: { agencyName: string; current: string; incoming: string }[];
  /** 物件にも読みの表にも無い会社名 */
  unknown: string[];
  /** 読みとして受け付けない値（漢字が残っているなど） */
  invalid: { agencyName: string; reading: string }[];
};

export function planReadingImport(
  rows: readonly Record<string, string>[],
  ctx: {
    /** 物件にある会社名 */
    knownNames: ReadonlySet<string>;
    /** 読みの表の今の値 */
    current: ReadonlyMap<string, { reading: string; estimated: boolean }>;
  }
): ReadingPlan {
  const plan: ReadingPlan = { create: [], replace: [], same: [], confirmedDiffers: [], unknown: [], invalid: [] };
  for (const row of rows) {
    const agencyName = blankToNull(row["取扱会社名"] ?? row.agencyName);
    const rawReading = blankToNull(row["読み"] ?? row.reading);
    if (agencyName === null || rawReading === null) continue;
    const reading = normalizeReading(rawReading);
    if (!isValidReading(reading)) {
      plan.invalid.push({ agencyName, reading: rawReading });
      continue;
    }
    const current = ctx.current.get(agencyName);
    if (current === undefined) {
      if (ctx.knownNames.has(agencyName)) plan.create.push({ agencyName, reading });
      else plan.unknown.push(agencyName);
    } else if (current.reading === reading) {
      plan.same.push(agencyName);
    } else if (current.estimated) {
      plan.replace.push({ agencyName, before: current.reading, reading });
    } else {
      plan.confirmedDiffers.push({ agencyName, current: current.reading, incoming: reading });
    }
  }
  return plan;
}
