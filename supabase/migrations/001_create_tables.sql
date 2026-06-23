-- Phase 0.5: 记忆地基 — 建表
-- 运行方式：在 Supabase SQL Editor 中粘贴全文执行

-- 1. 记忆表
CREATE TABLE IF NOT EXISTS memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  type text NOT NULL CHECK (type IN ('thought', 'observation', 'summary', 'message')),
  layer text NOT NULL CHECK (layer IN ('basic', 'relation', 'dynamic', 'private', 'moment')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'stable')),
  content text NOT NULL,
  source text NOT NULL CHECK (source IN ('keegan', 'luz', 'api')),
  tags text[] DEFAULT '{}',
  parent_id uuid REFERENCES memories(id) ON DELETE SET NULL,
  meta jsonb DEFAULT '{}'
);

-- 记忆表索引
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories (type);
CREATE INDEX IF NOT EXISTS idx_memories_layer ON memories (layer);
CREATE INDEX IF NOT EXISTS idx_memories_source ON memories (source);
CREATE INDEX IF NOT EXISTS idx_memories_tags ON memories USING GIN (tags);

-- 2. 标签表
CREATE TABLE IF NOT EXISTS tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  color text
);

-- 3. 留言/日志表
CREATE TABLE IF NOT EXISTS entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  date date NOT NULL,
  from_whom text NOT NULL CHECK (from_whom IN ('keegan', 'luz')),
  content text NOT NULL,
  mood text,
  UNIQUE (date, from_whom)
);

CREATE INDEX IF NOT EXISTS idx_entries_date ON entries (date DESC);

-- 4. 启用 RLS（安全策略）
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;

-- 读策略：所有人都能读（Phase 0 门开着）
CREATE POLICY "allow_read_memories" ON memories FOR SELECT USING (true);
CREATE POLICY "allow_read_tags" ON tags FOR SELECT USING (true);
CREATE POLICY "allow_read_entries" ON entries FOR SELECT USING (true);

-- 写策略：仅 service_role 可写（API routes 用 service_role key 操作）
CREATE POLICY "allow_service_write_memories" ON memories FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "allow_service_write_memories_update" ON memories FOR UPDATE TO service_role USING (true);
CREATE POLICY "allow_service_write_tags" ON tags FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "allow_service_write_entries" ON entries FOR INSERT TO service_role WITH CHECK (true);
