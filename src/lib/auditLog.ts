import type { Prisma } from "@/generated/client";
import prisma from "@/lib/prisma";
import { auditData, type AuditActor, type AuditEntry } from "@/lib/auditEntry";

/**
 * 管理画面の操作履歴を書く（2026-11-05）。"use server" には置かない
 * （置くと誰でも任意の履歴を書き込める口になる）。呼び出し元で requireAdmin() を通した auth を渡す。
 * 値は残さない（大野の決定）。組み立ては src/lib/auditEntry.ts。
 */
export type { AuditEntry } from "@/lib/auditEntry";

type Db = Prisma.TransactionClient | typeof prisma;

/** トランザクションの中で書く。操作と履歴を一体にする（履歴が書けなければ操作も巻き戻る）。 */
export async function recordAuditIn(tx: Db, actor: AuditActor, entry: AuditEntry) {
  await tx.adminAuditLog.create({ data: auditData(actor, entry) });
}

/** 操作が成功した後に書く。履歴の失敗で、成功した操作を失敗と見せない（D-07：ログには残す）。 */
export async function recordAudit(actor: AuditActor, entry: AuditEntry) {
  try {
    await prisma.adminAuditLog.create({ data: auditData(actor, entry) });
  } catch (error) {
    console.error(`[audit] 操作履歴を書けませんでした（${entry.action}）:`, error);
  }
}
