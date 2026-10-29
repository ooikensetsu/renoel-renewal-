"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { CONFIRMATION_STATUSES, type ConfirmationStatus } from "@/config/property";
import {
  confirmationRecordPrompt,
  confirmationRecordResult,
  MAX_CONFIRMATION_NOTE_LENGTH,
} from "@/lib/propertyConfirmation";
import { recordPropertyConfirmation } from "@/app/actions/propertyConfirmation";

export type ConfirmationHistoryRow = {
  id: number;
  status: string;
  confirmedAt: Date;
  recordedBy: string;
  note: string | null;
};

/**
 * 物件確認の状況（2026-10-27）。いちばん上の記録が物件確認依頼書の「直近確認時の状況」になる。
 * 記録は消さずに足していく。中止・済を記録すると公開レベルが「非表示」になる。
 */
export default function PropertyConfirmationPanel({
  propertyId,
  history,
}: {
  propertyId: number;
  history: ConfirmationHistoryRow[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState<ConfirmationStatus>(CONFIRMATION_STATUSES[0]);
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const statusId = useId();
  const noteId = useId();

  const handleRecord = async () => {
    if (!window.confirm(confirmationRecordPrompt(1, status))) return;
    setIsSaving(true);
    setMessage(null);
    try {
      const res = await recordPropertyConfirmation([propertyId], status, note, 1);
      if (!res.success) {
        setMessage({ ok: false, text: res.error });
        return;
      }
      setMessage({ ok: true, text: confirmationRecordResult(res, status) });
      setNote("");
      // 履歴と公開レベル（中止・済のとき）を読み直す
      router.refresh();
    } catch (err) {
      console.error("物件確認の状況の記録の送信に失敗:", err);
      setMessage({ ok: false, text: "サーバーとの通信に失敗したため、記録していません。時間をおいてお試しください。" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="bg-white p-8 rounded-2xl shadow-sm border border-reno-line space-y-6">
      <div>
        <h2 className="text-lg font-bold text-ink">直近確認時の状況</h2>
        <p className="text-sm text-reno-mute-dark mt-1">
          取扱会社に確認した結果を記録します。最新の記録が物件確認依頼書の「直近確認時の状況」の欄に入ります。
          「中止」「済」を記録すると公開レベルが「非表示」になります。
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={statusId} className="text-sm font-bold text-reno-mute-dark">状況</label>
          <select
            id={statusId}
            value={status}
            onChange={(e) => setStatus(e.target.value as ConfirmationStatus)}
            className="px-3 py-2.5 rounded-xl border border-reno-line bg-white text-sm font-bold text-ink outline-none focus:border-teal"
          >
            {CONFIRMATION_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1 grow min-w-64">
          <label htmlFor={noteId} className="text-sm font-bold text-reno-mute-dark">メモ（任意）</label>
          <input
            id={noteId}
            type="text"
            value={note}
            maxLength={MAX_CONFIRMATION_NOTE_LENGTH}
            onChange={(e) => setNote(e.target.value)}
            placeholder="例：FAXで回答あり"
            className="px-3 py-2.5 rounded-xl border border-reno-line bg-white text-sm text-ink outline-none focus:border-teal"
          />
        </div>
        <button
          type="button"
          onClick={handleRecord}
          disabled={isSaving}
          className="px-5 py-2.5 rounded-xl bg-ink text-white text-sm font-bold hover:opacity-90 disabled:opacity-50"
        >
          {isSaving ? "記録中…" : "記録する"}
        </button>
      </div>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`text-sm font-bold ${message.ok ? "text-green-700" : "text-red-800"}`}>
          {message.text}
        </p>
      )}

      {history.length === 0 ? (
        <p className="text-sm font-bold text-reno-mute-dark">まだ記録がありません（未確認）。</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-reno-line text-reno-mute-dark">
              <th scope="col" className="py-2 pr-4">確認日時</th>
              <th scope="col" className="py-2 pr-4">状況</th>
              <th scope="col" className="py-2 pr-4">メモ</th>
              <th scope="col" className="py-2">記録者</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-reno-line text-ink">
            {history.map((h, i) => (
              <tr key={h.id}>
                <td className="py-2 pr-4 whitespace-nowrap">
                  {new Date(h.confirmedAt).toLocaleString("ja-JP")}
                  {i === 0 && <span className="ml-2 text-xs font-bold text-reno-mute-dark">（直近）</span>}
                </td>
                <td className="py-2 pr-4 font-bold">{h.status}</td>
                <td className="py-2 pr-4 break-all">{h.note ?? ""}</td>
                <td className="py-2 break-all">{h.recordedBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
