"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, UserPlus } from "lucide-react";
import { createUserByAdmin } from "@/app/actions/users";
import { MIN_PASSWORD_LENGTH } from "@/lib/memberInput";

/**
 * 会員の手動登録（2026-10-08 大野の指示）。
 * パスワードは管理者が決めて本人に伝える。登録完了メールは送らない。
 */

const labelClass = "text-xs font-bold text-reno-mute-dark block mb-2";
const inputClass =
  "w-full px-4 py-3 rounded-2xl border border-reno-line font-bold text-ink focus:border-teal outline-none transition-all";

const FIELDS = [
  { name: "name", label: "氏名", type: "text", autoComplete: "off" },
  { name: "email", label: "メールアドレス", type: "email", autoComplete: "off", required: true },
  { name: "tel", label: "電話番号", type: "tel", autoComplete: "off" },
  { name: "zip", label: "郵便番号", type: "text", autoComplete: "off" },
  { name: "address", label: "住所", type: "text", autoComplete: "off" },
  { name: "password", label: "パスワード", type: "password", autoComplete: "new-password", required: true },
  { name: "passwordConfirm", label: "パスワード（確認）", type: "password", autoComplete: "new-password", required: true },
] as const;

export default function UserCreatePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setErrorMessage("");
    const res = await createUserByAdmin(new FormData(e.currentTarget));
    if (res.success) {
      router.push(`/admin/users/${res.id}`);
      return;
    }
    setErrorMessage(res.error ?? "会員を登録できませんでした。");
    setSaving(false);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link
        href="/admin/users"
        className="text-sm font-bold text-reno-mute-dark flex items-center gap-2 hover:text-teal"
      >
        <ArrowLeft size={18} />
        会員一覧へ戻る
      </Link>
      <div>
        <h1 className="text-2xl font-mincho font-bold text-ink mb-2">会員を登録</h1>
        <p className="text-sm text-reno-mute-dark">
          電話や来店のお客様を、管理者が代わりに登録します。登録完了メールは送りません。
          パスワードは本人に直接お伝えください。
        </p>
      </div>

      {errorMessage && (
        <p
          role="alert"
          className="bg-red-50 border border-red-200 text-red-800 rounded-2xl px-6 py-4 text-sm font-bold"
        >
          {errorMessage}
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-white p-8 rounded-2xl shadow-sm border border-reno-line space-y-6"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {FIELDS.map((f) => (
            <div key={f.name} className={f.name === "address" ? "md:col-span-2" : ""}>
              <label htmlFor={f.name} className={labelClass}>
                {f.label}
                {"required" in f && <span className="text-red-500 ml-1">必須</span>}
              </label>
              <input
                id={f.name}
                name={f.name}
                type={f.type}
                autoComplete={f.autoComplete}
                required={"required" in f}
                minLength={f.type === "password" ? MIN_PASSWORD_LENGTH : undefined}
                className={inputClass}
              />
            </div>
          ))}
        </div>
        <p className="text-xs font-bold text-reno-mute-dark">
          パスワードは{MIN_PASSWORD_LENGTH}文字以上。会員は自分でパスワードを変更できないため、推測されにくいものにしてください。
        </p>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="bg-ink text-white px-6 py-3 rounded-xl flex items-center gap-2 font-bold hover:bg-teal transition-colors disabled:opacity-50"
          >
            <UserPlus size={18} />
            {saving ? "登録中…" : "会員を登録"}
          </button>
        </div>
      </form>
    </div>
  );
}
