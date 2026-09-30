import Link from "next/link";
import { getPublicProperties } from "@/app/actions/properties";
import { AREAS, areaName, isSupportedArea } from "@/config/property";
import { siteImage } from "@/config/siteImages";

/**
 * C-03 / S-07：会員限定物件の出し分けをサーバー側に移した。
 *
 * 以前はこのファイルが "use client" で、非公開物件を含む全データを
 * ソース中の配列に持っていた。「価格非公開」と表示していても、
 * 開発者ツールやページソースから価格・所在地がそのまま読めていた。
 * いまは getPublicProperties() が、未ログインには秘匿項目を含まないデータだけを返す。
 */
export const dynamic = "force-dynamic";

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string }>;
}) {
  const { city } = await searchParams;
  // 掲載対象のエリアでなければ絞り込まない（不正なコードで空一覧にしない）
  const selectedArea = city && isSupportedArea(city) ? areaName(city) : null;
  const result = await getPublicProperties(selectedArea ? city : undefined);
  const galleryImage = siteImage("gallery");

  return (
    <>
      <section className="memberHero" style={{ minHeight: "200px" }}>
        {/* 帯の背景写真。config/siteImages.ts の gallery が未設定なら無地の枠になる。 */}
        <div
          className="memberHero__photo"
          style={galleryImage ? { backgroundImage: `url('${galleryImage}')` } : undefined}
        ></div>
        <div className="memberHero__panel" style={{ width: "100%", borderRadius: 0, paddingLeft: "5%", minHeight: "200px" }}>
          <div className="memberHero__inner">
            <h1 className="memberHero__ttl">
              {selectedArea ? `${selectedArea}の物件` : "物件一覧"}
            </h1>
          </div>
        </div>
      </section>

      <section className="sec sec--gray">
        <div className="container container--wide">
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              justifyContent: "center",
              marginBottom: "32px",
            }}
          >
            <Link
              href="/properties"
              className={selectedArea ? "btn btn--light" : "btn btn--navy"}
              style={{ minWidth: 0, padding: "8px 18px", fontSize: "13px" }}
            >
              すべて
            </Link>
            {AREAS.map((a) => (
              <Link
                key={a.cityCd}
                href={`/properties?city=${a.cityCd}`}
                className={city === a.cityCd ? "btn btn--navy" : "btn btn--light"}
                style={{ minWidth: 0, padding: "8px 18px", fontSize: "13px" }}
              >
                {a.name}
              </Link>
            ))}
          </div>

          {!result.success ? (
            <p style={{ textAlign: "center", padding: "40px 0" }}>{result.error}</p>
          ) : result.data.length === 0 ? (
            <p style={{ textAlign: "center", padding: "40px 0" }}>
              {selectedArea
                ? `${selectedArea}に現在公開中の物件はありません。`
                : "現在公開中の物件はありません。"}
            </p>
          ) : (
            <div className="propGrid">
              {result.data.map((property) => {
                // 鍵つき（会員限定 × 未ログイン）。この分岐に入るとき、
                // property には価格も所在地も画像も入っていない。
                if (property.locked) {
                  return (
                    <Link key={property.id} className="propCard is-locked" href="/member">
                      <figure className="propCard__fig">
                        <span className="badge badge--member">会員限定</span>
                        <span className="propCard__mask"><span>会員限定公開</span></span>
                      </figure>
                      <div className="propCard__body">
                        <p className="propCard__cat">{property.syumoku}／非公開</p>
                        <h3 className="propCard__ttl">詳細は会員限定</h3>
                        <p className="propCard__price"><strong>価格非公開</strong></p>
                        <dl className="propCard__spec">
                          <div><dt>所在地</dt><dd>–</dd></div>
                          <div><dt>間取り</dt><dd>–</dd></div>
                          <div><dt>土地/建物</dt><dd>–</dd></div>
                          <div><dt>築年月</dt><dd>–</dd></div>
                        </dl>
                        <p className="propCard__note">
                          この物件は無料会員限定で公開しています。所在地・写真・図面は会員登録後にご覧いただけます。
                        </p>
                      </div>
                    </Link>
                  );
                }

                return (
                  <Link key={property.id} className="propCard" href={`/property/${property.id}`}>
                    <figure className="propCard__fig">
                      {property.images[0] && (
                        // eslint-disable-next-line @next/next/no-img-element -- 物件画像は外部CMS配信のため next/image の最適化対象外
                        <img src={property.images[0]} alt={property.title ?? "物件画像"} />
                      )}
                      {property.isMemberOnly && <span className="badge badge--member">会員限定</span>}
                    </figure>
                    <div className="propCard__body">
                      <p className="propCard__cat">{property.syumoku}／{property.address}</p>
                      <h3 className="propCard__ttl">{property.title}</h3>
                      <p className="propCard__price">
                        <strong>{property.priceMan?.toLocaleString()}</strong>万円
                      </p>
                      <dl className="propCard__spec">
                        <div><dt>所在地</dt><dd>{property.address}</dd></div>
                        <div><dt>間取り</dt><dd>{property.madori}</dd></div>
                      </dl>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
