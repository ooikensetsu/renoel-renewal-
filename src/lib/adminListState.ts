/**
 * 管理画面の一覧の表示状態（絞り込み・ページ・表示件数）を覚えておく（2026-10-27）。
 * 詳細を開いて「一覧へ戻る」を押すと1ページ目に戻ってしまうため、タブ単位の sessionStorage に残し、
 * 一覧を開き直したときに戻す。読めない値・壊れた値は捨てて既定の表示にする。
 * 読み書きは画面から、値の検査は純関数にして adminListState.test.ts で固定している（D-06）。
 */
import type { AdminPropertyFilter } from "./adminPropertyFilter.ts";
import { ADMIN_PER_PAGE_OPTIONS } from "./pagination.ts";
import { TRANSACTION_CATEGORIES } from "../config/property.ts";

export const PROPERTY_LIST_STATE_KEY = "admin:properties:list";
export const USER_LIST_STATE_KEY = "admin:users:list";

export type ListState<F> = { filter: F; page: number; perPage: number };

export type UserListFilter = {
  keyword: string;
  typeFilter: "all" | "FREE" | "STORE";
  statusFilter: "all" | "ACTIVE" | "SUSPENDED";
};

/** 保存した値を読む。読めない（プライベートウィンドウ等）・JSONでないときは null。 */
export function loadListState(key: string): unknown {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveListState(key: string, state: ListState<unknown>): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(state));
  } catch {
    // 保存できなくても一覧は使える（戻ったときに1ページ目になるだけ）
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** ページと表示件数。件数がおかしければ null（状態ごと捨てる）。ページの上限は一覧側の paginate が丸める。 */
function parsePaging(v: Record<string, unknown>): { page: number; perPage: number } | null {
  const { page, perPage } = v;
  if (typeof page !== "number" || !Number.isInteger(page) || page < 1) return null;
  if (!(ADMIN_PER_PAGE_OPTIONS as readonly unknown[]).includes(perPage)) return null;
  return { page, perPage: perPage as number };
}

function allOrNumber(v: unknown): "all" | number | undefined {
  if (v === "all") return "all";
  return typeof v === "number" && Number.isInteger(v) ? v : undefined;
}

export function parsePropertyListState(v: unknown): ListState<AdminPropertyFilter> | null {
  if (!isRecord(v) || !isRecord(v.filter)) return null;
  const paging = parsePaging(v);
  if (!paging) return null;
  const f = v.filter;
  const syubetu = allOrNumber(f.syubetu);
  const level = allOrNumber(f.level);
  if (typeof f.keyword !== "string" || typeof f.agency !== "string") return null;
  if (syubetu === undefined || level === undefined) return null;
  if (f.top !== "all" && f.top !== "on" && f.top !== "off") return null;
  // 取引態様は 2026-10-27 に足した。それより前に保存した状態には無いので「すべて」とみなす
  const transaction = f.transaction ?? "all";
  if (transaction !== "all" && !TRANSACTION_CATEGORIES.some((c) => c.value === transaction)) return null;
  return {
    filter: {
      keyword: f.keyword,
      syubetu,
      level,
      agency: f.agency,
      top: f.top,
      transaction: transaction as AdminPropertyFilter["transaction"],
    },
    ...paging,
  };
}

export function parseUserListState(v: unknown): ListState<UserListFilter> | null {
  if (!isRecord(v) || !isRecord(v.filter)) return null;
  const paging = parsePaging(v);
  if (!paging) return null;
  const f = v.filter;
  if (typeof f.keyword !== "string") return null;
  if (f.typeFilter !== "all" && f.typeFilter !== "FREE" && f.typeFilter !== "STORE") return null;
  if (f.statusFilter !== "all" && f.statusFilter !== "ACTIVE" && f.statusFilter !== "SUSPENDED") return null;
  return { filter: { keyword: f.keyword, typeFilter: f.typeFilter, statusFilter: f.statusFilter }, ...paging };
}
