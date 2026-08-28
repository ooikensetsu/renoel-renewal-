import { redirect } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import DeleteAccountButton from "@/components/DeleteAccountButton";
import { requireUser } from "@/lib/auth";
import { signInPath } from "@/lib/authPaths";

// 毎回サーバー側で権限を確認する（キャッシュさせない）。
export const dynamic = "force-dynamic";

export default async function MyPage() {
  // S-07：他の画面と同じく requireUser() で判定する。
  // getServerSession() の直呼びだと、停止・退会済みでも
  // セッション有効期限（最大8時間）の間はこの画面に入れてしまう。
  const auth = await requireUser();
  if (!auth.ok) {
    redirect(signInPath("/mypage"));
  }

  const user = await prisma.user.findFirst({
    where: { id: auth.userId, deletedAt: null },
    select: { name: true, email: true },
  });
  if (!user) {
    redirect(signInPath("/mypage"));
  }

  return (
    <>
      
      <section className="memberHero" style={{ minHeight: "200px" }}>
        <div className="memberHero__photo" style={{ backgroundImage: "url('https://usedrenovation.ooi-kensetsu.co.jp/wp-content/uploads/2023/09/renoel7.jpg')" }}></div>
        <div className="memberHero__panel" style={{ width: "100%", borderRadius: 0, paddingLeft: "5%", minHeight: "200px" }}>
          <div className="memberHero__inner">
            <h1 className="memberHero__ttl">マイページ</h1>
          </div>
        </div>
      </section>


      <section className="sec">
        <div className="container" style={{ maxWidth: "800px" }}>
          <p style={{ marginBottom: "32px", fontSize: "1.8rem" }}>ようこそ、{user.name || "会員"}さん</p>

          <div className="cardGrid cardGrid--2">
            {/* お気に入り物件 (モック) */}
            <div className="voiceCard" style={{ display: "flex", flexDirection: "column" }}>
              <h2 className="voiceCard__ttl" style={{ borderBottom: "1px solid var(--c-line)", paddingBottom: "12px", marginBottom: "16px" }}>お気に入り物件</h2>
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 0" }}>
                <p style={{ color: "var(--c-mute-dark)", fontSize: "1.4rem" }}>現在登録されている物件はありません。</p>
              </div>
              <div style={{ marginTop: "auto", textAlign: "center" }}>
                <Link href="/properties" className="btn btn--sm btn--block">物件を探す</Link>
              </div>
            </div>

            {/* 会員限定物件検索 */}
            <div className="voiceCard" style={{ display: "flex", flexDirection: "column" }}>
              <h2 className="voiceCard__ttl" style={{ borderBottom: "1px solid var(--c-line)", paddingBottom: "12px", marginBottom: "16px" }}>会員限定物件</h2>
              <p className="voiceCard__txt" style={{ flex: 1 }}>
                会員様だけが閲覧できる未公開・限定物件をチェックできます。
              </p>
              <div style={{ marginTop: "auto", textAlign: "center" }}>
                <Link href="/properties" className="btn btn--fill btn--sm btn--block">会員限定物件を見る</Link>
              </div>
            </div>

            {/* 会員情報設定 (モック) */}
            <div className="voiceCard" style={{ display: "flex", flexDirection: "column", gridColumn: "1 / -1" }}>
              <h2 className="voiceCard__ttl" style={{ borderBottom: "1px solid var(--c-line)", paddingBottom: "12px", marginBottom: "16px" }}>会員情報</h2>
              <dl className="mediaCard__data" style={{ borderTop: "none", marginTop: 0 }}>
                <div style={{ padding: "12px 0" }}>
                  <dt>お名前</dt>
                  <dd>{user.name || "未設定"}</dd>
                </div>
                <div style={{ padding: "12px 0" }}>
                  <dt>メールアドレス</dt>
                  <dd>{user.email}</dd>
                </div>
              </dl>
              <div style={{ marginTop: "24px", textAlign: "center" }}>
                <Link href="/mypage/edit" className="btn btn--sm">登録情報を編集する</Link>
              </div>
            </div>
          </div>
          <DeleteAccountButton />
        </div>
      </section>
    </>
  );
}
