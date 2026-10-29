"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { previewAgencySave, saveAgency, type AgencyForm } from "@/app/actions/agencies";
import { saveAgencyReading } from "@/app/actions/agencyReadings";
import type { FieldVariants } from "@/lib/agencyMaster";

type AgencyDetail = {
  name: string;
  registered: boolean;
  agency: (Record<keyof AgencyForm, string | null> & { name: string }) | null;
  reading: string | null;
  readingEstimated: boolean;
  fieldVariants: Record<"address" | "tel" | "license", FieldVariants>;
};

const FIELDS: { key: keyof AgencyForm; label: string; toProperties?: boolean; multiline?: boolean }[] = [
  { key: "address", label: "所在地", toProperties: true },
  { key: "tel", label: "電話番号", toProperties: true },
  { key: "fax", label: "FAX番号" },
  { key: "license", label: "宅建業の免許番号", toProperties: true },
  { key: "contactName", label: "担当者名" },
  { key: "contactEmail", label: "担当者メール" },
  { key: "memo", label: "メモ（社内向け）", multiline: true },
];

/**
 * 入力欄の初期値。台帳で空の項目（所在地・電話・免許番号）は、物件に一番多く入っている値を出す。
 * FAXだけを一括で入れた会社（scripts/import-agency-fax.mjs）でも、ほかの項目が空欄で表示されないようにするため。
 */
function initialForm(detail: AgencyDetail): AgencyForm {
  const form = {} as AgencyForm;
  for (const f of FIELDS) {
    const fromAgency = detail.agency?.[f.key] ?? null;
    const fromProperties =
      f.key === "address" || f.key === "tel" || f.key === "license" ? detail.fieldVariants[f.key][0]?.value : undefined;
    form[f.key] = fromAgency ?? fromProperties ?? "";
  }
  return form;
}

/** 会社情報の編集。保存すると、その会社の物件の所在地・電話・免許番号にも書き込む（件数を確認してから）。 */
export default function AgencyInfoForm({ agency }: { agency: AgencyDetail }) {
  const router = useRouter();
  const [form, setForm] = useState<AgencyForm>(() => initialForm(agency));
  const [reading, setReading] = useState(agency.reading ?? "");
  const [pending, setPending] = useState<{ changeCount: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const check = async () => {
    setBusy(true);
    setMessage(null);
    const res = await previewAgencySave(agency.name, form);
    setBusy(false);
    if (!res.success) return setMessage({ ok: false, text: res.error });
    setPending({ changeCount: res.data.changeCount });
  };

  const save = async () => {
    if (!pending) return;
    setBusy(true);
    const readingChanged = reading.trim() !== (agency.reading ?? "");
    const readingRes = readingChanged ? await saveAgencyReading(agency.name, reading) : null;
    if (readingRes && !readingRes.success) {
      setBusy(false);
      return setMessage({ ok: false, text: readingRes.error });
    }
    const res = await saveAgency(agency.name, form, pending.changeCount);
    setBusy(false);
    setPending(null);
    if (!res.success) return setMessage({ ok: false, text: res.error });
    setMessage({
      ok: true,
      text:
        res.count > 0
          ? `会社情報を保存し、物件${res.count}件に反映しました（控え番号 ${res.backupId}）。`
          : "会社情報を保存しました。書き換えた物件はありません。",
    });
    router.refresh();
  };

  return (
    <section className="bg-white rounded-2xl border border-reno-line p-6 space-y-5" aria-labelledby="agency-info">
      <div>
        <h2 id="agency-info" className="text-lg font-bold text-ink">会社情報</h2>
        <p className="text-sm text-reno-mute-dark mt-1">
          「物件にも反映」の3項目は、保存するとこの会社の全物件に書き込みます。空欄の項目は物件側を消しません。
          {" 台帳で空の所在地・電話・免許番号には、物件に一番多く入っている値を初期値として表示しています。"}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="block">
          <span className="text-sm font-bold text-reno-mute-dark">読み（ひらがな・会社の種類は含めない）</span>
          <input
            value={reading}
            onChange={(e) => { setReading(e.target.value); setPending(null); }}
            placeholder="未登録"
            className="mt-1 w-full px-3 py-2 rounded-lg border border-reno-line outline-none focus:border-teal"
          />
          {agency.readingEstimated && reading === agency.reading && (
            <span className="text-xs font-bold text-amber-800">辞書で推定した読みです。保存すると確定します。</span>
          )}
        </label>
        {FIELDS.map((f) => {
          const variants = f.key === "address" || f.key === "tel" || f.key === "license" ? agency.fieldVariants[f.key] : [];
          return (
            <label key={f.key} className={`block ${f.multiline ? "lg:col-span-2" : ""}`}>
              <span className="text-sm font-bold text-reno-mute-dark">
                {f.label}
                {f.toProperties && <span className="ml-2 text-xs text-ink bg-reno-bg px-2 py-0.5 rounded-full">物件にも反映</span>}
              </span>
              {f.multiline ? (
                <textarea
                  value={form[f.key]}
                  onChange={(e) => { setForm({ ...form, [f.key]: e.target.value }); setPending(null); }}
                  rows={3}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-reno-line outline-none focus:border-teal"
                />
              ) : (
                <input
                  value={form[f.key]}
                  type={f.key === "contactEmail" ? "email" : "text"}
                  onChange={(e) => { setForm({ ...form, [f.key]: e.target.value }); setPending(null); }}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-reno-line outline-none focus:border-teal"
                />
              )}
              {variants.length > 1 && (
                <span className="block mt-1 text-xs text-amber-800">
                  物件ごとに値が違います：{variants.map((v) => `${v.value}（${v.count}件）`).join(" / ")}
                </span>
              )}
            </label>
          );
        })}
      </div>

      {message && (
        <p role="status" className={`text-sm font-bold ${message.ok ? "text-teal-hover" : "text-red-800"}`}>
          {message.text}
        </p>
      )}

      {pending ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
          <p className="text-sm font-bold text-ink">
            {pending.changeCount > 0
              ? `この会社の物件${pending.changeCount}件の所在地・電話・免許番号を書き換えます。書き換え前の値は控えに残します。`
              : "書き換える物件はありません。会社情報だけを保存します。"}
          </p>
          <div className="flex gap-2">
            <button onClick={() => void save()} disabled={busy}
              className="px-4 py-2 rounded-xl bg-ink text-white! text-sm font-bold disabled:opacity-40 flex items-center gap-1">
              <Check size={16} /> 保存する
            </button>
            <button onClick={() => setPending(null)} disabled={busy}
              className="px-4 py-2 rounded-xl border border-reno-line bg-white text-sm font-bold text-ink">
              やめる
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => void check()} disabled={busy}
          className="px-4 py-2 rounded-xl bg-ink text-white! text-sm font-bold disabled:opacity-40">
          保存内容を確認
        </button>
      )}
    </section>
  );
}
