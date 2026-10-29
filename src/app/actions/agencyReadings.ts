"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireAdmin, authErrorMessage } from "@/lib/auth";
import { reportError } from "@/lib/errors";
import { isBlankMark } from "@/lib/blank";
import { isValidReading, normalizeReading } from "@/lib/agencyReading";

/**
 * 取扱会社名の読み（2026-10-19）。物件確認依頼書を50音順に並べるために使う。
 * 並べ方は src/lib/agencyReading.ts、表は AgencyReading。
 */

export type AgencyReadingRow = {
  agencyName: string;
  /** その会社が取り扱う物件の数 */
  propertyCount: number;
  reading: string | null;
  estimated: boolean;
};

/** 物件に登録されている取扱会社の一覧と、その読み（管理者のみ）。 */
export async function getAgencyReadings() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { success: false as const, error: authErrorMessage(auth.reason) };
  }

  try {
    const [agencies, readings] = await Promise.all([
      prisma.property.groupBy({ by: ["agencyName"], _count: { _all: true } }),
      prisma.agencyReading.findMany(),
    ]);
    const readingOf = new Map(readings.map((r) => [r.agencyName, r]));
    // 物件側の会社名は前後に空白が入っていることがある。確認依頼書と同じく空白を除いた名前でまとめる
    const counts = new Map<string, number>();
    for (const a of agencies) {
      const name = (a.agencyName ?? "").trim();
      if (name === "" || isBlankMark(name)) continue;
      counts.set(name, (counts.get(name) ?? 0) + a._count._all);
    }
    const rows: AgencyReadingRow[] = [...counts].map(([agencyName, propertyCount]) => ({
      agencyName,
      propertyCount,
      reading: readingOf.get(agencyName)?.reading ?? null,
      estimated: readingOf.get(agencyName)?.estimated ?? false,
    }));
    return { success: true as const, data: rows };
  } catch (error) {
    return reportError("getAgencyReadings", error, "取扱会社の読みを取得できませんでした。");
  }
}

/** 会社名 → 読み。確認依頼書の並べ替えに使う（管理者のみ）。 */
export async function getAgencyReadingMap() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { success: false as const, error: authErrorMessage(auth.reason) };
  }

  try {
    const readings = await prisma.agencyReading.findMany({ select: { agencyName: true, reading: true } });
    return { success: true as const, data: Object.fromEntries(readings.map((r) => [r.agencyName, r.reading])) };
  } catch (error) {
    return reportError("getAgencyReadingMap", error, "取扱会社の読みを取得できませんでした。");
  }
}

/**
 * 1社分の読みを保存する（管理者のみ）。人が入れた読みなので推定の印は外す。
 * 読みを空にして保存すると、その会社の読みを消す（並びの最後に回る）。
 */
export async function saveAgencyReading(agencyName: string, reading: string) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { success: false as const, error: authErrorMessage(auth.reason) };
  }

  const name = String(agencyName ?? "").trim();
  if (name === "") return { success: false as const, error: "取扱会社名がありません。" };
  const normalized = normalizeReading(String(reading ?? ""));

  try {
    if (normalized === "") {
      await prisma.agencyReading.deleteMany({ where: { agencyName: name } });
    } else {
      if (!isValidReading(normalized)) {
        return {
          success: false as const,
          error: "読みはひらがな（またはカタカナ）で入れてください。英字・数字・長音（ー）も使えます。",
        };
      }
      await prisma.agencyReading.upsert({
        where: { agencyName: name },
        create: { agencyName: name, reading: normalized, estimated: false },
        update: { reading: normalized, estimated: false },
      });
    }
    revalidatePath("/admin/agency-readings");
    return { success: true as const, data: { reading: normalized || null } };
  } catch (error) {
    return reportError("saveAgencyReading", error, "読みを保存できませんでした。");
  }
}
