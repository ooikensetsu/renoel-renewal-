"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { deleteAgencyAlias, mergeAgencies, previewAgencyMerge } from "@/app/actions/agencies";

type Company = { name: string; propertyCount: number };
type Preview =
  | { ok: true; changeCount: number }
  | { ok: false; error: string; conflicts: { listingCompanyNo: string; properties: { id: number; label: string }[] }[] };

const SEARCH_LIMIT = 20;

/**
 * 表記ゆれの統合。選んだ会社の物件をこの会社の名前に書き換え、選んだ名前は旧表記として残す。
 * 件数を確認してから実行する（D-17）。統合先にしたい名前の画面で操作する。
 */
export default function AgencyMergePanel({
  target, variants, others, aliases,
}: {
  target: string;
  variants: Company[];
  others: Company[];
  aliases: string[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [keyword, setKeyword] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const countOf = useMemo(() => new Map(others.map((o) => [o.name, o.propertyCount])), [others]);
  const variantNames = useMemo(() => new Set(variants.map((v) => v.name)), [variants]);
  const searchHits = useMemo(() => {
    const word = keyword.trim();
    if (word === "") return [];
    return others.filter((o) => o.name.includes(word) && !variantNames.has(o.name)).slice(0, SEARCH_LIMIT);
  }, [keyword, others, variantNames]);

  const toggle = (name: string) => {
    setPreview(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const check = async () => {
    setBusy(true);
    setMessage(null);
    const res = await previewAgencyMerge(target, [...selected]);
    setBusy(false);
    if (!res.success) return setMessage({ ok: false, text: res.error });
    setPreview(res.data);
  };

  const merge = async () => {
    if (!preview?.ok) return;
    setBusy(true);
    const res = await mergeAgencies(target, [...selected], preview.changeCount);
    setBusy(false);
    setPreview(null);
    if (!res.success) return setMessage({ ok: false, text: res.error });
    setSelected(new Set());
    setMessage({ ok: true, text: `統合しました。物件${res.count}件の取扱会社名を書き換えました（控え番号 ${res.backupId}）。` });
    router.refresh();
  };

  const removeAlias = async (alias: string) => {
    setBusy(true);
    const res = await deleteAgencyAlias(alias);
    setBusy(false);
    if (!res.success) return setMessage({ ok: false, text: res.error });
    setMessage({ ok: true, text: `旧表記「${alias}」の記録を外しました。` });
    router.refresh();
  };

  const row = (c: Company) => (
    <label key={c.name} className="flex items-center gap-3 py-1.5">
      <input type="checkbox" checked={selected.has(c.name)} onChange={() => toggle(c.name)} className="w-4 h-4" />
      <span className="font-bold text-ink">{c.name}</span>
      <span className="text-reno-mute-dark tabular-nums">{c.propertyCount}件</span>
      <Link href={`/admin/agencies/detail?name=${encodeURIComponent(c.name)}`}
        className="text-xs text-teal-hover! underline underline-offset-2">開く</Link>
    </label>
  );

  return (
    <section className="bg-white rounded-2xl border border-reno-line p-6 space-y-5" aria-labelledby="agency-merge">
      <div>
        <h2 id="agency-merge" className="text-lg font-bold text-ink">表記ゆれの統合</h2>
        <p className="text-sm text-reno-mute-dark mt-1">
          選んだ会社の物件を「{target}」に書き換え、選んだ名前は旧表記として残します。
          以後のCSV取込・手動登録で旧表記が来ると、「{target}」に読み替えます。
          別の名前を正式名にしたいときは、その会社の画面で統合してください。
        </p>
      </div>

      <div>
        <h3 className="text-sm font-bold text-reno-mute-dark mb-1">表記ゆれの候補</h3>
        {variants.length > 0 ? <div className="text-sm">{variants.map(row)}</div> : <p className="text-sm text-reno-mute-dark">候補はありません。</p>}
      </div>

      <div>
        <label className="relative block max-w-md">
          <span className="text-sm font-bold text-reno-mute-dark">ほかの会社を名前で探す</span>
          <Search size={16} className="absolute left-3 bottom-2.5 text-reno-mute-dark" />
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="会社名の一部"
            className="mt-1 w-full pl-9 pr-3 py-2 rounded-xl border border-reno-line text-sm outline-none focus:border-teal" />
        </label>
        {searchHits.length > 0 && <div className="text-sm mt-2">{searchHits.map(row)}</div>}
        {[...selected].filter((n) => !variantNames.has(n) && !searchHits.some((h) => h.name === n)).length > 0 && (
          <div className="text-sm mt-2">
            {[...selected].filter((n) => !variantNames.has(n) && !searchHits.some((h) => h.name === n))
              .map((n) => row({ name: n, propertyCount: countOf.get(n) ?? 0 }))}
          </div>
        )}
      </div>

      {message && (
        <p role="status" className={`text-sm font-bold ${message.ok ? "text-teal-hover" : "text-red-800"}`}>{message.text}</p>
      )}

      {preview && !preview.ok && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm space-y-2">
          <p className="font-bold text-red-800">{preview.error}</p>
          <ul className="list-disc pl-5 text-ink">
            {preview.conflicts.map((c) => (
              <li key={c.listingCompanyNo}>
                掲載会社管理番号 {c.listingCompanyNo}：
                {c.properties.map((p, i) => (
                  <span key={p.id}>
                    {i > 0 && "、"}
                    <Link href={`/admin/properties/${p.id}`} className="text-teal-hover! underline">ID {p.id}</Link> {p.label}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview?.ok ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
          <p className="text-sm font-bold text-ink">
            {selected.size}社を「{target}」に統合し、物件{preview.changeCount}件の取扱会社名を書き換えます。書き換え前の値は控えに残します。
          </p>
          <div className="flex gap-2">
            <button onClick={() => void merge()} disabled={busy}
              className="px-4 py-2 rounded-xl bg-ink text-white! text-sm font-bold disabled:opacity-40">統合する</button>
            <button onClick={() => setPreview(null)} disabled={busy}
              className="px-4 py-2 rounded-xl border border-reno-line bg-white text-sm font-bold text-ink">やめる</button>
          </div>
        </div>
      ) : (
        <button onClick={() => void check()} disabled={busy || selected.size === 0}
          className="px-4 py-2 rounded-xl bg-ink text-white! text-sm font-bold disabled:opacity-40">
          統合内容を確認（{selected.size}社）
        </button>
      )}

      <div>
        <h3 className="text-sm font-bold text-reno-mute-dark mb-1">統合した旧表記</h3>
        {aliases.length > 0 ? (
          <ul className="text-sm space-y-1">
            {aliases.map((a) => (
              <li key={a} className="flex items-center gap-2">
                <span className="text-ink">{a}</span>
                <button onClick={() => void removeAlias(a)} disabled={busy} aria-label={`旧表記「${a}」の記録を外す`}
                  className="text-xs text-reno-mute-dark border border-reno-line rounded px-1.5 py-0.5 flex items-center gap-1 hover:bg-reno-bg">
                  <X size={12} /> 記録を外す
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-reno-mute-dark">ありません。</p>
        )}
      </div>
    </section>
  );
}
