import Link from "next/link";
import SiteImage from "@/components/SiteImage";

const testimonials = [
  {
    id: 1,
    name: "仙台市太白区 T様",
    family: "夫婦+子供1人",
    type: "中古戸建てリノベ",
    title: "「中古を買ってリノベ」という選択が正解でした。",
    content: "新築も検討していましたが、自分たちの好きなエリアで理想の広さを確保するには中古リノベが最適でした。間取りも自由に変更でき、新築以上の満足度です。",
    image: "case1" as const
  },
  {
    id: 2,
    name: "仙台市泉区 S様",
    family: "夫婦",
    type: "マンションリノベ",
    title: "築30年のマンションが、最新のホテルのような空間に。",
    content: "古い物件特有の配管や断熱の不安も、担当の方が技術的に詳しく説明してくれたので払拭されました。デザインだけでなく住み心地も最高です。",
    image: "case2" as const
  },
  {
    id: 3,
    name: "郡山市 K様",
    family: "夫婦+子供2人",
    type: "中古戸建てリノベ",
    title: "子供の学区を変えずに、理想のマイホームを叶えられました。",
    content: "学区内で探すと新築は手が届かない価格でしたが、365リノベさんなら予算内で土地も建物もリフォームも全て収まり、夢を諦めずに済みました。",
    image: "case3" as const
  }
];

export default function VoicePage() {

  return (
    <>
      <div className="pageHead">
        <div className="pageHead__bg">
          <SiteImage name="pageHero" alt="" />
        </div>
        <div className="container container--wide pageHead__inner">
          <span className="pageHead__en">CUSTOMER VOICE</span>
          <h1 className="pageHead__ttl">お客様の声</h1>
        </div>
      </div>

      <nav className="container container--wide breadcrumb" aria-label="パンくずリスト">
        <ol>
          <li><Link href="/">HOME</Link></li>
          <li aria-current="page">お客様の声</li>
        </ol>
      </nav>

      <section className="sec">
        <div className="container container--wide">
          <div className="cardGrid cardGrid--2">
            {testimonials.map((voice) => (
              <div key={voice.id} className="voiceCard">
                <div className="voiceCard__head">
                  <div className="voiceCard__ph">
                    <SiteImage name={voice.image} alt={voice.name} />
                  </div>
                  <div className="voiceCard__who">
                    {voice.name}<br />
                    {voice.family} / {voice.type}
                  </div>
                </div>
                <h2 className="voiceCard__ttl">{voice.title}</h2>
                <p className="voiceCard__txt">{voice.content}</p>
              </div>
            ))}
          </div>

          <div className="btnWrap">
            <button className="btn btn--fill btn--lg">もっと声を見る</button>
          </div>
        </div>
      </section>
    </>
  );
}
