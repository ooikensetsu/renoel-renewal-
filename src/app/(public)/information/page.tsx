import Link from "next/link";
import SiteImage from "@/components/SiteImage";

const newsItems = [
  { id: 1, date: "2026.07.28", category: "イベント", title: "【仙台】中古住宅×リノベーション相談会を開催します" },
  { id: 2, date: "2026.07.25", category: "お知らせ", title: "夏季休業期間中の営業に関するお知らせ" },
  { id: 3, date: "2026.07.20", category: "重要", title: "物件情報更新システムメンテナンスのお知らせ" },
  { id: 4, date: "2026.07.15", category: "施工事例", title: "新着施工事例を公開しました（仙台市太白区 T様邸）" },
  { id: 5, date: "2026.07.10", category: "メディア", title: "地元情報誌「〇〇」に掲載されました" },
];

export default function InformationPage() {

  return (
    <>
      <div className="pageHead">
        <div className="pageHead__bg">
          <SiteImage name="pageHero" alt="" />
        </div>
        <div className="container container--wide pageHead__inner">
          <span className="pageHead__en">INFORMATION</span>
          <h1 className="pageHead__ttl">お知らせ</h1>
        </div>
      </div>

      <nav className="container container--wide breadcrumb" aria-label="パンくずリスト">
        <ol>
          <li><Link href="/">HOME</Link></li>
          <li aria-current="page">お知らせ</li>
        </ol>
      </nav>

      <section className="sec">
        <div className="container" style={{ maxWidth: "800px" }}>
          <div className="listBar">
            <div className="listBar__hit">
              お知らせ一覧
            </div>
            <div className="listBar__sort selectWrap">
              <select aria-label="カテゴリ">
                <option>すべてのカテゴリ</option>
                <option>お知らせ</option>
                <option>イベント</option>
                <option>施工事例</option>
                <option>重要</option>
              </select>
            </div>
          </div>

          <div className="postList">
            {newsItems.map((item) => (
              <Link href={`/information/${item.id}`} key={item.id}>
                <time>{item.date}<span className="cat">{item.category}</span></time>
                <span className="ttl">{item.title}</span>
              </Link>
            ))}
          </div>

          <nav className="pager" aria-label="ページ送り">
            <span className="is-current" aria-current="page">1</span>
            <Link href="#">2</Link>
            <Link href="#">3</Link>
            <Link href="#">›</Link>
          </nav>
        </div>
      </section>
    </>
  );
}
