"use client";

import { useState, useEffect, useMemo, useId } from "react";
import { Search, UserPlus, Eye, Trash2, RefreshCw, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { getUsers, deleteUser, createTestUsers } from "@/app/actions/users";
import AdminPager from "@/components/AdminPager";
import { paginate, ADMIN_DEFAULT_PER_PAGE } from "@/lib/pagination";

type User = {
  id: number;
  name: string | null;
  email: string;
  memberType: string;
  createdAt: string | Date;
  status: string;
  role: string;
};

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // 一覧の絞り込み。以前は検索窓もフィルタボタンも置いてあるだけで何も起きなかった。
  const [keyword, setKeyword] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "FREE" | "STORE">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "ACTIVE" | "SUSPENDED">("all");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(ADMIN_DEFAULT_PER_PAGE);
  const searchId = useId();
  const typeId = useId();
  const statusId = useId();

  // 取得だけを行う。読み込み中フラグは呼び出し側が面倒を見る。
  // （useEffect の同期本体で setState すると react-hooks/set-state-in-effect に触れるため）
  const fetchUsers = async () => {
    try {
      const response = await getUsers();
      if (response.success && response.data) {
        setUsers(response.data as User[]);
      } else {
        setErrorMessage(response.error ?? "会員データを取得できませんでした。");
      }
    } catch (error) {
      // D-07：握り潰さずログに残し、画面には内部情報を出さない
      console.error("会員一覧の取得に失敗:", error);
      setErrorMessage("通信エラーが発生しました。時間をおいて再度お試しください。");
    }
  };

  const reload = async () => {
    setIsLoading(true);
    setErrorMessage("");
    await fetchUsers();
    setIsLoading(false);
  };

  useEffect(() => {
    // 初期表示。isLoading は初期値が true なので、ここで立て直す必要はない。
    void (async () => {
      await fetchUsers();
      setIsLoading(false);
    })();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("この会員を削除しますか？\n（データは論理削除され、一覧から見えなくなります）")) return;
    const res = await deleteUser(id);
    if (!res.success) {
      setErrorMessage(res.error ?? "削除できませんでした。");
      return;
    }
    await reload();
  };

  const handleCreateTest = async () => {
    if (isCreating) return;
    setIsCreating(true);
    setErrorMessage("");
    const res = await createTestUsers();
    setIsCreating(false);
    if (!res.success) {
      setErrorMessage(res.error ?? "テストデータを作成できませんでした。");
      return;
    }
    await reload();
  };

  // 氏名・メールを対象に、読み込み済みの一覧を手元で絞り込む。
  const visibleUsers = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return users.filter((u) => {
      if (typeFilter !== "all" && u.memberType !== typeFilter) return false;
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      if (kw === "") return true;
      return [u.name, u.email].some((v) => (v ?? "").toLowerCase().includes(kw));
    });
  }, [users, keyword, typeFilter, statusFilter]);

  const isFiltered = keyword.trim() !== "" || typeFilter !== "all" || statusFilter !== "all";

  // ページ分け。絞り込みや表示件数を変えたら1ページ目に戻す。
  const pager = paginate(visibleUsers.length, String(page), perPage);
  const pageUsers = visibleUsers.slice(pager.start, pager.end);
  const changePerPage = (next: number) => {
    setPerPage(next);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-end gap-4">
        <div>
          <h1 className="text-2xl font-mincho font-bold text-ink mb-2">会員管理</h1>
          <p className="text-sm text-reno-mute-dark">
            サイトから登録された会員の一覧です。氏名をクリックすると詳細を表示します。
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/users/new"
            className="bg-ink text-white px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-bold hover:bg-teal transition-colors"
          >
            <Plus size={18} />
            会員を登録
          </Link>
          <button
            onClick={reload}
            className="bg-white border border-reno-line px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-bold text-ink hover:bg-reno-bg transition-colors"
          >
            <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
            リスト更新
          </button>
          {process.env.NODE_ENV !== "production" && (
          <button
            onClick={handleCreateTest}
            disabled={isCreating}
            className="bg-white border border-reno-line px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-bold text-ink hover:bg-reno-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating ? <Loader2 size={18} className="animate-spin text-teal" /> : <UserPlus size={18} />}
            {isCreating ? "作成中..." : "テストデータ作成"}
          </button>
          )}
        </div>
      </div>

      {errorMessage && (
        <p
          role="alert"
          className="bg-red-50 border border-red-200 text-red-800 rounded-2xl px-6 py-4 text-sm font-bold"
        >
          {errorMessage}
        </p>
      )}

      <div className="bg-white rounded-2xl border border-reno-line overflow-hidden">
        {/* ------------ 絞り込み ------------ */}
        <div className="p-4 border-b border-reno-line flex flex-wrap justify-between items-center gap-4 bg-reno-bg/60">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative">
              <label htmlFor={searchId} className="sr-only">氏名・メールアドレスで検索</label>
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-reno-mute-dark pointer-events-none"
                size={18}
              />
              <input
                id={searchId}
                type="search"
                value={keyword}
                onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
                placeholder="氏名・メールアドレスで検索"
                className="pl-11 pr-4 py-2.5 rounded-xl border border-reno-line bg-white text-sm w-72 outline-none focus:border-teal"
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor={typeId} className="text-sm font-bold text-reno-mute-dark">会員種別</label>
              <select
                id={typeId}
                value={typeFilter}
                onChange={(e) => { setTypeFilter(e.target.value as typeof typeFilter); setPage(1); }}
                className="px-3 py-2.5 rounded-xl border border-reno-line bg-white text-sm font-bold text-ink outline-none focus:border-teal"
              >
                <option value="all">すべて</option>
                <option value="FREE">無料会員</option>
                <option value="STORE">店舗会員</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor={statusId} className="text-sm font-bold text-reno-mute-dark">状態</label>
              <select
                id={statusId}
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setPage(1); }}
                className="px-3 py-2.5 rounded-xl border border-reno-line bg-white text-sm font-bold text-ink outline-none focus:border-teal"
              >
                <option value="all">すべて</option>
                <option value="ACTIVE">有効</option>
                <option value="SUSPENDED">停止</option>
              </select>
            </div>
            {isFiltered && (
              <button
                onClick={() => { setKeyword(""); setTypeFilter("all"); setStatusFilter("all"); setPage(1); }}
                className="text-sm font-bold text-teal hover:underline"
              >
                絞り込みを解除
              </button>
            )}
          </div>
          <p className="text-sm font-bold text-reno-mute-dark">
            {isFiltered ? `${visibleUsers.length} 名 / 全 ${users.length} 名` : `全 ${users.length} 名`}
          </p>
        </div>

        {/* ------------ 一覧 ------------ */}
        {visibleUsers.length > 0 && (
          <div className="border-b border-reno-line">
            <AdminPager pager={pager} total={visibleUsers.length} perPage={perPage} unit="名"
              onPageChange={setPage} onPerPageChange={changePerPage} />
          </div>
        )}
        <div className="overflow-x-auto">
          {isLoading && users.length === 0 ? (
            <p className="p-16 text-center text-sm font-bold text-reno-mute-dark">
              会員データを読み込み中です…
            </p>
          ) : users.length === 0 ? (
            <p className="p-16 text-center text-sm font-bold text-reno-mute-dark">
              会員が登録されていません。
            </p>
          ) : visibleUsers.length === 0 ? (
            <p className="p-16 text-center text-sm font-bold text-reno-mute-dark">
              条件に合う会員がいません。検索語や絞り込みを変えてお試しください。
            </p>
          ) : (
            <table className="w-full min-w-[880px] text-left">
              <thead>
                <tr className="bg-reno-bg text-sm font-bold text-reno-mute-dark border-b border-reno-line whitespace-nowrap">
                  <th scope="col" className="px-6 py-3">氏名</th>
                  <th scope="col" className="px-6 py-3">メールアドレス</th>
                  <th scope="col" className="px-6 py-3">会員種別</th>
                  <th scope="col" className="px-6 py-3">登録日</th>
                  <th scope="col" className="px-6 py-3">状態</th>
                  <th scope="col" className="px-6 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="text-sm text-ink divide-y divide-reno-line">
                {pageUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-reno-bg/60 transition-colors">
                    <td className="px-6 py-4">
                      <Link
                        href={`/admin/users/${user.id}`}
                        className="font-bold text-ink hover:text-teal transition-colors"
                      >
                        {user.name || "名前未設定"}
                      </Link>
                      {user.role === "ADMIN" && (
                        <span className="ml-2 inline-block px-2 py-0.5 rounded border border-ink/30 bg-ink/5 text-xs font-bold text-ink whitespace-nowrap">
                          管理者
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 break-all">{user.email}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-block px-2.5 py-1 rounded border text-xs font-bold whitespace-nowrap ${
                          user.memberType === "STORE"
                            ? "border-pink/40 text-pink bg-pink/5"
                            : "border-teal/40 text-teal bg-teal/5"
                        }`}
                      >
                        {user.memberType === "STORE" ? "店舗会員" : "無料会員"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {new Date(user.createdAt).toLocaleDateString("ja-JP")}
                    </td>
                    <td className="px-6 py-4">
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        <span
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            user.status === "ACTIVE" ? "bg-teal" : "bg-reno-mute-dark"
                          }`}
                        />
                        {user.status === "ACTIVE" ? "有効" : "停止"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/admin/users/${user.id}`}
                          className="px-3 py-2 rounded-lg border border-reno-line text-ink hover:bg-reno-bg transition-colors flex items-center gap-1.5 text-sm font-bold whitespace-nowrap"
                        >
                          <Eye size={16} />
                          詳細
                        </Link>
                        <button
                          onClick={() => handleDelete(user.id)}
                          className="px-3 py-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 transition-colors flex items-center gap-1.5 text-sm font-bold whitespace-nowrap"
                        >
                          <Trash2 size={16} />
                          削除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {visibleUsers.length > 0 && (
          <div className="border-t border-reno-line">
            <AdminPager pager={pager} total={visibleUsers.length} perPage={perPage} unit="名"
              onPageChange={setPage} onPerPageChange={changePerPage} />
          </div>
        )}
      </div>
    </div>
  );
}
