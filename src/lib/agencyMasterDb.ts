import prisma from "@/lib/prisma";
import { agencyNameOf, applyAgencyMaster, findSpellingWarnings, type AgencyInfo, type SpellingWarning } from "@/lib/agencyMaster";

/**
 * 取扱会社の台帳を読み、取込行・手動登録の会社名と会社情報をそろえる（2026-10-22）。
 * CSV取込（compareCSVData・importProperties）と物件の手動登録・編集が、ここ1つを通る（D-20）。
 *
 * "use server" のファイルに置くと認可なしで直接呼べる口になるため、ここに分けている。
 */
export async function withAgencyMaster<
  T extends { agencyName?: string | null; agencyAddress?: string | null; agencyTel?: string | null; agencyLicense?: string | null },
>(items: T[]): Promise<T[]> {
  const [aliases, agencies] = await Promise.all([
    prisma.agencyAlias.findMany({ select: { alias: true, agencyName: true } }),
    prisma.agency.findMany({ select: { name: true, address: true, tel: true, license: true } }),
  ]);
  const aliasMap = new Map(aliases.map((a) => [a.alias, a.agencyName]));
  const agencyMap = new Map<string, AgencyInfo>(agencies.map(({ name, ...info }) => [name, info]));
  return items.map((item) => applyAgencyMaster(item, aliasMap, agencyMap));
}

/**
 * 保存しようとしている会社名のうち、登録済みの会社の表記ゆれに見えるものを返す（2026-10-27）。
 * 物件の手動登録・編集（checkAgencySpelling）とCSV取込の確認（compareCSVData）が、ここ1つを通る（D-20）。
 * 会社名は withAgencyMaster で旧表記を読み替えた後の値を渡す。
 */
export async function agencySpellingWarnings(names: readonly (string | null | undefined)[]): Promise<SpellingWarning[]> {
  if (names.every((n) => agencyNameOf(n) === null)) return [];
  const [groups, agencies] = await Promise.all([
    prisma.property.groupBy({ by: ["agencyName"] }),
    prisma.agency.findMany({ select: { name: true } }),
  ]);
  const known = [...groups.map((g) => agencyNameOf(g.agencyName)), ...agencies.map((a) => a.name)].filter(
    (n): n is string => n !== null,
  );
  return findSpellingWarnings(names, known);
}
