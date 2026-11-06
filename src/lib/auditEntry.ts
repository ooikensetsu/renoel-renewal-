/**
 * 操作履歴の1行を組み立てる純関数（2026-11-05）。DBに触らないので auditEntry.test.ts で固定する（D-06）。
 * 相対パス＋拡張子つきで書くのは、node の標準テストランナーから読めるようにするため。
 */
import { isAuditAction, type AuditAction } from "../config/auditLog.ts";

export type AuditEntry = {
  action: AuditAction;
  targetType?: "PROPERTY" | "USER" | "INQUIRY" | "AGENCY" | "IMAGE";
  targetIds?: readonly (string | number)[];
  /** 変更した項目の名前（値は入れない） */
  fields?: readonly string[];
  count?: number;
  /** 決まった語だけ（公開レベル名・状態名・件数）。氏名・本文・画面から受け取った文字列は入れない */
  summary?: string;
};

export type AuditActor = { userId: number; email: string };

/** 一括操作で対象IDを残す上限。超えたら件数だけ残す（1行が肥大しないように）。 */
export const AUDIT_MAX_TARGET_IDS = 1000;

export function auditData(actor: AuditActor, entry: AuditEntry) {
  if (!isAuditAction(entry.action)) throw new Error(`未定義の操作履歴コード: ${String(entry.action)}`);
  const ids = (entry.targetIds ?? []).map(String);
  return {
    actorId: actor.userId,
    actorEmail: actor.email,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetIds: ids.length > AUDIT_MAX_TARGET_IDS ? [] : ids,
    fields: [...(entry.fields ?? [])],
    count: entry.count ?? (ids.length > 1 ? ids.length : null),
    summary: entry.summary ?? null,
  };
}

/**
 * 変更前後を比べ、値が変わった項目の名前を返す（値そのものは返さない）。
 * after に含まれるキーだけを見る。日付は時刻で比べ、null・undefined・空文字は同じとみなす。
 */
export function changedFieldNames(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  labelOf: (key: string) => string = (k) => k
): string[] {
  const norm = (v: unknown) => {
    if (v === undefined || v === null || v === "") return null;
    if (v instanceof Date) return v.getTime();
    if (typeof v === "bigint") return v.toString();
    return v;
  };
  return Object.keys(after)
    .filter((key) => norm(before[key]) !== norm(after[key]))
    .map(labelOf);
}
