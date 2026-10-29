"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard, Users, Building2, MessageSquare, MailWarning,
  ExternalLink, LogOut, Briefcase,
} from "lucide-react";

/**
 * 管理画面の左メニュー。
 *
 * 以前は「ダッシュボード」に bg-white/5 が直書きされており、どの画面にいても
 * ダッシュボードが選択中に見えていた。現在地は URL から判定する。
 * usePathname を使うためクライアントコンポーネントに切り出している。
 */

const ITEMS = [
  { href: "/admin", label: "ダッシュボード", icon: LayoutDashboard },
  { href: "/admin/users", label: "会員管理", icon: Users },
  { href: "/admin/properties", label: "物件管理", icon: Building2 },
  // 読みの登録（/admin/agency-readings）は取扱会社の画面の中のタブにまとめた（2026-10-22）
  { href: "/admin/agencies", label: "取扱会社", icon: Briefcase, also: ["/admin/agency-readings"] },
  { href: "/admin/inquiries", label: "お問い合わせ管理", icon: MessageSquare },
  { href: "/admin/mail-logs", label: "メール送信ログ", icon: MailWarning },
];

export default function AdminNav({ unreadInquiries }: { unreadInquiries: number }) {
  const pathname = usePathname();

  // 「/admin」は完全一致で見る。前方一致にすると全ページで選択中になる。
  const isCurrent = (href: string, also: readonly string[] = []) =>
    href === "/admin" ? pathname === "/admin" : [href, ...also].some((h) => pathname.startsWith(h));

  return (
    <>
      <nav className="flex-grow px-4 space-y-1" aria-label="管理メニュー">
        {ITEMS.map(({ href, label, icon: Icon, also }) => {
          const current = isCurrent(href, also);
          return (
            <Link
              key={href}
              href={href}
              aria-current={current ? "page" : undefined}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-colors ${
                current
                  ? "bg-white/15 shadow-inner"
                  : "hover:bg-white/10"
              }`}
            >
              <Icon size={20} className="shrink-0" />
              <span className="flex-grow">{label}</span>
              {/* 未対応の問い合わせは、メニューの時点で件数が分かるようにする */}
              {href === "/admin/inquiries" && unreadInquiries > 0 && (
                <span className="bg-pink text-white text-xs font-bold rounded-full min-w-6 h-6 px-2 flex items-center justify-center">
                  {unreadInquiries}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/10 space-y-1">
        <Link
          href="/"
          target="_blank"
          className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/10 transition-colors text-sm font-bold"
        >
          <ExternalLink size={20} className="shrink-0" />
          公開サイトを見る
        </Link>
        {/* 以前はここに「サイトへ戻る」しか無く、管理画面からログアウトできなかった */}
        <button
          type="button"
          onClick={() => void signOut({ callbackUrl: "/" })}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-pink/25 transition-colors text-sm font-bold text-left"
        >
          <LogOut size={20} className="shrink-0" />
          ログアウト
        </button>
      </div>
    </>
  );
}
