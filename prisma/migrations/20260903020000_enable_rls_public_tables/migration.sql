-- 2026-09-03 IPA 準拠監査 指摘1（docs/inspections.md）への是正。
-- Supabase のセキュリティ警告 rls_disabled_in_public / sensitive_columns_exposed に対応する。
--
-- 【何が起きているか】
-- Supabase は public スキーマを PostgREST（https://<ref>.supabase.co/rest/v1/）で常時公開し、
-- 新しいテーブルに anon / authenticated ロールの権限を既定で付ける。
-- このプロジェクトのテーブルは Prisma のマイグレーションで作ったため RLS が無効のままで、
-- anon キーを持つ相手は User.password や Inquiry の本文を含む全行を読み書きできる状態にある。
-- 防いでいるのは「anon キーが外に出ていない」という1点だけで、認可の層が存在しない。
--
-- 【この修正でやること】2段構え。どちらか一方が破られても止まるようにする。
--   1. public の全テーブルで RLS を有効にする。ポリシーを1つも作らないので既定は全拒否。
--   2. anon / authenticated からテーブル権限そのものを取り上げる。
--      併せて既定権限も変え、今後 Prisma が作るテーブルに権限が付かないようにする。
--
-- 【アプリが壊れない理由】
-- アプリの読み書きは Prisma が DATABASE_URL（テーブル所有者ロール）で行う。
-- 所有者は RLS を素通りする（FORCE ROW LEVEL SECURITY は付けない）。
-- anon / authenticated はこのアプリのどこからも使っていない（@supabase/supabase-js 未導入・
-- anon キーは環境変数にも配信物にも存在しない）。画像保管の Supabase Storage は
-- service_role キーでサーバーからのみ呼ぶため、ここで触る public スキーマの権限とは無関係。
--
-- 【ロールの有無で分岐する理由】
-- anon / authenticated は Supabase が作るロールで、ローカルの開発用 PostgreSQL には存在しない。
-- 素の REVOKE を書くと、開発環境で `role "anon" does not exist` になり
-- マイグレーション全体が失敗する。存在するときだけ実行する。
--
-- 【所有者ロールをやめるとき】指摘2（読み書き専用ロールへの切り替え）を行う場合は、
-- 先に prisma/sql/002_app_role_least_privilege.sql を読むこと。
-- RLS を有効にしたままポリシー無しで非所有者ロールへ切り替えると、アプリが全拒否される。
--
-- 【戻し方】prisma/sql/002_rollback_rls.sql を実行する。データは変えていない。

-- 1. RLS を有効にする（public の実テーブルすべて。_prisma_migrations を含む）
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.oid::regclass AS rel
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t.rel);
  END LOOP;
END $$;

-- 2. 公開ロールから権限を取り上げる（そのロールが存在する環境でのみ）
-- 3. 今後このロールが作るテーブルにも権限が付かないようにする
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE USAGE ON SCHEMA public FROM %I', r);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM %I',
        current_user, r
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I',
        current_user, r
      );
      RAISE NOTICE 'ロール % から public スキーマの権限を取り上げました', r;
    ELSE
      RAISE NOTICE 'ロール % は存在しないため、権限の剥奪は不要です', r;
    END IF;
  END LOOP;
END $$;
