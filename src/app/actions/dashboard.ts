"use server";

import prisma from "@/lib/prisma";
import { requireAdmin, authErrorMessage } from "@/lib/auth";
import { reportError } from "@/lib/errors";
import { MAIL_STATUS } from "@/lib/mail";
import { signedImageUrls } from "@/lib/storage";
import { ROLE, USER_STATUS, DISCLOSURE_LEVEL } from "@/config/security";

/**
 * 管理者ダッシュボードの集計。
 *
 * 【なぜ作ったか】
 * ダッシュボードは登録会員 1,284人／掲載物件 45件／今月の問い合わせ 32件／閲覧 12.4k と、
 * 全ての数字が画面に直書きされた架空の値だった。全カードに根拠の無い「+12%」も付いていた。
 * 「最近の登録会員」「最近の掲載物件」も仙台の架空データで、物件画像は Unsplash の
 * 他人の写真を毎回同じものを表示していた。納品物として出せる状態ではないため、
 * 全てDBの実測値に置き換えた。
 *
 * S-07：会員の氏名・メールを含むため、"use server" の冒頭で必ず認可を判定する。
 * S-13：会員の参照は必ず deletedAt: null で絞る（論理削除済みを数えない）。
 */

/** ダッシュボードに並べる「最近の…」の件数。 */
const RECENT_LIMIT = 5;

export type DashboardSummary = {
  members: { total: number; active: number; store: number };
  properties: { total: number; publicCount: number; membersOnly: number; withoutImage: number };
  inquiries: { thisMonth: number; unread: number };
  mail: { failed: number };
  recentUsers: {
    id: number;
    name: string | null;
    email: string;
    memberType: string;
    createdAt: Date;
  }[];
  recentProperties: {
    id: number;
    objMngNo: string;
    title: string;
    priceMan: number;
    disclosureLevel: number;
    imageUrl: string | null;
    updatedAt: Date;
  }[];
};

/** 当月の1日 0時。「今月の問い合わせ」の起点。 */
function startOfThisMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export async function getDashboardSummary() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { success: false as const, error: authErrorMessage(auth.reason) };
  }

  try {
    // 会員は「管理者を除いた一般会員」を数える。管理者を会員数に混ぜない。
    const memberWhere = { deletedAt: null, role: ROLE.USER };

    const [
      memberTotal,
      memberActive,
      memberStore,
      propertyTotal,
      propertyPublic,
      propertyMembersOnly,
      propertyWithoutImage,
      inquiriesThisMonth,
      inquiriesUnread,
      mailFailed,
      recentUsers,
      recentPropertiesRaw,
    ] = await Promise.all([
      prisma.user.count({ where: memberWhere }),
      prisma.user.count({ where: { ...memberWhere, status: USER_STATUS.ACTIVE } }),
      prisma.user.count({ where: { ...memberWhere, memberType: "STORE" } }),
      prisma.property.count(),
      prisma.property.count({ where: { disclosureLevel: DISCLOSURE_LEVEL.PUBLIC } }),
      prisma.property.count({ where: { disclosureLevel: DISCLOSURE_LEVEL.MEMBERS } }),
      prisma.property.count({ where: { images: { none: {} } } }),
      prisma.inquiry.count({ where: { createdAt: { gte: startOfThisMonth() } } }),
      prisma.inquiry.count({ where: { status: "UNREAD" } }),
      prisma.mailLog.count({ where: { status: MAIL_STATUS.FAILED } }),
      prisma.user.findMany({
        where: memberWhere,
        orderBy: { createdAt: "desc" },
        take: RECENT_LIMIT,
        select: { id: true, name: true, email: true, memberType: true, createdAt: true },
      }),
      prisma.property.findMany({
        orderBy: { updatedAt: "desc" },
        take: RECENT_LIMIT,
        select: {
          id: true,
          objMngNo: true,
          title: true,
          priceMan: true,
          disclosureLevel: true,
          updatedAt: true,
          images: { orderBy: { sortOrder: "asc" }, take: 1, select: { path: true } },
        },
      }),
    ]);

    // サムネイル（各物件の1枚目）を署名付きURLにする。S-07。
    const signed = await signedImageUrls(
      recentPropertiesRaw.flatMap((p) => (p.images[0] ? [p.images[0].path] : []))
    );

    const data: DashboardSummary = {
      members: { total: memberTotal, active: memberActive, store: memberStore },
      properties: {
        total: propertyTotal,
        publicCount: propertyPublic,
        membersOnly: propertyMembersOnly,
        withoutImage: propertyWithoutImage,
      },
      inquiries: { thisMonth: inquiriesThisMonth, unread: inquiriesUnread },
      mail: { failed: mailFailed },
      recentUsers,
      recentProperties: recentPropertiesRaw.map((p) => ({
        id: p.id,
        // objMngNo は BigInt。そのままだとシリアライズできないため文字列にする。
        objMngNo: p.objMngNo.toString(),
        title: p.title,
        priceMan: p.priceMan,
        disclosureLevel: p.disclosureLevel,
        imageUrl: p.images[0] ? signed.get(p.images[0].path) ?? null : null,
        updatedAt: p.updatedAt,
      })),
    };

    return { success: true as const, data };
  } catch (error) {
    return reportError("getDashboardSummary", error, "ダッシュボードの集計を取得できませんでした。");
  }
}

/**
 * 左メニューに出す「未対応の問い合わせ件数」。
 * レイアウトから毎回呼ばれるため、失敗しても画面を落とさず 0 を返す
 * （バッジが出ないだけで、管理画面そのものは使える状態を保つ）。
 */
export async function getUnreadInquiryCount(): Promise<number> {
  const auth = await requireAdmin();
  if (!auth.ok) return 0;

  try {
    return await prisma.inquiry.count({ where: { status: "UNREAD" } });
  } catch (error) {
    console.error("getUnreadInquiryCount:", error);
    return 0;
  }
}
