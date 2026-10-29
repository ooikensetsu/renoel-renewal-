"use client";

import { useId, useState } from "react";
import { CONFIRMATION_STATUSES, type ConfirmationStatus } from "@/config/property";
import { confirmationRecordPrompt, confirmationRecordResult } from "@/lib/propertyConfirmation";
import { recordPropertyConfirmation } from "@/app/actions/propertyConfirmation";

/**
 * 一覧でチェックした物件に、物件確認の状況をまとめて記録する帯（2026-10-27）。
 * 取扱会社からの返信は会社単位で届くため、取扱店で絞り込んで選んだ物件に一度に記録できるようにする。
 * D-17：件数を画面に出し、確認ダイアログを通してから送る。サーバー側でも数え直す。
 */
export default function BulkConfirmationBar({
  selectedIds,
  onDone,
}: {
  selectedIds: number[];
  onDone: (message: string) => void;
}) {
  const [status, setStatus] = useState<ConfirmationStatus>(CONFIRMATION_STATUSES[0]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const statusId = useId();

  const count = selectedIds.length;
  if (count === 0) return null;

  const handleRecord = async () => {
    if (!window.confirm(confirmationRecordPrompt(count, status))) return;
    setIsSaving(true);
    setError("");
    try {
      const res = await recordPropertyConfirmation(selectedIds, status, null, count);
      if (!res.success) {
        setError(res.error);
        return;
      }
      onDone(confirmationRecordResult(res, status));
    } catch (err) {
      // 送信そのものが失敗した場合。サーバーはトランザクションに入っていないか、巻き戻している。
      console.error("物件確認の状況の一括記録の送信に失敗:", err);
      setError("サーバーとの通信に失敗したため、記録していません。時間をおいてお試しください。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="px-4 pb-4 -mt-1 border-b border-reno-line bg-teal/5 flex flex-wrap items-center gap-3">
      <label htmlFor={statusId} className="text-sm font-bold text-reno-mute-dark">
        直近確認時の状況を
      </label>
      <select
        id={statusId}
        value={status}
        onChange={(e) => setStatus(e.target.value as ConfirmationStatus)}
        className="px-3 py-2 rounded-xl border border-reno-line bg-white text-sm font-bold text-ink outline-none focus:border-teal"
      >
        {CONFIRMATION_STATUSES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <button
        onClick={handleRecord}
        disabled={isSaving}
        className="px-4 py-2 rounded-xl bg-ink text-white text-sm font-bold hover:opacity-90 disabled:opacity-50"
      >
        {isSaving ? "記録中…" : "一括で記録"}
      </button>
      {error && (
        <p role="alert" className="w-full text-sm font-bold text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
