import { getAgencyList } from "@/app/actions/agencies";
import AgencyListTable from "./AgencyListTable";
import AgencySubNav from "@/components/AgencySubNav";

/**
 * 取扱会社の一覧（2026-10-22）。会社ごとに会社情報と掲載物件を管理し、表記ゆれを1社へ統合する。
 * 会社を選ぶと詳細（/admin/agencies/detail?name=…）へ進む。
 */
export default async function AdminAgenciesPage() {
  const res = await getAgencyList();

  return (
    <div className="space-y-8">
      <AgencySubNav current="list" />
      <div>
        <h1 className="text-2xl font-bold text-ink mb-2">取扱会社</h1>
        <p className="text-sm text-reno-mute-dark">
          会社を選ぶと、会社情報の編集・掲載物件の確認・表記ゆれの統合ができます。
          「表記ゆれ候補」は、会社の種類や空白を除くと同じ名前になる会社がある会社です。
        </p>
      </div>

      {res.success ? (
        <AgencyListTable rows={res.data} />
      ) : (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-sm font-bold text-red-800">
          {res.error}
        </div>
      )}
    </div>
  );
}
