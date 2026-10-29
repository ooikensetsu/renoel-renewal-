import { ArrowLeft, ExternalLink, Eye, MessageSquare, Clock, Hash } from "lucide-react";
import Link from "next/link";
import { getPropertyForAdmin } from "@/app/actions/properties";
import PropertyEditForm from "./PropertyEditForm";
import PropertyImages from "./PropertyImages";
import PropertyConfirmationPanel from "./PropertyConfirmationPanel";
import DisclosureBadge from "@/components/DisclosureBadge";
import { isStorageConfigured } from "@/lib/storage";

/**
 * 管理画面の物件詳細。
 *
 * 以前このページは仙台の架空物件（「青葉区 中山吉成 5LDK」2,480万円、閲覧1,248件など）を
 * 直書きしており、URLの物件IDを一切見ていなかった。入力欄も defaultValue の直書きで、
 * 「変更を保存」は何にも繋がっていなかった。実データの表示と保存に作り直したもの。
 */
export const dynamic = "force-dynamic";

export default async function PropertyAdminDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await getPropertyForAdmin(Number(id));

  if (!res.success) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Link
          href="/admin/properties"
          className="text-sm font-bold text-reno-mute-dark flex items-center gap-2 hover:text-ink"
        >
          <ArrowLeft size={18} />
          物件一覧へ戻る
        </Link>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-sm font-bold text-red-800">
          {res.error}
        </div>
      </div>
    );
  }

  const p = res.data;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <Link
          href="/admin/properties"
          className="text-sm font-bold text-reno-mute-dark flex items-center gap-2 hover:text-ink transition-colors"
        >
          <ArrowLeft size={18} />
          物件一覧へ戻る
        </Link>
        <Link
          href={`/property/${p.id}`}
          target="_blank"
          className="bg-white border border-reno-line px-6 py-2 rounded-xl flex items-center gap-2 font-bold text-ink hover:bg-reno-bg transition-all shadow-sm"
        >
          <ExternalLink size={18} />
          サイトで確認
        </Link>
      </div>

      <section className="bg-white p-8 rounded-2xl shadow-sm border border-reno-line">
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="bg-teal/5 text-teal text-xs font-bold px-2 py-1 rounded">
            {p.syumoku}
          </span>
          <DisclosureBadge level={p.disclosureLevel} />
          {p.areaName && (
            <span className="bg-reno-bg text-ink text-xs font-bold px-2 py-1 rounded">
              {p.areaName}
            </span>
          )}
        </div>
        <h1 className="text-3xl font-bold text-ink mb-2 leading-tight">{p.title}</h1>
        <p className="text-sm font-bold text-reno-mute-dark flex items-center gap-2">
          <Hash size={14} />
          物件管理番号 {p.objMngNo}
          <span className="text-reno-mute-dark">|</span>
          この番号はCSV取込の突合キーのため、画面からは変更できません
        </p>

        <div className="grid grid-cols-3 gap-4 border-t border-reno-line pt-8 mt-8">
          <div className="text-center">
            <p className="text-xs font-bold text-reno-mute-dark mb-1">
              会員の閲覧数
            </p>
            <div className="flex items-center justify-center gap-2 text-ink">
              <Eye size={16} />
              <span className="text-xl font-bold">{p.stats.memberViews.toLocaleString()}</span>
            </div>
            <p className="text-xs font-bold text-reno-mute-dark mt-1">未ログインの閲覧は含みません</p>
          </div>
          <div className="text-center border-x border-reno-line">
            <p className="text-xs font-bold text-reno-mute-dark mb-1">
              問い合わせ
            </p>
            <div className="flex items-center justify-center gap-2 text-teal">
              <MessageSquare size={16} />
              <span className="text-xl font-bold">{p.stats.inquiries}</span>
            </div>
          </div>
          <div className="text-center">
            <p className="text-xs font-bold text-reno-mute-dark mb-1">
              最終更新
            </p>
            <div className="flex items-center justify-center gap-2 text-ink">
              <Clock size={16} />
              <span className="text-sm font-bold">
                {p.updatedAt.toLocaleString("ja-JP")}
              </span>
            </div>
          </div>
        </div>
      </section>

      <PropertyImages
        propertyId={p.id}
        images={p.images.map((img) => ({
          id: img.id,
          path: img.path,
          sortOrder: img.sortOrder,
        }))}
        storageReady={isStorageConfigured()}
      />

      <PropertyConfirmationPanel propertyId={p.id} history={p.confirmations} />

      {/* key：状況「中止」「済」の記録で公開レベルが変わったとき、フォームの初期値を読み直す。
          付けないと古い公開レベルが入ったままになり、そのまま保存すると非表示が戻ってしまう。
          最新の記録で決める（updatedAt にすると通常の保存でも作り直され、「保存しました。」が消える） */}
      <PropertyEditForm
        key={`confirmation-${p.confirmations[0]?.id ?? "none"}`}
        property={p as unknown as Record<string, unknown>}
      />
    </div>
  );
}
