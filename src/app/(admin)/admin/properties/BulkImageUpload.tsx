"use client";

import { useEffect, useRef, useState } from "react";
import { Images, X } from "lucide-react";
import {
  uploadImagesByFileName,
  isStorageReady,
  testStorage,
  type ImageUploadResult,
} from "@/app/actions/propertyImages";
import { MAX_FILE_LABEL, MAX_IMAGES_PER_PROPERTY, ALLOWED_EXTENSIONS } from "@/config/images";

/**
 * ファイル名（掲載会社管理番号_連番）で物件に紐づける一括アップロード。
 * 「6991580385_1.jpg」のように物件管理番号を先頭に付けたファイルをまとめて選ぶ。
 * 番号が一致しないファイルは取り込まず、理由を1件ずつ出す（CSV取込と同じ考え方）。
 */
export default function BulkImageUpload() {
  const [open, setOpen] = useState(false);
  // 保管先の設定状況はサーバーにしか分からない。開いたときに1度だけ確認する。
  const [storageReady, setStorageReady] = useState(true);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ImageUploadResult[]>([]);
  const [error, setError] = useState("");
  const [check, setCheck] = useState<{ ok: boolean; message: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    isStorageReady().then((res) => {
      if (res.success) setStorageReady(res.ready);
    });
  }, [open]);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setBusy(true);
    setError("");
    setResults([]);

    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("files", f);

    const res = await uploadImagesByFileName(fd);
    if (res.success) setResults(res.results);
    else setError(res.error);

    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  const okCount = results.filter((r) => r.ok).length;
  const ngCount = results.length - okCount;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-white border border-reno-line px-5 py-2 rounded-xl flex items-center gap-2 font-bold text-ink hover:bg-reno-bg transition-all shadow-sm text-sm"
      >
        <Images size={18} /> 画像を一括アップロード
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-8 space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold text-ink">画像を一括アップロード</h2>
                <p className="text-xs font-bold text-reno-mute-dark mt-1">
                  ファイル名で物件に紐づけます
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-reno-mute-dark hover:text-ink"
                aria-label="閉じる"
              >
                <X size={22} />
              </button>
            </div>

            <div className="bg-teal/5 border border-teal/20 rounded-2xl p-5 text-xs font-bold text-ink space-y-2">
              <p>ファイル名を「掲載会社管理番号_連番.拡張子」にしてください。区切りは「_」です。</p>
              <pre className="bg-white/70 rounded-xl p-3 text-xs leading-relaxed">
{`b01771-004624_1.jpg   → 1枚目
b01771-004624_2.jpg   → 2枚目
b01771-004624.jpg     → 連番を省くと 1枚目`}
              </pre>
              <p>
                {ALLOWED_EXTENSIONS.join(" / ")}・1枚 {MAX_FILE_LABEL} まで・
                1物件 {MAX_IMAGES_PER_PROPERTY} 枚まで。
                同じ連番のファイルを入れると、その枚だけ差し替わります。
              </p>
              <p className="text-ink">
                掲載会社管理番号が見つからない・別の取扱店に同じ番号がある・番号が空の物件には取り込みません。
                理由を下に出します。これらは物件詳細の画面から1件ずつ登録してください。
              </p>
            </div>

            {!storageReady && (
              <p className="text-sm font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-2xl p-4">
                画像の保管先が未設定のため、アップロードできません。
                Vercel の環境変数に SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください。
              </p>
            )}

            {error && (
              <p className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-2xl p-4">
                {error}
              </p>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={async () => {
                  setCheck(null);
                  const r = await testStorage();
                  if (r.success) setCheck({ ok: r.ok, message: r.message });
                  else setError(r.error);
                }}
                className="text-xs font-bold text-ink underline hover:no-underline"
              >
                保管先の接続を確認する
              </button>
              {check && (
                <span
                  className={`text-xs font-bold ${check.ok ? "text-green-700" : "text-red-700"}`}
                >
                  {check.ok ? "✓" : "✕"} {check.message}
                </span>
              )}
            </div>

            <input
              ref={inputRef}
              type="file"
              accept={ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",")}
              multiple
              onChange={handleFiles}
              disabled={busy || !storageReady}
              className="hidden"
              id="bulk-image-input"
            />
            <label
              htmlFor="bulk-image-input"
              className={`block text-center py-8 rounded-2xl border-2 border-dashed font-bold cursor-pointer transition-all ${
                busy || !storageReady
                  ? "border-reno-line text-reno-mute-dark cursor-not-allowed"
                  : "border-teal/30 text-ink hover:bg-teal/5"
              }`}
            >
              {busy ? "アップロード中…" : "クリックしてファイルを選ぶ（複数可）"}
            </label>

            {results.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-bold text-ink">
                  結果：登録 {okCount}件 / 取り込まなかったもの {ngCount}件
                </p>
                <ul className="text-xs font-bold space-y-1 max-h-64 overflow-y-auto">
                  {results.map((r, i) => (
                    <li key={i} className={r.ok ? "text-green-700" : "text-red-700"}>
                      {r.ok ? "✓" : "✕"} {r.fileName}：{r.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
