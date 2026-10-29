/**
 * 取扱会社の台帳へFAX番号をまとめて入れるときの判定（2026-10-22）。実際に書くのは scripts/import-agency-fax.mjs。
 *
 * 入力は次のどちらか（会社名の列は agencyName または 取扱会社名、FAXの列は fax または agencyFax）。
 * - athome の物件ページ画像を文字認識して作った候補一覧（人が目で確かめ、違う行を消したもの）
 * - athome 取得ツールの 物件インポート.csv（2026-10-22 から agencyFax 列が付く）
 *
 * 人が台帳に入れたFAXは上書きしない。旧表記は正式名へ読み替える。
 * DBに触らない純関数にしてテストで固定している（D-06）。
 */

// 相対パス＋拡張子つきで書くのは、node の標準テストランナーから読めるようにするため。
import { agencyNameOf } from "./agencyMaster.ts";
import { blankToNull } from "./blank.ts";

/** FAX番号として受け付ける形（数字とハイフン。市外局番から10〜11桁） */
export function normalizeFax(raw: string | null | undefined): string | null {
  const value = blankToNull(raw)?.normalize("NFKC").replace(/[‐－―ー]/g, "-").replace(/\s/g, "");
  if (!value || !/^0[\d-]+$/.test(value)) return null;
  const digits = value.replace(/-/g, "").length;
  return digits === 10 || digits === 11 ? value : null;
}

export type FaxPlan = {
  /** 台帳に入れる（会社名は正式名） */
  write: { agencyName: string; fax: string; createAgency: boolean }[];
  /** 台帳に同じFAXが入っている */
  same: string[];
  /** 台帳に別のFAXが入っている（人の入力を優先して書かない） */
  differs: { agencyName: string; current: string; incoming: string }[];
  /** 取扱会社として見つからない会社名 */
  unknown: string[];
  /** 同じ会社に違うFAXが2つ以上ある（どちらも書かない） */
  conflicting: { agencyName: string; faxes: string[] }[];
  /** FAXの形が読めない行 */
  invalid: { agencyName: string; fax: string }[];
};

export function planFaxImport(
  rows: readonly Record<string, string>[],
  ctx: {
    aliases: ReadonlyMap<string, string>;
    /** 物件か台帳にある会社名（正式名） */
    knownNames: ReadonlySet<string>;
    /** 台帳の会社名 → 今のFAX（未入力は null） */
    currentFax: ReadonlyMap<string, string | null>;
  }
): FaxPlan {
  const plan: FaxPlan = { write: [], same: [], differs: [], unknown: [], conflicting: [], invalid: [] };
  const faxesOf = new Map<string, Set<string>>();
  for (const row of rows) {
    const rawName = agencyNameOf(row.agencyName ?? row["取扱会社名"]);
    const rawFax = row.fax ?? row.agencyFax ?? "";
    if (rawName === null || blankToNull(rawFax) === null) continue;
    const fax = normalizeFax(rawFax);
    if (fax === null) {
      plan.invalid.push({ agencyName: rawName, fax: rawFax });
      continue;
    }
    const name = ctx.aliases.get(rawName) ?? rawName;
    if (!ctx.knownNames.has(name)) {
      if (!plan.unknown.includes(rawName)) plan.unknown.push(rawName);
      continue;
    }
    faxesOf.set(name, (faxesOf.get(name) ?? new Set()).add(fax));
  }
  for (const [agencyName, faxes] of faxesOf) {
    if (faxes.size > 1) {
      plan.conflicting.push({ agencyName, faxes: [...faxes] });
      continue;
    }
    const [fax] = faxes;
    const current = ctx.currentFax.get(agencyName);
    if (current === undefined || current === null) {
      plan.write.push({ agencyName, fax, createAgency: current === undefined });
    } else if (current.replace(/\D/g, "") === fax.replace(/\D/g, "")) {
      plan.same.push(agencyName);
    } else {
      plan.differs.push({ agencyName, current, incoming: fax });
    }
  }
  return plan;
}
