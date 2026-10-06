"use client";

import { useId, useState } from "react";
import { DISCLOSURE_LEVEL, DISCLOSURE_LEVEL_LABEL } from "@/config/security";
import { bulkUpdateDisclosureLevel } from "@/app/actions/propertyBulkEdit";

/**
 * 一覧でチェックした物件の公開レベルをまとめて変える帯。
 * D-17：件数を画面に出し、確認ダイアログで想定件数を見せてから送る。
 * サーバー側でも件数を数え直し、ずれていれば書き込まない。
 */
export default function BulkDisclosureBar({
  selectedIds,
  onClear,
  onDone,
}: {
  selectedIds: number[];
  onClear: () => void;
  onDone: (message: string) => void;
}) {
  const [level, setLevel] = useState<number>(DISCLOSURE_LEVEL.PUBLIC);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const levelId = useId();

  const count = selectedIds.length;
  if (count === 0) return null;

  const handleApply = async () => {
    const label = DISCLOSURE_LEVEL_LABEL[level as keyof typeof DISCLOSURE_LEVEL_LABEL];
    if (!window.confirm(
      `選択した ${count} 件の公開レベルを「${label}」に変更します。\n` +
      `変更前の公開レベルは控えとして保存されます。実行してよろしいですか？`
    )) {
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const res = await bulkUpdateDisclosureLevel(selectedIds, level, count);
      if (!res.success) {
        setError(res.error);
        return;
      }
      onDone(`${res.count} 件の公開レベルを「${label}」に変更しました（控え番号 ${res.backupId}）。`);
    } catch (err) {
      // 送信そのものが失敗した場合。サーバーはトランザクションに入っていないか、巻き戻している。
      console.error("公開レベルの一括変更の送信に失敗:", err);
      setError("サーバーとの通信に失敗したため、変更していません。時間をおいてお試しください。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-4 border-b border-reno-line bg-teal/5 flex flex-wrap items-center gap-3">
      <p className="text-sm font-bold text-ink">{count} 件を選択中</p>
      <label htmlFor={levelId} className="text-sm font-bold text-reno-mute-dark">
        公開レベルを
      </label>
      <select
        id={levelId}
        value={level}
        onChange={(e) => setLevel(Number(e.target.value))}
        className="px-3 py-2 rounded-xl border border-reno-line bg-white text-sm font-bold text-ink outline-none focus:border-teal"
      >
        {Object.entries(DISCLOSURE_LEVEL_LABEL).map(([code, label]) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </select>
      <button
        onClick={handleApply}
        disabled={isSaving}
        className="px-4 py-2 rounded-xl bg-ink text-white text-sm font-bold hover:opacity-90 disabled:opacity-50"
      >
        {isSaving ? "反映中…" : "一括で反映"}
      </button>
      <button onClick={onClear} disabled={isSaving} className="text-sm font-bold text-ink underline hover:opacity-70">
        選択を解除
      </button>
      {error && (
        <p role="alert" className="w-full text-sm font-bold text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
