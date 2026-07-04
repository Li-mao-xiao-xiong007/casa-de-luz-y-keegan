-- Casa Chat — 消息表
-- 运行方式：在 Supabase SQL Editor 中粘贴全文执行
-- 前置条件：001_create_tables.sql 已执行

-- 1. 消息表
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  from_whom text NOT NULL CHECK (from_whom IN ('keegan', 'luz')),
  content text NOT NULL
);

-- 索引：按时间正序读取
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages (created_at ASC);

-- 2. 启用 RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 读策略：所有人都能读
CREATE POLICY "allow_read_messages" ON messages FOR SELECT USING (true);

-- 写策略：仅 service_role 可写
CREATE POLICY "allow_service_write_messages" ON messages FOR INSERT TO service_role WITH CHECK (true);
