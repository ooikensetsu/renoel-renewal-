import Link from "next/link";
import SiteImage from "@/components/SiteImage";

const showrooms = [
  {
    name: "仙台中山スタジオ",
    address: "宮城県仙台市青葉区中山吉成1-2-3",
    tel: "0120-000-000",
    hours: "10:00 - 18:00",
    closed: "水曜日、第2・第4火曜日",
    image: "showroomSaku" as const
  },
  {
    name: "仙台宮城野スタジオ",
    address: "宮城県仙台市宮城野区〇〇 2-4-5",
    tel: "0120-111-111",
    hours: "10:00 - 18:00",
    closed: "水曜日",
    image: "showroomMiyota" as const
  },
  {
    name: "福島スタジオ",
    address: "福島県福島市〇〇 1-1-1",
    tel: "0120-222-222",
    hours: "10:00 - 18:00",
    closed: "水曜日",
    image: "showroomTateshina" as const
  }
];

export default function ShowroomPage() {

  return (
    <>
      <div className="pageHead">
        <div className="pageHead__bg">
          <SiteImage name="pageHero" alt="" />
        </div>
        <div className="container container--wide pageHead__inner">
          <span className="pageHead__en">STUDIOS</span>
          <h1 className="pageHead__ttl">店舗・ショールーム案内</h1>
        </div>
      </div>

      <nav className="container container--wide breadcrumb" aria-label="パンくずリスト">
        <ol>
          <li><Link href="/">HOME</Link></li>
          <li aria-current="page">店舗・ショールーム案内</li>
        </ol>
      </nav>

      <section className="sec">
        <div className="container container--wide">
          <div className="shopList">
            {showrooms.map((shop, idx) => (
              <div key={idx} className="shop">
                <div className="shop__thumb">
                  <SiteImage name={shop.image} alt={shop.name} />
                </div>
                <div className="shop__body">
                  <h2 className="shop__ttl">{shop.name}</h2>
                  <p className="shop__addr">
                    {shop.address}<br />
                    営業時間：{shop.hours}<br />
                    定休日：{shop.closed}
                  </p>
                  <p className="shop__tel">{shop.tel}</p>
                  <div style={{ display: "grid", gap: "10px", marginTop: "18px" }}>
                    <button className="btn btn--fill btn--sm btn--block">来店予約はこちら</button>
                    <button className="btn btn--sm btn--block">お問い合わせ</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec sec--gray">
        <div className="container">
          <div className="secTtl">
            <span className="en">COMPANY</span>
            <span className="ja">運営会社情報</span>
          </div>
          
          <table className="specTable">
            <tbody>
              <tr>
                <th>会社名</th>
                <td>株式会社オノヤ</td>
              </tr>
              <tr>
                <th>創業</th>
                <td>1935年</td>
              </tr>
              <tr>
                <th>本社所在地</th>
                <td>福島県須賀川市〇〇</td>
              </tr>
              <tr>
                <th>事業内容</th>
                <td>中古住宅の売買仲介、リノベーション設計・施工、不動産コンサルティング</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
