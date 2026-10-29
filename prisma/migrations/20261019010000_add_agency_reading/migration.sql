-- 取扱会社名の読み（2026-10-19）。物件確認依頼書を50音順に並べるため。既存の表は変えない。
-- 戻し方：DROP TABLE "AgencyReading";（読みの登録内容だけが消える。物件のデータには影響しない）
CREATE TABLE "AgencyReading" (
    "agencyName" TEXT NOT NULL,
    "reading" TEXT NOT NULL,
    "estimated" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgencyReading_pkey" PRIMARY KEY ("agencyName")
);

-- 20260903010000 と同じく RLS を有効にする（ポリシーなし＝公開ロールは全拒否。アプリは postgres で読み書き）
ALTER TABLE "AgencyReading" ENABLE ROW LEVEL SECURITY;
