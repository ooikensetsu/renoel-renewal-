/**
 * 物件確認の状況（有・商談・保留・中止・済）を記録するときの検証（2026-10-27）。
 *
 * 1件（物件の詳細画面）でも複数件（一覧の一括記録）でも、サーバーアクションはここを通す（D-20）。
 * DBに触らない純関数にして、テスト（propertyConfirmation.test.ts）で固定している（D-06）。
 */

// 相対パス＋拡張子つきで書くのは、node の標準テストランナーから読めるようにするため。
import {
  CONFIRMATION_STATUSES_THAT_HIDE,
  isConfirmationStatus,
  type ConfirmationStatus,
} from "../config/property.ts";
import { planBulkIds } from "./bulkDisclosure.ts";

/** メモの上限。依頼書の返信の要点を残す程度の長さ。 */
export const MAX_CONFIRMATION_NOTE_LENGTH = 200;

export type ConfirmationRecordPlan =
  | {
      ok: true;
      ids: number[];
      status: ConfirmationStatus;
      note: string | null;
      /** 公開レベルを「非表示」にするか（中止・済） */
      hides: boolean;
      expectedCount: number;
    }
  | { ok: false; error: string };

export function planConfirmationRecord(req: {
  ids: unknown;
  status: unknown;
  note: unknown;
  expectedCount: unknown;
}): ConfirmationRecordPlan {
  const target = planBulkIds(req.ids, req.expectedCount);
  if (!target.ok) return target;
  if (!isConfirmationStatus(req.status)) {
    return { ok: false, error: "状況の値が正しくありません。" };
  }
  if (req.note !== null && req.note !== undefined && typeof req.note !== "string") {
    return { ok: false, error: "メモの形式が正しくありません。" };
  }
  const note = (req.note ?? "").trim();
  if (note.length > MAX_CONFIRMATION_NOTE_LENGTH) {
    return { ok: false, error: `メモは ${MAX_CONFIRMATION_NOTE_LENGTH} 文字以内で入力してください。` };
  }
  return {
    ok: true,
    ids: target.ids,
    status: req.status,
    note: note === "" ? null : note,
    hides: CONFIRMATION_STATUSES_THAT_HIDE.includes(req.status),
    expectedCount: target.ids.length,
  };
}

/** 記録する前の確認文。1件（詳細画面）と一括（一覧）で同じ文を出す。 */
export function confirmationRecordPrompt(count: number, status: ConfirmationStatus): string {
  const hides = CONFIRMATION_STATUSES_THAT_HIDE.includes(status);
  return (
    `${count === 1 ? "この物件" : `選択した ${count} 件`}に、物件確認の状況「${status}」を記録します。\n` +
    (hides
      ? "「中止」「済」を記録すると、公開レベルが「非表示」に変わります（変更前の公開レベルは控えとして保存されます）。\n"
      : "") +
    "実行してよろしいですか？"
  );
}

/** 記録したあとに出す文。 */
export function confirmationRecordResult(
  res: { count: number; hiddenCount: number; backupId: number | null },
  status: ConfirmationStatus
): string {
  return (
    `${res.count} 件に状況「${status}」を記録しました。` +
    (res.hiddenCount > 0 ? `うち ${res.hiddenCount} 件の公開レベルを「非表示」にしました（控え番号 ${res.backupId}）。` : "")
  );
}
