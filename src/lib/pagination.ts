/**
 * 一覧のページ分け。URL の ?page= をそのまま受け、壊れた値でも表示が崩れないように丸める。
 * 画面から切り離した純関数にしてあり、件数の計算は pagination.test.ts で固定している（D-06）。
 */

export type Page = {
  /** 1始まりのページ番号（範囲外は丸め済み） */
  page: number;
  totalPages: number;
  /** slice(start, end) で使う添字 */
  start: number;
  end: number;
};

export function paginate(total: number, pageParam: string | undefined, perPage: number): Page {
  const totalPages = Math.max(1, Math.ceil(Math.max(0, total) / perPage));
  const requested = /^\d+$/.test(pageParam ?? "") ? Number(pageParam) : 1;
  const page = Math.min(Math.max(1, requested), totalPages);
  const start = (page - 1) * perPage;
  return { page, totalPages, start, end: Math.min(start + perPage, Math.max(0, total)) };
}

/**
 * ページ送りに並べる番号。先頭・末尾・現在の前後だけを出し、間は null（…）にする。
 * スマホ幅でも1行に収まる数（最大7個）に抑えるため。
 */
export function pageNumbers(page: number, totalPages: number): (number | null)[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const around = new Set([1, totalPages, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((n) => around.add(n));
  if (page >= totalPages - 2) [totalPages - 3, totalPages - 2, totalPages - 1].forEach((n) => around.add(n));
  const sorted = [...around].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push(null);
    out.push(n);
  });
  return out;
}

/**
 * 管理画面の一覧で選べる表示件数（2026-10-08 大野の指示）。既定は50件。
 * 全件を一度に描くと、1,600件を超えた物件管理で画面が重くなるため分ける。
 */
export const ADMIN_PER_PAGE_OPTIONS = [10, 50, 100, 200, 500] as const;
export const ADMIN_DEFAULT_PER_PAGE = 50;

/** 表示件数の選択値を読む。選択肢に無い値は既定値に戻す。 */
export function parseAdminPerPage(value: string | null | undefined): number {
  const n = Number(value);
  return (ADMIN_PER_PAGE_OPTIONS as readonly number[]).includes(n) ? n : ADMIN_DEFAULT_PER_PAGE;
}
