"use client";

import { useState } from "react";
import Link from "next/link";
import AdminPager from "@/components/AdminPager";
import DisclosureBadge from "@/components/DisclosureBadge";
import { paginate, ADMIN_DEFAULT_PER_PAGE } from "@/lib/pagination";
import { PROPERTY_TYPE_LABEL } from "@/config/property";

type Row = {
  id: number;
  objMngNo: string;
  listingCompanyNo: string | null;
  title: string;
  syubetu: number;
  priceMan: number;
  disclosureLevel: number;
};

/** この会社の掲載物件。行から物件の編集画面へ進む。 */
export default function AgencyProperties({ properties }: { properties: Row[] }) {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(ADMIN_DEFAULT_PER_PAGE);
  const pager = paginate(properties.length, String(page), perPage);

  return (
    <section className="bg-white rounded-2xl border border-reno-line overflow-hidden" aria-labelledby="agency-properties">
      <h2 id="agency-properties" className="text-lg font-bold text-ink p-6 pb-2">掲載物件（{properties.length}件）</h2>
      {properties.length === 0 ? (
        <p className="px-6 pb-6 text-sm text-reno-mute-dark">この会社の物件はありません。</p>
      ) : (
        <>
          <AdminPager pager={pager} total={properties.length} perPage={perPage} unit="件"
            onPageChange={setPage} onPerPageChange={(n) => { setPerPage(n); setPage(1); }} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-reno-bg text-left text-reno-mute-dark">
                <tr>
                  <th className="px-4 py-3 font-bold whitespace-nowrap">物件管理番号</th>
                  <th className="px-4 py-3 font-bold whitespace-nowrap">掲載会社管理番号</th>
                  <th className="px-4 py-3 font-bold">物件名</th>
                  <th className="px-4 py-3 font-bold whitespace-nowrap">種別</th>
                  <th className="px-4 py-3 font-bold text-right whitespace-nowrap">価格</th>
                  <th className="px-4 py-3 font-bold whitespace-nowrap">公開状態</th>
                </tr>
              </thead>
              <tbody>
                {properties.slice(pager.start, pager.end).map((p) => (
                  <tr key={p.id} className="border-t border-reno-line">
                    <td className="px-4 py-2 tabular-nums whitespace-nowrap">{p.objMngNo}</td>
                    <td className="px-4 py-2 tabular-nums whitespace-nowrap">{p.listingCompanyNo ?? "—"}</td>
                    <td className="px-4 py-2">
                      <Link href={`/admin/properties/${p.id}`} className="font-bold text-teal-hover! underline underline-offset-2 hover:no-underline">
                        {p.title}
                      </Link>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{PROPERTY_TYPE_LABEL[p.syubetu] ?? p.syubetu}</td>
                    <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">{p.priceMan.toLocaleString()}万円</td>
                    <td className="px-4 py-2"><DisclosureBadge level={p.disclosureLevel} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
