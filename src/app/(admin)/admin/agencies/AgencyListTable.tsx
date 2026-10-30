"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import AdminPager from "@/components/AdminPager";
import { paginate, ADMIN_DEFAULT_PER_PAGE } from "@/lib/pagination";
import { compareAgencies } from "@/lib/agencyReading";
import type { AgencyListRow } from "@/app/actions/agencies";
import {
  AGENCY_LIST_STATE_KEY,
  loadListState,
  parseAgencyListState,
  saveListState,
  type AgencyListFilter,
} from "@/lib/adminListState";

type Tab = AgencyListFilter["tab"];
const subscribeNothing = () => () => {};
const TAB_LABEL: Record<Tab, string> = { all: "すべて", variants: "表記ゆれ候補", unregistered: "会社情報が未登録" };

/** 取扱会社の一覧。並びは確認依頼書と同じ50音順。 */
export default function AgencyListTable({ rows }: { rows: AgencyListRow[] }) {
  // 詳細から戻ったときに元のタブ・検索語・ページへ戻す（物件管理・会員管理と同じ・2026-10-29）。
  // 保存した値を初期値として読む。サーバーでは読めず既定値になるため、表はブラウザーで描くまで出さない
  // （出すとサーバーの描画とずれる）。
  const [saved] = useState(() => parseAgencyListState(loadListState(AGENCY_LIST_STATE_KEY)));
  const isInBrowser = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const [tab, setTab] = useState<Tab>(saved?.filter.tab ?? "all");
  const [keyword, setKeyword] = useState(saved?.filter.keyword ?? "");
  const [page, setPage] = useState(saved?.page ?? 1);
  const [perPage, setPerPage] = useState(saved?.perPage ?? ADMIN_DEFAULT_PER_PAGE);
  useEffect(() => {
    saveListState(AGENCY_LIST_STATE_KEY, { filter: { tab, keyword }, page, perPage });
  }, [tab, keyword, page, perPage]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      variants: rows.filter((r) => r.variantCount > 0).length,
      unregistered: rows.filter((r) => !r.registered).length,
    }),
    [rows]
  );

  const visible = useMemo(() => {
    const word = keyword.trim();
    return rows
      .filter((r) => (tab === "variants" ? r.variantCount > 0 : tab === "unregistered" ? !r.registered : true))
      .filter((r) => word === "" || r.name.includes(word) || (r.reading ?? "").includes(word))
      .map((r) => ({ ...r, agencyName: r.name }))
      .sort(compareAgencies);
  }, [rows, tab, keyword]);

  const pager = paginate(visible.length, String(page), perPage);
  const pageRows = visible.slice(pager.start, pager.end);

  if (!isInBrowser) return null;
  return (
    <div className="bg-white rounded-2xl border border-reno-line overflow-hidden">
      <div className="p-4 flex flex-wrap items-center gap-3 border-b border-reno-line">
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setPage(1);
            }}
            aria-pressed={tab === t}
            className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${
              tab === t ? "bg-ink text-white border-ink" : "bg-white text-ink border-reno-line hover:bg-reno-bg"
            }`}
          >
            {TAB_LABEL[t]}（{counts[t]}）
          </button>
        ))}
        <label className="relative ml-auto">
          <span className="sr-only">会社名・読みで検索</span>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-reno-mute-dark" />
          <input
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setPage(1);
            }}
            placeholder="会社名・読みで検索"
            className="pl-9 pr-3 py-2 rounded-xl border border-reno-line text-sm outline-none focus:border-teal"
          />
        </label>
      </div>

      <AdminPager pager={pager} total={visible.length} perPage={perPage} unit="社"
        onPageChange={setPage} onPerPageChange={(n) => { setPerPage(n); setPage(1); }} />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-reno-bg text-left text-reno-mute-dark">
            <tr>
              <th className="px-4 py-3 font-bold">取扱会社名</th>
              <th className="px-4 py-3 font-bold">読み</th>
              <th className="px-4 py-3 font-bold text-right whitespace-nowrap">物件数</th>
              <th className="px-4 py-3 font-bold whitespace-nowrap">会社情報</th>
              <th className="px-4 py-3 font-bold whitespace-nowrap">表記ゆれ候補</th>
              <th className="px-4 py-3 font-bold whitespace-nowrap">統合した旧表記</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={row.name} className="border-t border-reno-line">
                <td className="px-4 py-2">
                  <Link
                    href={`/admin/agencies/detail?name=${encodeURIComponent(row.name)}`}
                    className="font-bold text-teal-hover! underline underline-offset-2 hover:no-underline"
                  >
                    {row.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-reno-mute-dark">{row.reading ?? "未登録"}</td>
                <td className="px-4 py-2 text-right tabular-nums">{row.propertyCount}</td>
                <td className="px-4 py-2 whitespace-nowrap">{row.registered ? "登録済み" : "未登録"}</td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {row.variantCount > 0 ? (
                    <span className="text-xs font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full">
                      {row.variantCount}社
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2 whitespace-nowrap tabular-nums">{row.aliasCount > 0 ? `${row.aliasCount}件` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 表の下にもページ送り（物件管理と同じ・2026-10-29） */}
      {visible.length > 0 && (
        <div className="border-t border-reno-line">
          <AdminPager pager={pager} total={visible.length} perPage={perPage} unit="社"
            onPageChange={setPage} onPerPageChange={(n) => { setPerPage(n); setPage(1); }} />
        </div>
      )}
    </div>
  );
}
