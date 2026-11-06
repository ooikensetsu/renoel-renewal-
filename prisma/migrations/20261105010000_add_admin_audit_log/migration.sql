-- 管理画面の操作履歴（2026-11-05）。表を1つ足すだけで、既存の表と行は変えない。
-- 戻し方：DROP TABLE "AdminAuditLog";（操作履歴だけが消える。ほかのデータには影響しない）
CREATE TABLE "AdminAuditLog" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" INTEGER NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "count" INTEGER,
    "summary" TEXT,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");
CREATE INDEX "AdminAuditLog_action_createdAt_idx" ON "AdminAuditLog"("action", "createdAt");
CREATE INDEX "AdminAuditLog_actorId_createdAt_idx" ON "AdminAuditLog"("actorId", "createdAt");

-- 20260903010000 と同じく RLS を有効にする（ポリシーなし＝公開ロールは全拒否。アプリは postgres で読み書き）
ALTER TABLE "AdminAuditLog" ENABLE ROW LEVEL SECURITY;
