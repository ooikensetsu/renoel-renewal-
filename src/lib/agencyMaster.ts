/**
 * 取扱会社の台帳（2026-10-22）。管理画面 /admin/agencies で、会社ごとに会社情報と掲載物件を管理する。
 *
 * - 会社の正式名は物件の agencyName と同じ文字列（前後の空白を除いた値）。物件と会社は名前でつながる
 * - 会社情報（所在地・電話・宅建免許番号）は会社側が正本。保存すると、その会社の物件にも書き込む
 *   空欄の項目は物件へ書かない（物件側の値を消さない）
 * - 表記ゆれ（「(株)ここいえ 姫路店」と「（株）ここいえ姫路店」など）は1社へ統合する。
 *   統合した旧表記は AgencyAlias に残し、CSV取込や手動登録で旧表記が来たら正式名に読み替える
 *
 * DBに触らない純関数にして、テスト（agencyMaster.test.ts）で固定している（D-06）。
 */

// 相対パス＋拡張子つきで書くのは、node の標準テストランナーから読めるようにするため。
import { blankToNull } from "./blank.ts";
import { importKey } from "./importMatch.ts";
import { stripCorporateForm } from "./agencyReading.ts";

/** 物件の agencyName から会社名を取り出す。空や「－」なら null（確認依頼書・読みの一覧と同じ規則）。 */
export function agencyNameOf(raw: string | null | undefined): string | null {
  return blankToNull(raw);
}

/**
 * 表記ゆれの比較に使う形。会社の種類（株式会社・(株) など）・空白・全角半角の違いを無視する。
 * 同じ形になる会社は「同じ会社かもしれない」候補として画面に出す（統合するかは人が決める）。
 */
export function sameCompanyKey(name: string): string {
  return stripCorporateForm(name).replace(/\s+/g, "").toLowerCase();
}

/** 会社名の一覧を、表記ゆれの候補ごとにまとめる。2社以上の組だけを返す。 */
export function groupSpellingVariants(names: readonly string[]): string[][] {
  const groups = new Map<string, string[]>();
  for (const name of new Set(names)) {
    const key = sameCompanyKey(name);
    if (key === "") continue;
    groups.set(key, [...(groups.get(key) ?? []), name]);
  }
  return [...groups.values()].filter((g) => g.length >= 2);
}

export type SpellingWarning = {
  /** 新しい表記の会社名 */
  name: string;
  /** 表記ゆれで同じ形になる会社名（登録済みの会社、または同じ取込の別の新しい表記） */
  similar: string[];
};

/**
 * 保存しようとしている会社名のうち、表記ゆれで別の会社を増やしそうなものを返す（2026-10-27）。
 * 登録済みの表記そのものは対象にしない（既にある表記で保存するたびに警告しないため）。
 * 止めはしない。同じ会社かは人が見て決める。
 *
 * @param incoming 保存しようとしている会社名（旧表記は正式名に読み替えた後）
 * @param known 登録済みの会社名（物件の会社名と台帳の会社名）
 */
export function findSpellingWarnings(
  incoming: readonly (string | null | undefined)[],
  known: readonly string[],
): SpellingWarning[] {
  const knownSet = new Set(known);
  const newNames = [...new Set(incoming.map(agencyNameOf).filter((n): n is string => n !== null))].filter(
    (n) => !knownSet.has(n),
  );
  const byKey = new Map<string, string[]>();
  for (const name of new Set([...knownSet, ...newNames])) {
    const key = sameCompanyKey(name);
    if (key !== "") byKey.set(key, [...(byKey.get(key) ?? []), name]);
  }
  return newNames.flatMap((name) => {
    const similar = (byKey.get(sameCompanyKey(name)) ?? []).filter((n) => n !== name);
    return similar.length > 0 ? [{ name, similar }] : [];
  });
}

/** 物件へ書き込む会社情報の列。会社側の項目名との対応。 */
export const AGENCY_PROPERTY_FIELDS = [
  { agency: "address", property: "agencyAddress", label: "所在地" },
  { agency: "tel", property: "agencyTel", label: "電話番号" },
  { agency: "license", property: "agencyLicense", label: "宅建業の免許番号" },
] as const;

export type AgencyInfo = {
  address: string | null;
  tel: string | null;
  license: string | null;
};

export type PropertyAgencyColumns = {
  agencyAddress: string | null;
  agencyTel: string | null;
  agencyLicense: string | null;
};

