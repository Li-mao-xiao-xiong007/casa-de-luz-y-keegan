-- Casa Chat — 消息编辑 / 重新生成支持
-- 运行方式：在 Supabase SQL Editor 中粘贴全文执行
-- 前置条件：003_create_messages.sql 已执行

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

-- 为 update/delete 补策略，方便后续消息编辑、重生成、清理。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'messages'
      AND policyname = 'allow_service_update_messages'
  ) THEN
    CREATE POLICY "allow_service_update_messages"
      ON messages FOR UPDATE TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'messages'
      AND policyname = 'allow_service_delete_messages'
  ) THEN
    CREATE POLICY "allow_service_delete_messages"
      ON messages FOR DELETE TO service_role
      USING (true);
  END IF;
END $$;
