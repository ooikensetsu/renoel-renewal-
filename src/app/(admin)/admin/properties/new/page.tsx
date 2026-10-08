import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import PropertyEditForm from "../[id]/PropertyEditForm";

/**
 * 物件の手動登録（2026-10-08 大野の指示）。
 * 入力項目と検証は編集画面と同じ（PropertyEditForm / readPropertyForm）。
 * 画像は登録後の物件詳細でアップロードする。
 */
export default function PropertyCreatePage() {
  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <Link
        href="/admin/properties"
        className="text-sm font-bold text-reno-mute-dark flex items-center gap-2 hover:text-ink transition-colors"
      >
        <ArrowLeft size={18} />
        物件一覧へ戻る
      </Link>
      <div>
        <h1 className="text-2xl font-mincho font-bold text-ink mb-2">物件を登録</h1>
        <p className="text-sm text-reno-mute-dark">
          1件ずつ手で登録します。画像は登録後に表示される物件の画面から追加してください。
        </p>
      </div>
      <PropertyEditForm />
    </div>
  );
}
