import Link from "next/link";
import { isBlankMark } from "@/lib/blank";
import { getPublicPropertyById } from "@/app/actions/properties";
import { calculateMonthlyPayment } from "@/lib/loan";
import {
  DEFAULT_ANNUAL_RATE_PERCENT,
  DEFAULT_LOAN_YEARS,
  DEFAULT_RENOVATION_COST_YEN,
  MAN_YEN,
} from "@/config/loan";
import { COMPANY } from "@/config/company";
import SignInButton from "@/components/SignInButton";
import PropertyViewLogger from "./PropertyViewLogger";
import SiteImage from "@/components/SiteImage";

/**
 * C-03 / S-07：会員限定物件の秘匿をサーバー側へ移した。
 * 以前は "use client" ＋ モック配列で、未ログインでも価格・所在地がソースから読めていた。
 * いまは getPublicPropertyById() が、鍵つきの場合そもそも中身を返さない。
 */
export const dynamic = "force-dynamic";


export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  const id = parseInt(resolvedParams.id);

  const result = await getPublicPropertyById(id);

  if (!result.success) {
    return (
      <div className="p-20 text-center font-bold text-gray-500">
        物件が見つかりませんでした
      </div>
    );
  }

  const property = result.data;

  // 会員限定 × 未ログイン。ここには価格も所在地も画像も渡ってきていない。
  if (property.locked) {
    return (
      <>
        <div className="pageHead">
          <div className="pageHead__bg">
            <SiteImage name="gallery" alt="" />
          </div>
          <div className="container container--wide pageHead__inner">
            <span className="pageHead__en">MEMBERS ONLY</span>
            <h1 className="pageHead__ttl">会員限定物件</h1>
          </div>
        </div>

        <section className="sec">
          <div className="container" style={{ maxWidth: "600px", textAlign: "center" }}>
            <h2 className="text-2xl font-black text-blue-900 mb-4">この物件は会員限定公開です</h2>
            <p className="leadTxt">
              詳細な写真、所在地、周辺環境などを確認するには無料会員登録またはログインが必要です。
            </p>
            <div className="btnWrap" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <SignInButton className="btn btn--fill btn--lg" style={{ width: "100%" }}>
                ログインして詳細を見る
              </SignInButton>
              <Link href="/member" className="btn btn--pink btn--lg">無料会員登録はこちら</Link>
            </div>
          </div>
        </section>
      </>
    );
  }

  const priceMan = property.priceMan ?? 0;

  // 物件概要の追加行。値が入っている項目だけを、athome の表示順に近い並びで出す。
  // 取扱店（会社名・免許番号など）は宅建業法の表示の扱いが未決定のため、まだ出さない。
  const specRows = (
    [
      ["交通", property.trafficNote],
      ["階建/階", property.floorsInfo],
      ["駐車場", property.parking],
      ["土地権利", property.landRight],
      ["現況", property.currentState],
      ["引渡可能時期", property.deliveryTiming],
      ["取引態様", property.transactionType],
      ["借地期間・地代", property.leaseTermRent],
      ["権利金", property.keyMoney],
      ["敷金・保証金", property.depositGuarantee],
      ["維持費等", property.maintenanceCost],
      ["その他一時金", property.otherLumpSum],
      ["管理費", property.mgmtFeeYen ? `${property.mgmtFeeYen.toLocaleString()}円/月` : null],
      ["修繕積立金", property.repairFundYen ? `${property.repairFundYen.toLocaleString()}円/月` : null],
      ["総戸数", property.totalUnits ? `${property.totalUnits}戸` : null],
      ["所在階", property.floorNo ? `${property.floorNo}階` : null],
      ["向き", property.direction],
      ["バルコニー面積", property.balconyMen ? `${property.balconyMen}m²` : null],
      ["管理形態", property.mgmtForm],
      ["建ぺい率", property.buildingCoverage ? `${property.buildingCoverage}%` : null],
      ["容積率", property.floorAreaRatio ? `${property.floorAreaRatio}%` : null],
      ["用途地域", property.zoning],
      ["地目", property.landCategory],
      ["都市計画", property.cityPlanning],
      ["接道状況", property.roadAccess],
      ["私道負担", property.privateRoad],
      ["掲載会社管理番号", property.listingCompanyNo],
      [
        "情報公開日",
        property.publishedOn ? property.publishedOn.toLocaleDateString("ja-JP") : null,
      ],
      [
        "次回更新予定日",
        property.nextUpdateOn ? property.nextUpdateOn.toLocaleDateString("ja-JP") : null,
      ],
    ] as [string, string | null | undefined][]
  )
    // 取込より前に入った「－ / －」のような値も出さない。判定は src/lib/blank.ts に集約。
    .filter(([, value]) => !isBlankMark(value))
    .map(([label, value]) => ({ label, value: value as string }));

  // 取扱店。宅建業法の広告表示に関わる項目のため、値が入っていれば必ず出す。
  const agencyRows = (
    [
      ["会社名", property.agencyName],
      ["所在地", property.agencyAddress],
      ["電話番号", property.agencyTel],
      ["免許番号", property.agencyLicense],
    ] as [string, string | null | undefined][]
  )
    .filter(([, value]) => !isBlankMark(value))
    .map(([label, value]) => ({ label, value: value as string }));
  const totalLoanAmountYen = priceMan * MAN_YEN + DEFAULT_RENOVATION_COST_YEN;
  const monthlyPayment = calculateMonthlyPayment(
    totalLoanAmountYen,
    DEFAULT_ANNUAL_RATE_PERCENT,
    DEFAULT_LOAN_YEARS
  );
  // 物件画像が1枚も登録されていない場合は、代わりの写真を当てない。
  // 以前は第三者のGitHub Pages上の gallery.jpg を代替に使っていたが、
  // その物件の写真ではないうえ、配信元が消滅している（config/siteImages.ts）。
  const mainImage = property.images[0] ?? null;

  return (
    <>
      <PropertyViewLogger propertyId={property.id} />

      <nav className="container container--wide breadcrumb mt-8" aria-label="パンくずリスト">
        <ol>
          <li><Link href="/">HOME</Link></li>
          <li><Link href="/properties">物件一覧</Link></li>
          <li aria-current="page">{property.title}</li>
        </ol>
      </nav>

      <section className="sec" style={{ paddingTop: "20px" }}>
        <div className="container container--wide detailHead">
          {/* 左側：ギャラリー＆物件情報 */}
          <div>
            <div style={{ marginBottom: "24px" }}>
              <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                <span className="label label--member">{property.syumoku}</span>
                {property.isMemberOnly && <span className="label label--new">会員限定</span>}
              </div>
              <h1 style={{ fontSize: "2.4rem", lineHeight: "1.4", fontWeight: "bold" }}>{property.title}</h1>
            </div>

            <div className="gallery">
              <div className="gallery__main">
                {mainImage ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 署名付きURLのため next/image は使わない
                  <img src={mainImage} alt={property.title ?? "物件画像"} />
                ) : (
                  <div className="siteImage--empty" role="img" aria-label="この物件の画像は準備中です" />
                )}
              </div>
              {property.images.length > 1 && (
                <div className="gallery__thumbs">
                  {property.images.slice(0, 4).map((src, i) => (
                    <button key={src} aria-current={i === 0 ? "true" : undefined}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- 物件画像は外部CMS配信 */}
                      <img src={src} alt="" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginTop: "48px" }}>
              <h2 className="secTtl secTtl--left">
                <span className="ja" style={{ fontSize: "2rem", color: "var(--c-ink)" }}>物件概要</span>
              </h2>
              <table className="specTable">
                <tbody>
                  <tr>
                    <th>所在地</th>
                    <td>{property.address}</td>
                  </tr>
                  <tr>
                    <th>間取り</th>
                    <td>{property.madori}</td>
                  </tr>
                  <tr>
                    <th>土地面積 / 建物面積</th>
                    <td>
                      {property.landMen ? `${property.landMen}m²` : "–"} /{" "}
                      {property.bldMen ? `${property.bldMen}m²` : "–"}
                    </td>
                  </tr>
                  <tr>
                    <th>構造</th>
                    <td>{property.bldStructure || "–"}</td>
                  </tr>
                  <tr>
                    <th>築年月</th>
                    <td>
                      {property.bldY ? `${property.bldY}年${property.bldM ?? ""}月` : "–"}
                    </td>
                  </tr>
                  {/* 値が入っている項目だけ出す。空の行を並べても読みにくくなるだけのため。 */}
                  {specRows.map((row) => (
                    <tr key={row.label}>
                      <th>{row.label}</th>
                      <td>{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {agencyRows.length > 0 && (
                <div style={{ marginTop: "32px" }}>
                  <h3
                    className="ja"
                    style={{ fontSize: "1.25rem", color: "var(--c-ink)", marginBottom: "12px" }}
                  >
                    取扱店
                  </h3>
                  <table className="specTable">
                    <tbody>
                      {agencyRows.map((row) => (
                        <tr key={row.label}>
                          <th>{row.label}</th>
                          <td>{row.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* 右側：価格・ローン・CTA */}
          <aside className="detailSide">
            <p className="detailSide__price">
              <span className="val">{priceMan.toLocaleString()}</span>
              <span className="unit">万円</span>
            </p>

            <div className="detailSide__loan">
              リノベ込み月々 <strong className="num">{Math.round(monthlyPayment).toLocaleString()}</strong> 円<br />
              <span style={{ fontSize: "1.1rem", color: "var(--c-mute-dark)" }}>
                （物件{priceMan.toLocaleString()}万円＋リノベ
                {(DEFAULT_RENOVATION_COST_YEN / MAN_YEN).toLocaleString()}万円／金利
                {DEFAULT_ANNUAL_RATE_PERCENT}%・{DEFAULT_LOAN_YEARS}年）
              </span>
            </div>

            <div className="detailSide__btns">
              <Link href={`/property/${property.id}/contact`} className="btn btn--fill btn--block">見学予約・お問い合わせ</Link>
            </div>

            <div className="detailSide__tel">
              <small>お電話でのお問い合わせ</small>
              <a className="num gothic" href={COMPANY.telLink}>{COMPANY.tel}</a>
              <small>営業時間：{COMPANY.businessHours}</small>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
