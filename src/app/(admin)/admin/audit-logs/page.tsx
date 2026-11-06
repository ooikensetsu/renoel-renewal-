import Link from "next/link";
import { getAuditLogs } from "@/app/actions/auditLogs";
import { AUDIT_ACTIONS, AUDIT_GROUPS, AUDIT_TARGET_LABEL, isAuditAction } from "@/config/auditLog";

/**
 * 管理画面の操作履歴（2026-11-05 大野の指示）。
 * 誰が・いつ・何を・どの対象に行ったか。値は残していない（変更した項目の名前だけ）。
 * 絞り込みは GET のフォームで送る（画面側の JS に頼らない）。
 */
export const dynamic = "force-dynamic";

type Search = { action?: string; actor?: string; targetType?: string; targetId?: string; page?: string };

/** 対象を開くリンク。物件・会員・取扱会社だけ詳細画面がある。 */
function targetHref(type: string | null, id: string): string | null {
  if (type === "PROPERTY" && /^\d+$/.test(id)) return `/admin/properties/${id}`;
  if (type === "USER" && /^\d+$/.test(id)) return `/admin/users/${id}`;
  if (type === "AGENCY") return `/admin/agencies/detail?name=${encodeURIComponent(id)}`;
  return null;
}

/** 一覧に出す対象IDの数。多い一括操作は先頭だけ出し、残りは件数で示す。 */
const SHOW_IDS = 5;

export default async function AdminAuditLogsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const page = parseInt(sp.page ?? "1");
  const res = await getAuditLogs({
    action: sp.action,
    actor: sp.actor,
    targetType: sp.targetType,
    targetId: sp.targetId,
    page: Number.isInteger(page) ? page : 1,
  });
  const data = res.success ? res.data : null;

  const pageHref = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "page") q.set(k, v);
    q.set("page", String(p));
    return `/admin/audit-logs?${q.toString()}`;
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-ink mb-2">操作履歴</h1>
        <p className="text-sm text-reno-mute-dark">
          管理画面での変更・出力・個人情報の閲覧・ログインの記録。値は残さず、変更した項目の名前だけを残す。
        </p>
      </div>

      <form method="get" className="bg-white rounded-2xl border border-reno-line p-6 flex flex-wrap items-end gap-4">
        <label className="text-xs font-bold text-reno-mute-dark flex flex-col gap-1">
          操作
          <select name="action" defaultValue={sp.action ?? ""} className="border border-reno-line rounded-lg px-3 py-2 text-sm text-ink bg-white">
            <option value="">すべて</option>
            {AUDIT_GROUPS.map((g) => (
              <optgroup key={g} label={g}>
                <option value={g}>{g}のすべて</option>
                {Object.entries(AUDIT_ACTIONS)
                  .filter(([, v]) => v.group === g)
                  .map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold text-reno-mute-dark flex flex-col gap-1">
          実行者
          <select name="actor" defaultValue={sp.actor ?? ""} className="border border-reno-line rounded-lg px-3 py-2 text-sm text-ink bg-white">
            <option value="">全員</option>
            {(data?.actors ?? []).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold text-reno-mute-dark flex flex-col gap-1">
          対象
          <select name="targetType" defaultValue={sp.targetType ?? ""} className="border border-reno-line rounded-lg px-3 py-2 text-sm text-ink bg-white">
            <option value="">すべて</option>
            {Object.entries(AUDIT_TARGET_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold text-reno-mute-dark flex flex-col gap-1">
          対象ID（物件・会員はID、取扱会社は会社名）
          <input name="targetId" defaultValue={sp.targetId ?? ""} className="border border-reno-line rounded-lg px-3 py-2 text-sm text-ink bg-white" />
        </label>
        <button type="submit" className="bg-ink text-white! font-bold text-sm rounded-lg px-5 py-2">
          絞り込む
        </button>
        <Link href="/admin/audit-logs" className="text-sm font-bold text-reno-mute-dark underline">
          条件を外す
        </Link>
      </form>

      {!res.success && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-sm font-bold text-red-800">{res.error}</div>
      )}

      {data && (
        <>
          <p className="text-sm font-bold text-ink">
            {data.total.toLocaleString()} 件（{data.page} / {data.pageCount} ページ）
          </p>
          <div className="bg-white rounded-2xl border border-reno-line overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-reno-bg text-left">
                  <tr className="text-xs font-bold text-reno-mute-dark">
                    <th className="px-4 py-3 whitespace-nowrap">日時</th>
                    <th className="px-4 py-3 whitespace-nowrap">実行者</th>
                    <th className="px-4 py-3 whitespace-nowrap">操作</th>
                    <th className="px-4 py-3">対象</th>
                    <th className="px-4 py-3">変更した項目</th>
                    <th className="px-4 py-3">補足</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-reno-line">
                  {data.rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-reno-mute-dark font-bold">
                        記録がありません。
                      </td>
                    </tr>
                  )}
                  {data.rows.map((row) => {
                    const ids = row.targetIds.slice(0, SHOW_IDS);
                    const rest = row.targetIds.length - ids.length;
                    return (
                      <tr key={row.id} className="align-top">
                        <td className="px-4 py-3 whitespace-nowrap text-xs font-medium text-reno-mute-dark">
                          {row.createdAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
                        </td>
                        <td className="px-4 py-3 text-xs font-medium text-ink break-all">{row.actorEmail}</td>
                        <td className="px-4 py-3 text-xs font-bold text-ink whitespace-nowrap">
                          {isAuditAction(row.action) ? AUDIT_ACTIONS[row.action].label : row.action}
                        </td>
                        <td className="px-4 py-3 text-xs text-ink">
                          {row.targetType && (
                            <span className="text-reno-mute-dark mr-1">{AUDIT_TARGET_LABEL[row.targetType] ?? row.targetType}</span>
                          )}
                          {ids.map((id, i) => {
                            const href = targetHref(row.targetType, id);
                            return (
                              <span key={`${id}-${i}`}>
                                {i > 0 && "、"}
                                {href ? (
                                  <Link href={href} className="underline font-bold text-ink">{id}</Link>
                                ) : (
                                  id
                                )}
                              </span>
                            );
                          })}
                          {rest > 0 && <span className="text-reno-mute-dark">　ほか{rest}件</span>}
                          {row.count !== null && (
                            <span className="block text-reno-mute-dark">{row.count.toLocaleString()} 件</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-ink">{row.fields.length > 0 ? row.fields.join("、") : "—"}</td>
                        <td className="px-4 py-3 text-xs text-reno-mute-dark">{row.summary ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {data.pageCount > 1 && (
            <nav className="flex gap-4 text-sm font-bold" aria-label="ページ送り">
              {data.page > 1 && <Link href={pageHref(data.page - 1)} className="underline text-ink">前のページ</Link>}
              {data.page < data.pageCount && <Link href={pageHref(data.page + 1)} className="underline text-ink">次のページ</Link>}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
