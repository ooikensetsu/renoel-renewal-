-- 物件確認の記録（2026-10-27）。表を1つ足すだけで、既存の表と行は変えない。既存の物件は記録なし（未確認）から始める。
-- 戻し方：DROP TABLE "PropertyConfirmation";（確認の記録だけが消える。物件のデータには影響しない）
CREATE TABLE "PropertyConfirmation" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedBy" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "PropertyConfirmation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PropertyConfirmation_propertyId_confirmedAt_idx" ON "PropertyConfirmation"("propertyId", "confirmedAt");

ALTER TABLE "PropertyConfirmation" ADD CONSTRAINT "PropertyConfirmation_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 20260903010000 と同じく RLS を有効にする（ポリシーなし＝公開ロールは全拒否。アプリは postgres で読み書き）
ALTER TABLE "PropertyConfirmation" ENABLE ROW LEVEL SECURITY;
