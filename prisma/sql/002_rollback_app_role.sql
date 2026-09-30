-- 002_app_role_least_privilege.sql を取り消す。
-- 先に Vercel の DATABASE_URL を所有者の値へ戻し、再デプロイしてから実行すること
-- （順番を逆にすると、接続中のアプリがロール消失で落ちる）。
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.oid::regclass AS rel
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS renoel_app_all ON %s', t.rel);
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'renoel_app') THEN
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM renoel_app', current_user);
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM renoel_app', current_user);
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM renoel_app';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM renoel_app';
    EXECUTE 'REVOKE USAGE ON SCHEMA public FROM renoel_app';
    EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM renoel_app', current_database());
    EXECUTE 'DROP ROLE renoel_app';
  END IF;
END $$;
