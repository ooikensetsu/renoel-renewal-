import { AlertTriangle } from "lucide-react";
import type { SpellingWarning } from "@/lib/agencyMaster";

/**
 * CSV取込の確認画面に出す、表記ゆれの疑いがある会社名の一覧（2026-10-27）。
 * 取り込みは止めない。同じ会社なら、CSVの表記を直してから読み込み直してもらう。
 */
export default function AgencySpellingWarnings({
  warnings,
  rowCountOf,
}: {
  warnings: SpellingWarning[];
  rowCountOf: (name: string) => number;
}) {
  if (warnings.length === 0) return null;
  return (
    <div className="bg-pink/5 p-4 rounded-2xl flex items-start gap-3">
      <AlertTriangle className="text-pink mt-0.5 shrink-0" size={18} />
      <div className="text-xs font-bold text-ink leading-relaxed">
        <p className="mb-2">
          登録済みの会社と表記だけが違う会社名が {warnings.length} 件あります。このまま取り込むと、別の会社として増えます。
        </p>
        <ul className="space-y-0.5">
          {warnings.map((w) => (
            <li key={w.name}>
              「{w.name}」（{rowCountOf(w.name)}件）→ 似た会社：{w.similar.map((s) => `「${s}」`).join("、")}
            </li>
          ))}
        </ul>
        <p className="mt-2">同じ会社なら、CSVの会社名を登録済みの表記に直してから読み込み直してください。</p>
      </div>
    </div>
  );
}
