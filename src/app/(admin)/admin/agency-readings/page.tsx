import { getAgencyReadings } from "@/app/actions/agencyReadings";
import AgencyReadingTable from "./AgencyReadingTable";

/**
 * 取扱会社名の読みの登録（2026-10-19）。
 * 物件確認依頼書（物件管理の「確認依頼書」）は、ここで登録した読みの50音順に並ぶ。
 */
export default async function AdminAgencyReadingsPage() {
  const res = await getAgencyReadings();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-ink mb-2">取扱会社の読み</h1>
        <p className="text-sm text-reno-mute-dark">
          物件確認依頼書は、ここで登録した読みの50音順に並びます。読みが未登録の会社は最後に回ります。
          「(株)」「株式会社」などは読みに含めません。
          「推定」は辞書で自動推定した読みです。誤りがあれば直して保存してください。
        </p>
      </div>

      {res.success ? (
        <AgencyReadingTable initialRows={res.data} />
      ) : (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-sm font-bold text-red-800">
          {res.error}
        </div>
      )}
    </div>
  );
}
