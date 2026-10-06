import Link from "next/link";
import {
  Users, Building2, MessageSquare, AlertTriangle, ImageOff,
  ArrowRight, MailWarning, Inbox, CheckCircle2,
} from "lucide-react";
import { getDashboardSummary } from "@/app/actions/dashboard";
import DisclosureBadge from "@/components/DisclosureBadge";

/**
 * 管理者ダッシュボード。
 *
 * 以前は全ての数字（会員1,284人・物件45件・問い合わせ32件・閲覧12.4k・「+12%」）と
 * 一覧の中身が画面に直書きされた架空データだった。全てDBの実測値に置き換えている。
 * 集計は src/app/actions/dashboard.ts。
 */
export const dynamic = "force-dynamic";

/** 数字を3桁区切りにする。 */
const n = (v: number) => v.toLocaleString("ja-JP");

function StatCard({
  label, value, unit, icon: Icon, note, href, tone = "ink",
}: {
  label: string;
  value: number;
  unit: string;
  icon: typeof Users;
  note: string;
  href: string;
  tone?: "ink" | "teal" | "pink";
}) {
  const toneClass = {
    ink: "bg-ink/5 text-ink",
    teal: "bg-teal/10 text-teal",
    pink: "bg-pink/10 text-pink",
  }[tone];

  return (
    <Link
      href={href}
      className="group bg-white border border-reno-line rounded-2xl p-6 flex flex-col gap-4 hover:border-teal hover:shadow-md transition-all"
    >
      <div className="flex items-center justify-between">
        <span className={`${toneClass} p-3 rounded-xl`}>
          <Icon size={22} />
        </span>
        <ArrowRight
          size={18}
          className="text-reno-mute-dark opacity-0 group-hover:opacity-100 transition-opacity"
        />
      </div>
      <div>
        <p className="text-sm font-bold text-reno-mute-dark mb-1">{label}</p>
        <p className="text-3xl font-bold text-ink leading-none">
          {n(value)}
          <span className="text-base font-bold text-reno-mute-dark ml-1">{unit}</span>
        </p>
        <p className="text-xs text-reno-mute-dark mt-2">{note}</p>
      </div>
    </Link>
  );
}

