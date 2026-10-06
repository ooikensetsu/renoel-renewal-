"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getTopProperties } from "@/app/actions/properties";
import { areaName } from "@/config/property";
import { calculateMonthlyPayment } from "@/lib/loan";
import {
  DEFAULT_ANNUAL_RATE_PERCENT,
  DEFAULT_LOAN_YEARS,
  DEFAULT_RENOVATION_COST_YEN,
  MAN_YEN,
} from "@/config/loan";

/**
 * トップページの新着物件。
 *
 * 以前はここに架空の物件3件が直書きされていた（佐久市中込 4LDK 1,380万円など）。
 * 実在しない物件を見て問い合わせが来る状態だったため、DBの新着に置き換えた。
 *
 * 月々の目安は src/lib/loan.ts の計算を使う。物件詳細ページと同じ式・同じ前提。
 *
 * 2026-10-13 から、出す物件は管理画面の「トップ掲載」にチェックした物件の全件（更新の新しい順）。
 * それまでは更新の新しい順に3件を自動で出していた（モリシタ版 96464aa の移植）。
 */

type Item = {
  id: number;
  title: string | null;
  syumoku: string;
  madori: string | null;
  priceMan: number | null;
  address: string | null;
  landMen: number | null;
  bldMen: number | null;
  images: string[];
  locked: boolean;
  cityCd?: string;
};

export default function NewArrivals() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getTopProperties().then((res) => {
      if (res.success) {
        setItems(res.data as Item[]);
      } else {
        // D-07：握り潰さない。画面には内部情報を出さず、失敗した事実だけ伝える。
        setItems([]);
        setError(res.error);
      }
    });
  }, []);

  return (
    <section className="sec" id="newarrival">
      <div className="container container--wide">
        <h2 className="secTtl">
          <span className="secTtl__main">新着物件</span>
        </h2>
        <p className="secLead">
          物件価格の下に出ている金額は、リノベーション費用まで含めた月々のお支払い目安です。
        </p>

        {items === null && <p style={{ padding: "24px 0" }}>読み込んでいます…</p>}
        {error && <p style={{ padding: "24px 0" }}>{error}</p>}

        {items !== null && !error && items.length === 0 && (
          <p style={{ padding: "24px 0" }}>現在掲載中の新着物件はありません。</p>
        )}

        {items !== null && items.length > 0 && (
          <div className="propGrid">
            {items.map((p) => {
              if (p.locked) {
                return (
                  <Link key={p.id} className="propCard is-locked" href="/member">
                    <figure className="propCard__fig">
                      <span className="badge badge--member">会員限定</span>
                    </figure>
                    <div className="propCard__body">
                      <h3 className="propCard__ttl">詳細は会員限定</h3>
                      <p className="propCard__note">無料会員登録でご覧いただけます</p>
                    </div>
                  </Link>
                );
              }

              const priceMan = p.priceMan ?? 0;
              const monthly = calculateMonthlyPayment(
                priceMan * MAN_YEN + DEFAULT_RENOVATION_COST_YEN,
                DEFAULT_ANNUAL_RATE_PERCENT,
                DEFAULT_LOAN_YEARS
              );

              return (
                <Link key={p.id} className="propCard" href={`/property/${p.id}`}>
                  <figure className="propCard__fig">
                    {p.images[0] && (
                      // eslint-disable-next-line @next/next/no-img-element -- 外部ストレージ配信のため
                      <img src={p.images[0]} alt={p.title ?? "物件画像"} loading="lazy" />
                    )}
                    <span className="badge badge--new">NEW</span>
                  </figure>
                  <div className="propCard__body">
                    <p className="propCard__cat">
                      {[p.syumoku, p.cityCd ? areaName(p.cityCd) : null]
                        .filter(Boolean)
                        .join("／")}
                    </p>
                    <h3 className="propCard__ttl">{p.title}</h3>
                    <p className="propCard__price">
                      <strong>{priceMan.toLocaleString()}</strong>万円
                    </p>
                    <p className="propCard__loan">
                      リノベ込み月々 <b>{Math.round(monthly).toLocaleString()}</b> 円
                      <br />
                      <small>
                        （物件{priceMan.toLocaleString()}万円＋リノベ
                        {(DEFAULT_RENOVATION_COST_YEN / MAN_YEN).toLocaleString()}万円／金利
                        {DEFAULT_ANNUAL_RATE_PERCENT}%・{DEFAULT_LOAN_YEARS}年）
                      </small>
                    </p>
                    <dl className="propCard__spec">
                      <div>
                        <dt>間取り</dt>
                        <dd>{p.madori ?? "–"}</dd>
                      </div>
                      <div>
                        <dt>土地/建物</dt>
                        <dd>
                          {p.landMen ? `${p.landMen}㎡` : "–"} /{" "}
                          {p.bldMen ? `${p.bldMen}㎡` : "–"}
                        </dd>
                      </div>
                      <div>
                        <dt>所在地</dt>
                        <dd>{p.address ?? "–"}</dd>
                      </div>
                    </dl>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <div className="btnWrap">
          <Link className="btn btn--navy" href="/properties">
            物件一覧をすべて見る
          </Link>
        </div>
      </div>
    </section>
  );
}
