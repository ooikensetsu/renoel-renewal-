/**
 * 管理画面の物件一覧の絞り込み。
 *
 * 件数が千件程度なので、サーバーへ問い合わせ直さず手元で絞る。
 * 一括編集は「いま絞り込まれている物件」から選ぶため、絞り込みの判定を
 * 画面に直書きせずここに置いてテスト（adminPropertyFilter.test.ts）で固定する。
 */

// 相対パス＋拡張子つきで書くのは、node の標準テストランナーから読めるようにするため。
import { transactionCategory, type TransactionCategory } from "../config/property.ts";

/** 絞り込みに使う列だけを持つ形。画面の行型はこれを満たせばよい。 */
export type FilterableProperty = {
  title: string;
  syubetu: number;
  disclosureLevel: number;
  listingCompanyNo: string | null;
  agencyName: string | null;
  address: string | null;
  madori: string | null;
  areaName?: string | null;
  /** トップページの「新着物件」に掲載するか */
  showOnTop: boolean;
  /** 取引態様（取得元の表記のまま。2026-10-27 絞り込みに追加） */
  transactionType?: string | null;
};

/** "all" は指定なし。数値はそれぞれ syubetu / disclosureLevel の値。 */
export type AdminPropertyFilter = {
  keyword: string;
  syubetu: "all" | number;
  level: "all" | number;
  /** 取扱店名。NO_AGENCY は「取扱店が未登録」 */
  agency: "all" | string;
  /** トップ掲載。on＝掲載中だけ、off＝掲載していないものだけ（2026-10-08 追加） */
  top: "all" | "on" | "off";
  /** 取引態様の分類（2026-10-27 追加。分類は src/config/property.ts の TRANSACTION_CATEGORIES） */
  transaction: "all" | TransactionCategory;
};

/** 取扱店が未登録の物件を選ぶための値。実在の会社名と衝突しない文字列にしている。 */
export const NO_AGENCY = "__none__";

function agencyKey(name: string | null): string {
  const trimmed = (name ?? "").trim();
  return trimmed === "" ? NO_AGENCY : trimmed;
}

/**
 * 絞り込み中か。キーワード以外は「すべて」(all) 以外なら絞り込み中とみなす。
 * 項目を1つずつ並べると、項目を足したときに漏れる（2026-10-27 に取引態様で漏れた）ため、全項目を見る。
 */
export function isAdminFilterActive(f: AdminPropertyFilter): boolean {
  const { keyword, ...rest } = f;
  return keyword.trim() !== "" || Object.values(rest).some((v) => v !== "all");
}

export function matchesAdminFilter(p: FilterableProperty, f: AdminPropertyFilter): boolean {
  if (f.syubetu !== "all" && p.syubetu !== f.syubetu) return false;
  if (f.level !== "all" && p.disclosureLevel !== f.level) return false;
  if (f.agency !== "all" && agencyKey(p.agencyName) !== f.agency) return false;
  if (f.top !== "all" && p.showOnTop !== (f.top === "on")) return false;
  if (f.transaction !== "all" && transactionCategory(p.transactionType) !== f.transaction) return false;

  const kw = f.keyword.trim().toLowerCase();
  if (kw === "") return true;
  // 物件管理番号（objMngNo）は検索対象にしない（2026-10-06 大野の指示）。
  return [p.title, p.listingCompanyNo, p.address, p.madori, p.areaName].some((v) =>
    (v ?? "").toLowerCase().includes(kw)
  );
}

/**
 * 取扱店の選択肢。物件数の多い順、同数なら名前順。
 * 未登録の物件があれば最後に「未登録」を足す。
 */
export function agencyOptions(
  properties: Pick<FilterableProperty, "agencyName">[]
): { value: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of properties) {
    const key = agencyKey(p.agencyName);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const named = [...counts.entries()]
    .filter(([key]) => key !== NO_AGENCY)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"))
    .map(([key, count]) => ({ value: key, label: key, count }));
  const missing = counts.get(NO_AGENCY);
  return missing ? [...named, { value: NO_AGENCY, label: "未登録", count: missing }] : named;
}
