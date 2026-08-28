-- S-08：公開フォーム（未認証で叩ける "use server"）の濫用を抑えるための計数テーブル。
-- key ごとに time window 内の呼び出し回数を持つ。追加のみ・既存テーブルには触れない。
--
-- 戻し方： DROP TABLE IF EXISTS "RateLimit";
--          （このテーブルが無くても checkRateLimit() は「通す」側に倒れるため、
--            アプリは止まらない。src/lib/rateLimit.ts の catch を参照）

CREATE TABLE IF NOT EXISTS "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

CREATE INDEX IF NOT EXISTS "RateLimit_expiresAt_idx" ON "RateLimit"("expiresAt");
