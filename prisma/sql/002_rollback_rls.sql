-- 20260903020000_enable_rls_public_tables を取り消す。
-- データは変えない。RLS を無効に戻すだけで、anon / authenticated への GRANT は戻さない
-- （元々あの権限は要らないため。必要になったら個別に GRANT すること）。
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.oid::regclass AS rel
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE %s DISABLE ROW LEVEL SECURITY', t.rel);
  END LOOP;
END $$;
