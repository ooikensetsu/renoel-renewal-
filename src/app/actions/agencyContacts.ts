"use server";

import prisma from "@/lib/prisma";
import { requireAdmin, authErrorMessage } from "@/lib/auth";
import { reportError } from "@/lib/errors";
import type { AgencyContact } from "@/lib/confirmationRequestXlsx";

/** 会社名 → 台帳（Agency）の電話・FAX。物件確認依頼書の宛先に使う（管理者のみ・2026-10-26）。 */
export async function getAgencyContactMap() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { success: false as const, error: authErrorMessage(auth.reason) };
  }

  try {
    const agencies = await prisma.agency.findMany({ select: { name: true, tel: true, fax: true } });
    const contacts: Record<string, AgencyContact> = Object.fromEntries(
      agencies.map((a) => [a.name, { tel: a.tel, fax: a.fax }])
    );
    return { success: true as const, data: contacts };
  } catch (error) {
    return reportError("getAgencyContactMap", error, "取扱会社の連絡先を取得できませんでした。");
  }
}
