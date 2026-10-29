-- 取扱会社の台帳と旧表記（2026-10-22）。既存の表は変えない。
-- 戻し方：DROP TABLE "AgencyAlias"; DROP TABLE "Agency";
--   消えるのは会社情報と旧表記の記録だけ。物件へ書き込んだ値と統合で変えた会社名は残るので、
--   それを戻すときは scripts/restore-agency-backup.mjs で PropertyImportBackup の控えから戻す。
CREATE TABLE "Agency" (
    "name" TEXT NOT NULL,
    "address" TEXT,
    "tel" TEXT,
    "fax" TEXT,
    "license" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agency_pkey" PRIMARY KEY ("name")
);

CREATE TABLE "AgencyAlias" (
    "alias" TEXT NOT NULL,
    "agencyName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencyAlias_pkey" PRIMARY KEY ("alias")
);

CREATE INDEX "AgencyAlias_agencyName_idx" ON "AgencyAlias"("agencyName");

-- 20260903010000 と同じく RLS を有効にする（ポリシーなし＝公開ロールは全拒否。アプリは postgres で読み書き）
ALTER TABLE "Agency" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgencyAlias" ENABLE ROW LEVEL SECURITY;
