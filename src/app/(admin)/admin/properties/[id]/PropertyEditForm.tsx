"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { createProperty, updateProperty } from "@/app/actions/properties";
import { PROPERTY_FIELD_GROUPS, type FieldDef } from "@/config/propertyFields";
import { AREAS } from "@/config/property";
import { PROPERTY_TYPE_LABEL } from "@/config/property";
import { DISCLOSURE_LEVEL_LABEL } from "@/config/security";

/** 入力欄の初期値。null と undefined は空文字にする。日付は YYYY-MM-DD にする。 */
function initialValue(value: unknown, type: FieldDef["type"]): string {
  if (value === null || value === undefined) return "";
  if (type === "date") {
    const d = new Date(value as string);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }
  return String(value);
}

const labelClass =
  "text-xs font-bold text-reno-mute-dark block mb-2";
const inputClass =
  "w-full px-4 py-3 rounded-2xl border border-reno-line font-bold text-ink focus:border-teal outline-none transition-all";

/**
 * 物件の編集フォーム。property を渡さないと新規登録になる（2026-10-08 追加）。
 * 新規登録では物件管理番号の入力欄を出し、区分は「選択してください」から選ばせる
 * （既定値のまま気付かずに別のエリアで登録するのを防ぐため）。
 */
export default function PropertyEditForm({
  property,
}: {
  property?: Record<string, unknown>;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const isNew = property === undefined;
  const values = property ?? {};

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const formData = new FormData(e.currentTarget);
    if (isNew) {
      const res = await createProperty(formData);
      if (res.success) {
        // 画像の登録は物件詳細で行うため、登録した物件の画面へ移る
        router.push(`/admin/properties/${res.id}`);
        return;
      }
      setMessage({ ok: false, text: res.error || "登録できませんでした。" });
    } else {
      const res = await updateProperty(Number(values.id), formData);
      setMessage(
        res.success
          ? { ok: true, text: "保存しました。" }
          : { ok: false, text: res.error || "保存できませんでした。" }
      );
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="flex items-center justify-between gap-4 sticky top-16 z-10 bg-reno-bg/90 backdrop-blur py-3">
        <div>
          {message && (
            <p
              className={`text-sm font-bold ${
                message.ok ? "text-green-700" : "text-red-700"
              }`}
            >
              {message.text}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={saving}
          className="bg-ink text-white px-6 py-2 rounded-xl flex items-center gap-2 font-bold hover:bg-teal transition-colors disabled:opacity-50"
        >
          <Save size={18} />
          {saving ? "保存中…" : isNew ? "物件を登録" : "変更を保存"}
        </button>
      </div>

      {/* 区分（取込の検証と同じ選択肢しか選べない） */}
      <section className="bg-white p-8 rounded-2xl shadow-sm border border-reno-line space-y-6">
        <h2 className="text-lg font-bold text-ink border-b border-reno-line pb-4">区分</h2>
        {isNew && (
          <div>
            <label className={labelClass} htmlFor="objMngNo">
              物件管理番号
            </label>
            <input id="objMngNo" name="objMngNo" type="text" inputMode="numeric" className={inputClass} />
            <p className="text-xs font-bold text-reno-mute-dark mt-2">
              athome の物件番号など、数字だけで入力します。空欄なら 90000000001 からの番号を自動で付けます。登録後は変更できません。
            </p>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className={labelClass}>公開レベル</label>
            <select
              name="disclosureLevel"
              defaultValue={String(values.disclosureLevel ?? 0)}
              className={inputClass}
            >
              {Object.entries(DISCLOSURE_LEVEL_LABEL).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>物件種別</label>
            <select name="syubetu" defaultValue={isNew ? "" : String(values.syubetu ?? 2)} required className={inputClass}>
              {isNew && <option value="">選択してください</option>}
              {Object.entries(PROPERTY_TYPE_LABEL).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>エリア</label>
            <select name="cityCd" defaultValue={String(values.cityCd ?? "")} required className={inputClass}>
              {isNew && <option value="">選択してください</option>}
              {AREAS.map((a) => (
                <option key={a.cityCd} value={a.cityCd}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {PROPERTY_FIELD_GROUPS.map((group) => (
        <section
          key={group.title}
          className="bg-white p-8 rounded-2xl shadow-sm border border-reno-line space-y-6"
        >
          <div className="border-b border-reno-line pb-4">
            <h2 className="text-lg font-bold text-ink">{group.title}</h2>
            {group.note && (
              <p className="text-xs font-bold text-reno-mute-dark mt-1">{group.note}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {group.fields.map((field) => (
              <div
                key={field.key}
                className={field.type === "textarea" ? "md:col-span-2" : ""}
              >
                <label className={labelClass}>
                  {field.label}
                  {(field.required || (isNew && field.requiredOnCreate)) && (
                    <span className="text-red-500 ml-1">必須</span>
                  )}
                </label>
                {field.type === "textarea" ? (
                  <textarea
                    name={field.key}
                    rows={3}
                    defaultValue={initialValue(values[field.key], field.type)}
                    className={inputClass}
                  />
                ) : (
                  <div className="relative">
                    <input
                      type={field.type === "date" ? "date" : "text"}
                      name={field.key}
                      defaultValue={initialValue(values[field.key], field.type)}
                      className={`${inputClass} ${field.unit ? "pr-16" : ""}`}
                    />
                    {field.unit && (
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-reno-mute-dark text-sm">
                        {field.unit}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </form>
  );
}
