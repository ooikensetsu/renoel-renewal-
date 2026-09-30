-- 2026-09-03 IPA 準拠監査 指摘2（docs/inspections.md）への是正。
-- IPA『安全なウェブサイトの作り方』1-(iv)「データベースアカウントに適切な権限を与える」。
--
-- 【何が問題か】
-- アプリの DATABASE_URL がテーブル所有者ロールを指している。所有者は
--   ・行レベルセキュリティ（RLS）を素通りする
--   ・DROP TABLE / ALTER TABLE などのDDLを実行できる
-- SQLインジェクションは監査で1件も見つかっていないため即時の穴ではない。
-- ただし1件でも入り込んだとき、被害がテーブル削除まで及ぶ。
--
-- 【この手順でやること】
-- 読み書きだけができるロール renoel_app を作り、アプリの接続先をそちらへ移す。
-- DDLは持たせない。マイグレーション（DIRECT_URL）は所有者のまま残す。
--
-- 【ポリシーが要る理由】
-- 20260903020000_enable_rls_public_tables で RLS を有効にし、ポリシーを1つも作っていない。
-- 所有者は素通りするので今は動いているが、**非所有者ロールに切り替えると全拒否になる。**
-- そこで renoel_app に対してだけ通すポリシーを、この手順のなかで同時に作る。
-- anon / authenticated には引き続きポリシーが無いため、公開APIからは1行も見えない。
--
-- ============================================================================
-- 実行方法（人間が行う。AIは実行しない ← パスワードを扱うため。CLAUDE.md D-14）
-- ============================================================================
--   1. パスワードを生成する（AIに渡さない）
--        openssl rand -base64 32
--   2. Supabase の Project Settings → Database の接続文字列（所有者）で実行する
--        psql "<DIRECT_URL>" -v app_password="'<1で生成した値>'" -f 002_app_role_least_privilege.sql
--      Supabase の SQL Editor を使う場合は :app_password を実際の値に置き換えて貼り付ける。
--   3. 末尾の確認クエリの出力を見る。テーブル数とポリシー数が一致していること。
--   4. Vercel の環境変数 DATABASE_URL のユーザー名とパスワードを renoel_app のものへ変える。
--      **DIRECT_URL は変えない**（マイグレーションにDDLが要るため）。
--   5. 再デプロイし、/properties と /admin/users の表示、会員登録の1件を実際に確かめる。
--
-- 【戻し方】DATABASE_URL を元の所有者の値へ戻して再デプロイする（即時）。
-- ロールを消すなら prisma/sql/002_rollback_app_role.sql。
-- ============================================================================

BEGIN;

-- 1. ロールを作る。DDLも作成権限も与えない
CREATE ROLE renoel_app LOGIN PASSWORD :app_password;

-- 2. 接続とスキーマの利用
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO renoel_app', current_database());
END $$;
GRANT USAGE ON SCHEMA public TO renoel_app;

-- 3. 行の読み書きだけを与える（_prisma_migrations は除く。アプリは実行時に触らない）
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.oid::regclass AS rel
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO renoel_app', t.rel);
    -- 4. RLS を通すポリシー。renoel_app にだけ効く（anon / authenticated には作らない）
    EXECUTE format(
      'CREATE POLICY renoel_app_all ON %s FOR ALL TO renoel_app USING (true) WITH CHECK (true)',
      t.rel
    );
  END LOOP;
END $$;

-- 5. 連番（id の autoincrement）に必要
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO renoel_app;

-- 6. 今後 所有者が作るテーブルにも同じ権限が付くようにする
--    （ポリシーは自動では作られない。新しいテーブルを足したらこのファイルを再実行すること）
DO $$
BEGIN
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO renoel_app',
    current_user
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO renoel_app',
    current_user
  );
END $$;

COMMIT;

-- ============================================================================
-- 確認：この2つの数が一致していること（_prisma_migrations を除いたテーブル数）
-- ============================================================================
SELECT
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations')
    AS "テーブル数",
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND policyname = 'renoel_app_all')
    AS "ポリシー数",
  (SELECT count(*) FROM pg_roles WHERE rolname = 'renoel_app' AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole)
    AS "権限を絞れているか_1が正";
