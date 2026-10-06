import { DISCLOSURE_LEVEL, DISCLOSURE_LEVEL_LABEL, isDisclosureLevel } from "@/config/security";

/**
 * 管理画面で公開レベルを示すバッジ。ダッシュボード・物件一覧・物件詳細が共通で使う（D-09）。
 * 以前は3画面がそれぞれ「会員限定か、それ以外は一般公開」と書き分けていた。
 */
const BADGE_CLASS: Record<number, string> = {
  [DISCLOSURE_LEVEL.PUBLIC]: "border-teal/40 text-teal bg-teal/5",
  [DISCLOSURE_LEVEL.MEMBERS]: "border-pink/40 text-pink bg-pink/5",
  [DISCLOSURE_LEVEL.HIDDEN]: "border-reno-line text-reno-mute-dark bg-reno-bg",
};

export default function DisclosureBadge({ level }: { level: number }) {
  // 定義に無い値は「一般公開」と見せず、そのまま異常として出す。
  const label = isDisclosureLevel(level) ? DISCLOSURE_LEVEL_LABEL[level] : `不明(${level})`;
  return (
    <span
      className={`inline-block px-2.5 py-1 rounded border text-xs font-bold whitespace-nowrap ${
        BADGE_CLASS[level] ?? "border-red-300 text-red-700 bg-red-50"
      }`}
    >
      {label}
    </span>
  );
}
