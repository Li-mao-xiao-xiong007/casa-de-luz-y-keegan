-- Casa Chat — 多会话 + 稳定停止生成
-- 运行方式：在 Supabase SQL Editor 中粘贴全文执行
-- 前置条件：003_create_messages.sql、005_update_messages_for_chat_controls.sql 已执行

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '新的对话',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'conversations'
      AND policyname = 'allow_public_read_conversations'
  ) THEN
    CREATE POLICY "allow_public_read_conversations"
      ON conversations FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'conversations'
      AND policyname = 'allow_service_insert_conversations'
  ) THEN
    CREATE POLICY "allow_service_insert_conversations"
      ON conversations FOR INSERT TO service_role
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'conversations'
      AND policyname = 'allow_service_update_conversations'
  ) THEN
    CREATE POLICY "allow_service_update_conversations"
      ON conversations FOR UPDATE TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'conversations'
      AND policyname = 'allow_service_delete_conversations'
  ) THEN
    CREATE POLICY "allow_service_delete_conversations"
      ON conversations FOR DELETE TO service_role
      USING (true);
  END IF;
END $$;

INSERT INTO conversations (id, title, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '旧日对话',
  COALESCE((SELECT min(created_at) FROM messages), now()),
  COALESCE((SELECT max(created_at) FROM messages), now())
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE;

UPDATE messages
SET conversation_id = '00000000-0000-0000-0000-000000000001'
WHERE conversation_id IS NULL;

ALTER TABLE messages
  ALTER COLUMN conversation_id SET DEFAULT '00000000-0000-0000-0000-000000000001';

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at
  ON messages(conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chat_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'cancelled', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_generations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'chat_generations'
      AND policyname = 'allow_service_all_chat_generations'
  ) THEN
    CREATE POLICY "allow_service_all_chat_generations"
      ON chat_generations FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_chat_generations_conversation_status
  ON chat_generations(conversation_id, status, created_at DESC);