/** 会社情報のうち、物件へ書き込む列。空欄の項目は含めない（物件側の値を消さない）。 */
export function agencyColumnsToWrite(info: AgencyInfo): Partial<PropertyAgencyColumns> {
  const data: Partial<PropertyAgencyColumns> = {};
  for (const f of AGENCY_PROPERTY_FIELDS) {
    const value = blankToNull(info[f.agency]);
    if (value !== null) data[f.property] = value;
  }
  return data;
}

/** 物件側の値の内訳。会社情報の初期値と、物件ごとの食い違いの表示に使う。 */
export type FieldVariants = { value: string; count: number }[];

/**
 * 物件に入っている会社情報を項目ごとに数える。多い順（同数なら文字順）。空欄は数えない。
 * 先頭の値を、会社情報が未登録のときの初期値にする。
 */
export function summarizeAgencyColumns(
  properties: readonly PropertyAgencyColumns[]
): Record<(typeof AGENCY_PROPERTY_FIELDS)[number]["agency"], FieldVariants> {
  const result = { address: [], tel: [], license: [] } as Record<"address" | "tel" | "license", FieldVariants>;
  for (const f of AGENCY_PROPERTY_FIELDS) {
    const counts = new Map<string, number>();
    for (const p of properties) {
      const value = blankToNull(p[f.property]);
      if (value !== null) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    result[f.agency] = [...counts]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "ja"));
  }
  return result;
}

/** 統合の判定に使う物件の列。 */
export type PropertyForMerge = {
  id: number;
  agencyName: string | null;
  listingCompanyNo: string | null;
};

export type MergePlan =
  | { ok: true; propertyIds: number[] }
  | { ok: false; error: string; conflicts: { listingCompanyNo: string; ids: number[] }[] };

/**
 * 会社の統合（sources の物件を target の名前に書き換える）ができるかを判定する。
 *
 * 取込の突合キーは「取扱会社名＋掲載会社管理番号」（importMatch.ts）。
 * 統合で同じキーの物件が2件以上になると、次の取込でどちらを上書きするか決められなくなる。
 * その場合は統合せず、ぶつかる物件を返す（人が片方を直すか消してから統合する）。
 *
 * @param properties target と sources の物件（それ以外が混ざっていても無視する）
 * @returns 書き換える物件（sources 側）の id
 */
export function planAgencyMerge(
  target: string,
  sources: readonly string[],
  properties: readonly PropertyForMerge[]
): MergePlan {
  const sourceSet = new Set(sources);
  const involved = properties.filter((p) => {
    const name = agencyNameOf(p.agencyName);
    return name === target || (name !== null && sourceSet.has(name));
  });

  const byKey = new Map<string, number[]>();
  for (const p of involved) {
    // 統合後の名前でキーを作る
    const key = importKey(target, p.listingCompanyNo);
    if (key === null) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), p.id]);
  }
  const conflicts = [...byKey]
    .filter(([, ids]) => ids.length >= 2)
    .map(([key, ids]) => ({ listingCompanyNo: (JSON.parse(key) as string[])[1], ids: [...ids].sort((a, b) => a - b) }));
  if (conflicts.length > 0) {
    return {
      ok: false,
      error: `統合すると、取扱会社名と掲載会社管理番号が同じ物件が${conflicts.length}組できます。次のCSV取込でどちらを上書きするか決められなくなるため、統合を中止しました。`,
      conflicts,
    };
  }
  return {
    ok: true,
    propertyIds: involved.filter((p) => agencyNameOf(p.agencyName) !== target).map((p) => p.id),
  };
}

/**
 * 取込行・手動登録の会社名を正式名に読み替え、会社情報を会社台帳の値で上書きする。
 * 台帳に無い会社・空欄の項目は、入ってきた値をそのまま使う。
 *
 * @param aliases 旧表記 → 正式名
 * @param agencies 正式名 → 会社情報
 */
export function applyAgencyMaster<
  T extends { agencyName?: string | null; agencyAddress?: string | null; agencyTel?: string | null; agencyLicense?: string | null },
>(item: T, aliases: ReadonlyMap<string, string>, agencies: ReadonlyMap<string, AgencyInfo>): T {
  const name = agencyNameOf(item.agencyName);
  if (name === null) return item;
  const official = aliases.get(name) ?? name;
  const info = agencies.get(official);
  return { ...item, agencyName: official, ...(info ? agencyColumnsToWrite(info) : {}) };
}
