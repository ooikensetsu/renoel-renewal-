import prisma from "@/lib/prisma";
import { applyAgencyMaster, type AgencyInfo } from "@/lib/agencyMaster";

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
