"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireAdmin, authErrorMessage } from "@/lib/auth";
import { reportError } from "@/lib/errors";
import { toJsonSafe } from "@/lib/json";
import { checkFoundCount } from "@/lib/bulkDisclosure";
import { planConfirmationRecord } from "@/lib/propertyConfirmation";
import { DISCLOSURE_LEVEL } from "@/config/security";

/**
 * 物件確認の状況を記録する（管理者のみ・2026-10-27）。物件の詳細画面（1件）と一覧の一括記録の両方がここを呼ぶ。
 *
 * 記録は消さずに1行ずつ足す（履歴）。中止・済のときは公開レベルを「非表示」にする（大野の指示）。
 * D-17：画面で件数を確認してから呼び、ここでも数え直す。公開レベルを変える物件は、変更前の値を
 * PropertyImportBackup に控える（公開レベルの一括変更と同じ置き場）。全部を1つのトランザクションで行う。
 */
export async function recordPropertyConfirmation(
  ids: number[],
  status: string,
  note: string | null,
  expectedCount: number
) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { success: false as const, error: authErrorMessage(auth.reason) };
  }

  const plan = planConfirmationRecord({ ids, status, note, expectedCount });
  if (!plan.ok) {
    return { success: false as const, error: plan.error };
  }

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const before = await tx.property.findMany({
        where: { id: { in: plan.ids } },
        select: { id: true, objMngNo: true, disclosureLevel: true },
      });
      const countError = checkFoundCount(plan.expectedCount, before.length);
      if (countError) return { ok: false as const, error: countError };

      await tx.propertyConfirmation.createMany({
        data: plan.ids.map((propertyId) => ({
          propertyId,
          status: plan.status,
          note: plan.note,
          recordedBy: auth.email,
        })),
      });

      const toHide = plan.hides ? before.filter((p) => p.disclosureLevel !== DISCLOSURE_LEVEL.HIDDEN) : [];
      let backupId: number | null = null;
      if (toHide.length > 0) {
        const backup = await tx.propertyImportBackup.create({
          data: {
            importedBy: auth.email,
            itemCount: toHide.length,
            before: toJsonSafe({ kind: "confirmationHide", status: plan.status, rows: toHide }) as object,
          },
        });
        backupId = backup.id;
        await tx.property.updateMany({
          where: { id: { in: toHide.map((p) => p.id) } },
          data: { disclosureLevel: DISCLOSURE_LEVEL.HIDDEN },
        });
      }
      return { ok: true as const, count: plan.ids.length, hiddenCount: toHide.length, backupId };
    });

    if (!outcome.ok) {
      return { success: false as const, error: outcome.error };
    }

    revalidatePath("/admin/properties");
    if (outcome.hiddenCount > 0) {
      revalidatePath("/properties");
      revalidatePath("/");
    }
    return {
      success: true as const,
      count: outcome.count,
      hiddenCount: outcome.hiddenCount,
      backupId: outcome.backupId,
    };
  } catch (error) {
    return reportError("recordPropertyConfirmation", error, "物件確認の状況を記録できませんでした。");
  }
}
