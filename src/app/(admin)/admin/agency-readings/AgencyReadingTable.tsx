"use client";

import { useMemo, useState } from "react";
import { Search, Check } from "lucide-react";
import AdminPager from "@/components/AdminPager";
import { paginate, ADMIN_DEFAULT_PER_PAGE } from "@/lib/pagination";
import { compareAgencies } from "@/lib/agencyReading";
import { saveAgencyReading, type AgencyReadingRow } from "@/app/actions/agencyReadings";

type Tab = "all" | "unread" | "estimated";
const TAB_LABEL: Record<Tab, string> = { all: "すべて", unread: "未登録", estimated: "推定のまま" };

/** 読みの一覧と編集。並びは確認依頼書と同じ50音順。 */
export default function AgencyReadingTable({ initialRows }: { initialRows: AgencyReadingRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<Tab>("all");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(ADMIN_DEFAULT_PER_PAGE);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingName, setSavingName] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      all: rows.length,
      unread: rows.filter((r) => !r.reading).length,
      estimated: rows.filter((r) => r.reading && r.estimated).length,
    }),
    [rows]
  );

  const visible = useMemo(() => {
    const word = keyword.trim();
    return rows
      .filter((r) => (tab === "unread" ? !r.reading : tab === "estimated" ? r.reading && r.estimated : true))
      .filter((r) => word === "" || r.agencyName.includes(word) || (r.reading ?? "").includes(word))
      .sort(compareAgencies);
  }, [rows, tab, keyword]);

  const pager = paginate(visible.length, String(page), perPage);
  const pageRows = visible.slice(pager.start, pager.end);

  const save = async (row: AgencyReadingRow) => {
    const draft = drafts[row.agencyName] ?? row.reading ?? "";
    setSavingName(row.agencyName);
    const res = await saveAgencyReading(row.agencyName, draft);
    setSavingName(null);
    if (!res.success) {
      setMessage({ ok: false, text: `${row.agencyName}：${res.error}` });
      return;
    }
    setRows((prev) =>
      prev.map((r) => (r.agencyName === row.agencyName ? { ...r, reading: res.data.reading, estimated: false } : r))
    );
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[row.agencyName];
      return next;
    });
    setMessage({
      ok: true,
      text: res.data.reading
        ? `${row.agencyName} の読みを「${res.data.reading}」で保存しました。`
        : `${row.agencyName} の読みを消しました。`,
    });
  };

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

      {message && (
        <p
          role="status"
          className={`px-4 py-3 text-sm font-bold ${message.ok ? "text-teal bg-teal/5" : "text-red-800 bg-red-50"}`}
        >
          {message.text}
        </p>
      )}

      <AdminPager pager={pager} total={visible.length} perPage={perPage} unit="社"
        onPageChange={setPage} onPerPageChange={(n) => { setPerPage(n); setPage(1); }} />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-reno-bg text-left text-reno-mute-dark">
            <tr>
              <th className="px-4 py-3 font-bold">取扱会社名</th>
              <th className="px-4 py-3 font-bold text-right whitespace-nowrap">物件数</th>
              <th className="px-4 py-3 font-bold">読み（ひらがな）</th>
              <th className="px-4 py-3 font-bold sr-only">保存</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => {
              const draft = drafts[row.agencyName] ?? row.reading ?? "";
              const changed = draft !== (row.reading ?? "");
              return (
                <tr key={row.agencyName} className="border-t border-reno-line">
                  <td className="px-4 py-2 font-bold text-ink">{row.agencyName}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{row.propertyCount}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <input
                        value={draft}
                        aria-label={`${row.agencyName} の読み`}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [row.agencyName]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.nativeEvent.isComposing) void save(row);
                        }}
                        placeholder="未登録"
                        className="w-72 px-3 py-1.5 rounded-lg border border-reno-line outline-none focus:border-teal"
                      />
                      {row.reading && row.estimated && !changed && (
                        <span className="text-xs font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full whitespace-nowrap">
                          推定
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => void save(row)}
                      disabled={savingName === row.agencyName || (!changed && !row.estimated)}
                      className="px-3 py-1.5 rounded-lg border border-reno-line text-sm font-bold text-ink hover:bg-reno-bg disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 whitespace-nowrap"
                    >
                      <Check size={14} /> {row.estimated && !changed ? "確定" : "保存"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
