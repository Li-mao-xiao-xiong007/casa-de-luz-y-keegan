-- Phase 1.x: 私语 (Whisper) — 数据库变更
-- 运行方式：在 Supabase SQL Editor 中粘贴全文执行
-- 前置条件：001_create_tables.sql 已执行

-- 1. 扩展 type 约束，加入 'note'（爪印）和 'letter'（私语）
ALTER TABLE memories DROP CONSTRAINT IF EXISTS memories_type_check;
ALTER TABLE memories ADD CONSTRAINT memories_type_check
  CHECK (type IN ('thought', 'observation', 'summary', 'message', 'note', 'letter'));

-- 2. 补充 DELETE 策略（之前被漏掉，记忆/爪印删除需要）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'allow_service_delete_memories' AND tablename = 'memories'
  ) THEN
    CREATE POLICY "allow_service_delete_memories" ON memories
      FOR DELETE TO service_role USING (true);
  END IF;
END $$;
