"use client";

import { useId } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ADMIN_PER_PAGE_OPTIONS, pageNumbers, type Page } from "@/lib/pagination";

/**
 * 管理画面の一覧（会員管理・物件管理）の表示件数切り替えとページ送り。
 * 件数の計算は src/lib/pagination.ts（テスト済み）に任せ、ここは描画だけを行う。
 */
export default function AdminPager({
  pager,
  total,
  perPage,
  unit,
  onPageChange,
  onPerPageChange,
}: {
  pager: Page;
  /** 絞り込み後の件数 */
  total: number;
  perPage: number;
  /** 「件」「名」など */
  unit: string;
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: number) => void;
}) {
  const perPageId = useId();
  const btn =
    "min-w-9 h-9 px-2 rounded-lg border text-sm font-bold flex items-center justify-center transition-colors";

  return (
    <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 bg-reno-bg/60">
      <div className="flex items-center gap-3 text-sm font-bold text-reno-mute-dark">
        <label htmlFor={perPageId}>表示件数</label>
        <select
          id={perPageId}
          value={perPage}
          onChange={(e) => onPerPageChange(Number(e.target.value))}
          className="px-3 py-2 rounded-xl border border-reno-line bg-white text-sm font-bold text-ink outline-none focus:border-teal"
        >
          {ADMIN_PER_PAGE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}{unit}
            </option>
          ))}
        </select>
        <span>
          {total === 0
            ? `0 ${unit}`
            : `${pager.start + 1}〜${pager.end} ${unit}目 / ${total} ${unit}`}
        </span>
      </div>

      {pager.totalPages > 1 && (
        <nav aria-label="ページ送り" className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onPageChange(pager.page - 1)}
            disabled={pager.page <= 1}
            aria-label="前のページ"
            className={`${btn} border-reno-line bg-white text-ink hover:bg-reno-bg disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <ChevronLeft size={16} />
          </button>
          {pageNumbers(pager.page, pager.totalPages).map((n, i) =>
            n === null ? (
              <span key={`gap-${i}`} className="px-1 text-reno-mute-dark">…</span>
            ) : (
              <button
                key={n}
                type="button"
                onClick={() => onPageChange(n)}
                aria-current={n === pager.page ? "page" : undefined}
                className={`${btn} ${
                  n === pager.page
                    ? "border-teal bg-teal text-white"
                    : "border-reno-line bg-white text-ink hover:bg-reno-bg"
                }`}
              >
                {n}
              </button>
            )
          )}
          <button
            type="button"
            onClick={() => onPageChange(pager.page + 1)}
            disabled={pager.page >= pager.totalPages}
            aria-label="次のページ"
            className={`${btn} border-reno-line bg-white text-ink hover:bg-reno-bg disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <ChevronRight size={16} />
          </button>
        </nav>
      )}
    </div>
  );
}
