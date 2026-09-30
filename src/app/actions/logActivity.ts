"use server";

import prisma from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

/** 監査ログに残す物件名の上限。長い物件名で ActivityLog を膨らませない。 */
const TITLE_MAX_LENGTH = 100;

/**
 * 物件の閲覧履歴を残す。ログインしていなければ何も記録しない。
 * S-09：残すのは「誰が（ID）・いつ・何を・どのレコードに（ID）」まで。
 * 物件名は公開情報なので残すが、長さは制限する。
 *
 * S-08：物件名は画面から受け取らず、propertyId でDBを引く。
 * 以前は引数で受け取った文字列をそのまま保存していたため、
 * 会員が監査ログに任意の文字列を書き込めた（記録が証拠にならない）。
 * submitInquiry と同じ扱いに揃えている（クライアントの値を信用しない）。
 *
 * details の形式 `物件ID: 12 (物件名)` は変えていない。
 * 管理画面の閲覧数集計（properties.ts の startsWith 照合）が
 * この形に依存しており、過去の行とも突き合わせる必要があるため。
 */
export async function logPropertyView(propertyId: number) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return;
    if (!Number.isInteger(propertyId) || propertyId <= 0) return;

    // 実在しない物件IDでは記録しない（架空のIDでログを水増しさせない）。
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { title: true },
    });
    if (!property) return;

    await prisma.activityLog.create({
      data: {
        userId: auth.userId,
        action: "VIEW_PROPERTY",
        details: `物件ID: ${propertyId} (${property.title.slice(0, TITLE_MAX_LENGTH)})`,
      },
    });
  } catch (error) {
    // D-07：握り潰さない。閲覧履歴の失敗で画面を止める必要はないのでログにだけ残す。
    console.error("Failed to log property view:", error);
  }
}
