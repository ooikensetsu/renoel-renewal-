import Link from "next/link";

/**
 * 取扱会社の画面の切り替え（2026-10-22）。左メニューの「取扱会社」と「取扱会社の読み」を1つにまとめ、
 * 会社一覧と読みの登録をこのタブで行き来する。読みの画面の URL（/admin/agency-readings）は変えていない。
 */
const TABS = [
  { key: "list", href: "/admin/agencies", label: "会社一覧" },
  { key: "readings", href: "/admin/agency-readings", label: "読みの登録" },
] as const;

export default function AgencySubNav({ current }: { current: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="取扱会社の画面" className="flex gap-1 border-b border-reno-line">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === current ? "page" : undefined}
          className={`px-4 py-2 -mb-px border-b-2 text-sm font-bold ${
            tab.key === current ? "border-ink text-ink!" : "border-transparent text-reno-mute-dark! hover:text-ink!"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
