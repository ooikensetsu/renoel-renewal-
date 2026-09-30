"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireAdmin, requireUser, authErrorMessage } from "@/lib/auth";
import { reportError } from "@/lib/errors";
import { sendInquiryEmail, sendInquiryAdminNotice } from "@/lib/mail";
import { RATE_LIMITS, isValidInquiryStatus } from "@/config/security";
import { checkRateLimit, clientIp, hashForKey } from "@/lib/rateLimit";
// S-08：長さの上限と形式の判定は config/inputLimits.ts に集約している（D-19）。
import { INPUT_LIMITS, isValidEmail, withinLimit } from "@/config/inputLimits";

/**
 * 物件への問い合わせ送信。未ログインでも送れる（公開フォーム）。
 * ログイン済みの場合だけ、本人の行動履歴に残す。
 */
export async function submitInquiry(formData: FormData) {
  try {
    // ログインしていれば本人のIDを使う。フォームから来たIDは信用しない。
    const auth = await requireUser();
    const userId = auth.ok ? auth.userId : null;

    const propertyIdStr = formData.get("propertyId")?.toString();
    const parsedPropertyId = propertyIdStr ? parseInt(propertyIdStr) : NaN;
    const requestedPropertyId = Number.isInteger(parsedPropertyId) ? parsedPropertyId : null;

    const name = formData.get("name")?.toString()?.trim();
    const email = formData.get("email")?.toString()?.trim();
    const tel = formData.get("tel")?.toString()?.trim();
    const message = formData.get("message")?.toString()?.trim();

    if (!name || !email || !message) {
      return {
        success: false as const,
        error: "お名前、メールアドレス、お問い合わせ内容は必須です",
      };
    }
    if (!isValidEmail(email)) {
      return { success: false as const, error: "メールアドレスの形式が正しくありません" };
    }
    if (
      !withinLimit(name, INPUT_LIMITS.name) ||
      !withinLimit(message, INPUT_LIMITS.message) ||
      !withinLimit(tel, INPUT_LIMITS.tel)
    ) {
      return { success: false as const, error: "入力された文字数が上限を超えています" };
    }

    // S-08：踏み台送信・連投の抑止。IP単位と「宛先メール単位」の両方で絞る。
    const ipLimit = await checkRateLimit(
      `inquiry:ip:${await clientIp()}`,
      RATE_LIMITS.inquiryByIp.limit,
      RATE_LIMITS.inquiryByIp.windowSeconds
    );
    if (!ipLimit.ok) {
      return {
        success: false as const,
        error: "短時間に送信が続いています。しばらくおいてから再度お試しください。",
      };
    }
    const recipientLimit = await checkRateLimit(
      `inquiry:to:${hashForKey(email)}`,
      RATE_LIMITS.inquiryByRecipient.limit,
      RATE_LIMITS.inquiryByRecipient.windowSeconds
    );
    if (!recipientLimit.ok) {
      return {
        success: false as const,
        error:
          "このメールアドレス宛の送信が続いています。しばらくおいてから再度お試しください。",
      };
    }

    // S-08：物件名はクライアントの隠しフィールドを信用せず、DBの実データを使う。
    // 存在しない物件IDが来たら、物件の指定なしとして扱う（偽の物件名を管理者へ流さない）。
    const property =
      requestedPropertyId === null
        ? null
        : await prisma.property.findUnique({
            where: { id: requestedPropertyId },
            select: { title: true, objMngNo: true },
          });
    const propertyId = property ? requestedPropertyId : null;
    const propertyTitle = property?.title ?? "（物件の指定なし）";

    const inquiry = await prisma.inquiry.create({
      data: { propertyId, userId, name, email, tel, message },
    });

    // メール送信が失敗しても、問い合わせ自体は受け付け済みとして扱う。
    // ここで例外を投げると、保存できているのに利用者へ失敗と伝えることになる。
    const notice = { name, email, tel: tel || "", message, propertyTitle };
    const mail = await sendInquiryEmail(notice);
    // 管理者が管理画面を見に行かなくても着信に気付けるようにする。
    await sendInquiryAdminNotice({
      ...notice,
      inquiryId: inquiry.id,
      propertyObjMngNo: property ? property.objMngNo.toString() : null,
    });

    if (userId) {
      await prisma.activityLog.create({
        data: {
          userId,
          action: "INQUIRY",
          // S-09：問い合わせ本文や氏名はログに残さない。物件IDまで。
          details: `物件ID: ${propertyId ?? "-"}`,
        },
      });
    }

    // C-04：ここで以前は別関数のローカル変数 updatedInquiry を返しており、
    // 常に ReferenceError → catch へ落ちて「送信中にエラーが発生しました」と表示していた。
    // 保存もメール送信も成功しているのに失敗と伝えるため、利用者が再送信し重複が発生していた。
    // D-03：控えメールが送れていないのに「送信しました」と画面に出さない。
    return { success: true as const, data: { id: inquiry.id }, mailSent: mail.ok };
  } catch (error) {
    return reportError("submitInquiry", error, "送信できませんでした。");
  }
}

/** 問い合わせ一覧（管理者のみ）。氏名・メール・電話・本文を含むため認可必須。 */
export async function getInquiries() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { success: false as const, error: authErrorMessage(auth.reason) };
  }

  try {
    const inquiries = await prisma.inquiry.findMany({
      orderBy: { createdAt: "desc" },
    });

    // Inquiry は Property へのリレーションを持っていない（propertyId は素の数値）ため、
    // 必要な物件だけをまとめて引いて対応付ける。1件ずつ引くとN+1になる。
    const propertyIds = [
      ...new Set(inquiries.map((i) => i.propertyId).filter((id): id is number => id !== null)),
    ];
    const properties =
      propertyIds.length === 0
        ? []
        : await prisma.property.findMany({
            where: { id: { in: propertyIds } },
            select: { id: true, objMngNo: true, title: true },
          });
    const byId = new Map(properties.map((p) => [p.id, p]));

    return {
      success: true as const,
      data: inquiries.map((inq) => {
        const property = inq.propertyId === null ? undefined : byId.get(inq.propertyId);
        return {
          ...inq,
          // 物件管理番号（athome の番号）。BigInt は画面へ渡せないため文字列にする。
          // 物件が削除されている場合は null。
          propertyObjMngNo: property ? property.objMngNo.toString() : null,
          propertyTitle: property?.title ?? null,
        };
      }),
    };
  } catch (error) {
    return reportError("getInquiries", error, "お問い合わせを取得できませんでした。");
  }
}

/** 対応ステータスの更新（管理者のみ）。 */
export async function updateInquiryStatus(id: number, status: string) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { success: false as const, error: authErrorMessage(auth.reason) };
  }

  // 画面が送ってくる値を信用しない。想定外のステータスは書き込まない。
  if (!isValidInquiryStatus(status)) {
    return { success: false as const, error: "指定された対応状況は使用できません。" };
  }

  try {
    const dataToUpdate: { status: string; repliedAt?: Date | null } = { status };
    if (status === "REPLIED") {
      dataToUpdate.repliedAt = new Date();
    } else if (status === "UNREAD") {
      dataToUpdate.repliedAt = null;
    }

    const updatedInquiry = await prisma.inquiry.update({
      where: { id },
      data: dataToUpdate,
    });
    revalidatePath("/admin/inquiries");
    return { success: true as const, data: updatedInquiry };
  } catch (error) {
    return reportError("updateInquiryStatus", error, "ステータスを更新できませんでした。");
  }
}
