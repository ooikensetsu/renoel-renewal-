"use server";

import prisma from "@/lib/prisma";
import { requireAdmin, authErrorMessage } from "@/lib/auth";
import { reportError } from "@/lib/errors";
import { recordAudit } from "@/lib/auditLog";
import { AUDIT_ACTIONS, AUDIT_GROUPS, EXPORT_ACTIONS, isAuditAction, type ExportAction } from "@/config/auditLog";

/** 1ページの件数 */
const PAGE_SIZE = 100;

/**
 * 出力（CSV・確認依頼書）の記録（管理者のみ・2026-11-05）。
 * 出力ファイルは画面側で作るため、画面から「出力した」と知らせてもらう。
 * "use server" は直接叩けるので、種類は決まったものだけ・件数は整数だけを受け付ける。
 */
export async function recordAdminExport(action: ExportAction, propertyCount: number, companyCount?: number) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: authErrorMessage(auth.reason) };
  if (!(EXPORT_ACTIONS as readonly string[]).includes(action)) {
    return { success: false as const, error: "出力の種類が正しくありません。" };
  }
  const isCount = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 1_000_000;
  if (!isCount(propertyCount) || (companyCount !== undefined && !isCount(companyCount))) {
    return { success: false as const, error: "件数が正しくありません。" };
  }
  await recordAudit(auth, {
    action,
    targetType: "PROPERTY",
    count: propertyCount,
    summary: companyCount === undefined ? undefined : `${companyCount}社`,
  });
  return { success: true as const };
}

export type AuditLogFilter = {
  /** 操作の種類（英字コード）または区分（変更・出力・閲覧・ログイン）。空は全部 */
  action?: string;
  /** 実行者のメールアドレス（完全一致）。空は全員 */
  actor?: string;
  /** 対象の種類と ID（例：PROPERTY と "123"） */
  targetType?: string;
  targetId?: string;
  page?: number;
};

/** 操作履歴の一覧（管理者のみ）。新しい順に100件ずつ。 */
export async function getAuditLogs(filter: AuditLogFilter) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: authErrorMessage(auth.reason) };

  const where: {
    action?: string | { in: string[] };
    actorEmail?: string;
    targetType?: string;
    targetIds?: { has: string };
  } = {};
  const action = String(filter?.action ?? "");
  if (isAuditAction(action)) {
    where.action = action;
  } else if ((AUDIT_GROUPS as readonly string[]).includes(action)) {
    where.action = {
      in: Object.entries(AUDIT_ACTIONS)
        .filter(([, v]) => v.group === action)
        .map(([k]) => k),
    };
  }
  const actor = String(filter?.actor ?? "").trim();
  if (actor !== "") where.actorEmail = actor.slice(0, 254);
  const targetType = String(filter?.targetType ?? "");
  const targetId = String(filter?.targetId ?? "").trim().slice(0, 200);
  if (/^[A-Z]+$/.test(targetType)) where.targetType = targetType;
  if (targetId !== "") where.targetIds = { has: targetId };
  const page = Number.isInteger(filter?.page) && (filter.page as number) > 0 ? (filter.page as number) : 1;

  try {
    const [rows, total, actors] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.adminAuditLog.count({ where }),
      prisma.adminAuditLog.findMany({ distinct: ["actorEmail"], select: { actorEmail: true }, orderBy: { actorEmail: "asc" } }),
    ]);
    return {
      success: true as const,
      data: {
        rows,
        total,
        page,
        pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        actors: actors.map((a) => a.actorEmail),
      },
    };
  } catch (error) {
    return reportError("getAuditLogs", error, "操作履歴を取得できませんでした。");
  }
}
