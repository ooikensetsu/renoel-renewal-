import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";
import { getAgencyDetail } from "@/app/actions/agencies";
import AgencyInfoForm from "./AgencyInfoForm";
import AgencyMergePanel from "./AgencyMergePanel";
import AgencyProperties from "./AgencyProperties";

/**
 * 取扱会社の詳細（2026-10-22）。会社情報の編集・表記ゆれの統合・掲載物件の一覧。
 * 会社名に「/」などが入るため、パスではなく ?name= で受け取る。
 */
export const dynamic = "force-dynamic";

export default async function AgencyDetailPage({ searchParams }: { searchParams: Promise<{ name?: string }> }) {
  const { name } = await searchParams;
  const res = await getAgencyDetail(name ?? "");

  const back = (
    <Link href="/admin/agencies" className="text-sm font-bold text-reno-mute-dark flex items-center gap-2 hover:text-ink">
      <ArrowLeft size={18} />
      取扱会社の一覧へ戻る
    </Link>
  );
  if (!res.success) {
    return (
      <div className="max-w-3xl space-y-6">
        {back}
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-sm font-bold text-red-800">{res.error}</div>
      </div>
    );
  }
  const agency = res.data;

  return (
    <div className="space-y-8">
      {back}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink mb-1">{agency.name}</h1>
          <p className="text-sm text-reno-mute-dark">
            掲載物件 {agency.properties.length}件・会社情報{agency.registered ? "登録済み" : "未登録"}
          </p>
        </div>
        <Link
          href={`/admin/properties?agency=${encodeURIComponent(agency.name)}`}
          className="px-4 py-2 rounded-xl border border-reno-line bg-white text-sm font-bold text-ink hover:bg-reno-bg flex items-center gap-2"
        >
          <Building2 size={16} />
          物件管理でこの会社に絞り込む
        </Link>
      </div>

      <AgencyInfoForm agency={agency} />
      <AgencyMergePanel
        target={agency.name}
        variants={agency.variants}
        others={agency.others}
        aliases={agency.aliases}
      />
      <AgencyProperties properties={agency.properties} />
    </div>
  );
}
