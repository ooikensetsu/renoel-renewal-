-- トップページの「新着物件」に出すかどうか。既存の物件はすべて false（出さない）で始まる。
-- 戻し方：ALTER TABLE "Property" DROP COLUMN "showOnTop";（チェックの内容は失われる）
ALTER TABLE "Property" ADD COLUMN "showOnTop" BOOLEAN NOT NULL DEFAULT false;