export default async function AdminDashboard() {
  const res = await getDashboardSummary();

  if (!res.success) {
    return (
      <div className="space-y-8">
        <h1 className="text-3xl font-mincho font-bold text-ink">管理者ダッシュボード</h1>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-sm font-bold text-red-800">
          {res.error}
        </div>
      </div>
    );
  }

  const d = res.data;

  // 「いま人が手を動かす必要があること」だけを上に集める。
  const todos = [
    d.inquiries.unread > 0 && {
      key: "inquiry",
      icon: Inbox,
      text: `未対応のお問い合わせが ${n(d.inquiries.unread)} 件あります`,
      href: "/admin/inquiries",
      action: "お問い合わせ管理へ",
    },
    d.mail.failed > 0 && {
      key: "mail",
      icon: MailWarning,
      text: `送信に失敗したメールが ${n(d.mail.failed)} 件あります（相手に自動返信が届いていません）`,
      href: "/admin/mail-logs",
      action: "メール送信ログへ",
    },
    d.properties.withoutImage > 0 && {
      key: "image",
      icon: ImageOff,
      text: `画像が1枚も登録されていない物件が ${n(d.properties.withoutImage)} 件あります`,
      href: "/admin/properties",
      action: "物件管理へ",
    },
  ].filter(Boolean) as {
    key: string; icon: typeof Inbox; text: string; href: string; action: string;
  }[];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-mincho font-bold text-ink mb-2">管理者ダッシュボード</h1>
        <p className="text-sm text-reno-mute-dark">
          数値はすべて現在のデータベースの実測値です。
        </p>
      </div>

      {/* ------------ 要対応 ------------ */}
      {todos.length > 0 ? (
        <section
          aria-labelledby="todo-heading"
          className="bg-white border-2 border-pink/40 rounded-2xl overflow-hidden"
        >
          <h2
            id="todo-heading"
            className="flex items-center gap-2 px-6 py-4 bg-pink/5 text-base font-bold text-ink border-b border-pink/20"
          >
            <AlertTriangle size={20} className="text-pink" />
            対応が必要なこと（{todos.length}件）
          </h2>
          <ul className="divide-y divide-reno-line">
            {todos.map((t) => (
              <li key={t.key}>
                <Link
                  href={t.href}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-reno-bg transition-colors"
                >
                  <t.icon size={20} className="text-pink shrink-0" />
                  <span className="flex-grow text-sm font-bold text-ink">{t.text}</span>
                  <span className="text-sm font-bold text-teal whitespace-nowrap flex items-center gap-1">
                    {t.action}
                    <ArrowRight size={16} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="bg-white border border-reno-line rounded-2xl px-6 py-5 flex items-center gap-3">
          <CheckCircle2 size={20} className="text-teal shrink-0" />
          <p className="text-sm font-bold text-ink">
            いま対応が必要なものはありません。
          </p>
        </section>
      )}

      {/* ------------ 主要な数字 ------------ */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard
          label="登録会員数"
          value={d.members.total}
          unit="名"
          icon={Users}
          note={`管理者を除く／うち有効 ${n(d.members.active)}名・店舗会員 ${n(d.members.store)}名`}
          href="/admin/users"
        />
        <StatCard
          label="掲載物件数"
          value={d.properties.total}
          unit="件"
          icon={Building2}
          note={`一般公開 ${n(d.properties.publicCount)}件 ／ 会員限定 ${n(d.properties.membersOnly)}件 ／ 非表示 ${n(d.properties.hiddenCount)}件`}
          href="/admin/properties"
          tone="teal"
        />
        <StatCard
          label="今月のお問い合わせ"
          value={d.inquiries.thisMonth}
          unit="件"
          icon={MessageSquare}
          note={`${new Date().getMonth() + 1}月1日からの累計`}
          href="/admin/inquiries"
          tone="teal"
        />
        <StatCard
          label="未対応のお問い合わせ"
          value={d.inquiries.unread}
          unit="件"
          icon={Inbox}
          note="まだ返信していないもの"
          href="/admin/inquiries"
          tone={d.inquiries.unread > 0 ? "pink" : "ink"}
        />
      </div>

      {/* ------------ 最近の登録会員 / 最近の掲載物件 ------------ */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="bg-white border border-reno-line rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-reno-line flex justify-between items-center">
            <h2 className="text-base font-bold text-ink font-mincho">最近の登録会員</h2>
            <Link
              href="/admin/users"
              className="text-sm font-bold text-teal hover:underline whitespace-nowrap"
            >
              会員一覧へ
            </Link>
          </div>
          {d.recentUsers.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm font-bold text-reno-mute-dark">
              まだ登録がありません。
            </p>
          ) : (
            <ul className="divide-y divide-reno-line">
              {d.recentUsers.map((u) => (
                <li key={u.id}>
                  <Link
                    href={`/admin/users/${u.id}`}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-reno-bg transition-colors"
                  >
                    <span className="w-10 h-10 bg-reno-bg text-ink rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                      {(u.name ?? u.email).slice(0, 2)}
                    </span>
                    <span className="flex-grow min-w-0">
                      <span className="block font-bold text-ink text-sm truncate">
                        {u.name ?? "名前未設定"}
                        {u.memberType === "STORE" && (
                          <span className="ml-2 text-xs font-bold text-teal border border-teal/40 bg-teal/5 rounded px-1.5 py-0.5">
                            店舗会員
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-reno-mute-dark truncate">{u.email}</span>
                    </span>
                    <span className="text-xs font-bold text-reno-mute-dark whitespace-nowrap">
                      {u.createdAt.toLocaleString("ja-JP", {
                        month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-white border border-reno-line rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-reno-line flex justify-between items-center">
            <h2 className="text-base font-bold text-ink font-mincho">最近更新した物件</h2>
            <Link
              href="/admin/properties"
              className="text-sm font-bold text-teal hover:underline whitespace-nowrap"
            >
              物件一覧へ
            </Link>
          </div>
          {d.recentProperties.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm font-bold text-reno-mute-dark">
              まだ物件がありません。
            </p>
          ) : (
            <ul className="divide-y divide-reno-line">
              {d.recentProperties.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/admin/properties/${p.id}`}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-reno-bg transition-colors"
                  >
                    {/* 以前は全物件に Unsplash の同じ写真を出していた。実画像か「画像なし」を出す。 */}
                    {p.imageUrl ? (
                      <img
                        src={p.imageUrl}
                        alt=""
                        className="w-14 h-14 rounded-lg object-cover bg-reno-bg shrink-0"
                      />
                    ) : (
                      <span className="w-14 h-14 rounded-lg bg-reno-bg text-reno-mute-dark flex flex-col items-center justify-center gap-0.5 shrink-0">
                        <ImageOff size={16} />
                        <span className="text-xs font-bold">なし</span>
                      </span>
                    )}
                    <span className="flex-grow min-w-0">
                      <span className="block font-bold text-ink text-sm truncate">{p.title}</span>
                      <span className="block text-xs text-reno-mute-dark">
                        管理番号 {p.objMngNo}
                      </span>
                      <span className="block text-sm font-bold text-ink mt-0.5">
                        {n(p.priceMan)}万円
                      </span>
                    </span>
                    <DisclosureBadge level={p.disclosureLevel} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
