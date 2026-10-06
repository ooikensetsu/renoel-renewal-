"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireAdmin, authErrorMessage } from "@/lib/auth";
import { reportError } from "@/lib/errors";
import { toJsonSafe } from "@/lib/json";
import { planBulkDisclosure, checkFoundCount } from "@/lib/bulkDisclosure";

/**
 * 公開レベルの一括変更（管理者のみ）。
 *
 * D-17 の3手順：
 *   1. 数える   … 選んだ物件をDBで数え、画面の件数と一致しなければ書き込まない
 *   2. 控え     … 変更前の公開レベルを PropertyImportBackup に残す（取込の控えと同じ置き場）
 *   3. 確認     … 画面側で件数を出して確認ダイアログを通してから呼ぶ
 * 数える・控える・書き換えるは1つのトランザクションで行う。途中で落ちても半端に残らない。
 * 同じ入力で再実行しても結果は同じ（冪等）。
 */
export async function bulkUpdateDisclosureLevel(
  ids: number[],
  level: number,
  expectedCount: number
) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { success: false as const, error: authErrorMessage(auth.reason) };
  }

  const plan = planBulkDisclosure({ ids, level, expectedCount });
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

      const backup = await tx.propertyImportBackup.create({
        data: {
          importedBy: auth.email,
          itemCount: before.length,
          // 取込の控えと区別できるよう、何の控えかを中に書く。
          before: toJsonSafe({ kind: "bulkDisclosureLevel", newLevel: plan.level, rows: before }) as object,
        },
      });
      const updated = await tx.property.updateMany({
        where: { id: { in: plan.ids } },
        data: { disclosureLevel: plan.level },
      });
      return { ok: true as const, count: updated.count, backupId: backup.id };
    });

    if (!outcome.ok) {
      return { success: false as const, error: outcome.error };
    }

    revalidatePath("/admin/properties");
    revalidatePath("/properties");
    revalidatePath("/");
    return { success: true as const, count: outcome.count, backupId: outcome.backupId };
  } catch (error) {
    return reportError("bulkUpdateDisclosureLevel", error, "公開レベルを変更できませんでした。");
  }
}
