-- Casa Memory L1 + P1 - 情感温度层
-- 运行方式：在 Supabase SQL Editor 中粘贴全文执行

ALTER TABLE memories
  ADD COLUMN IF NOT EXISTS tone text NOT NULL DEFAULT 'neutral';

ALTER TABLE memories
  DROP CONSTRAINT IF EXISTS memories_tone_check;

ALTER TABLE memories
  ADD CONSTRAINT memories_tone_check
  CHECK (tone IN ('warm', 'cold', 'neutral'));

CREATE INDEX IF NOT EXISTS idx_memories_tone ON memories (tone);

INSERT INTO settings (key, value)
VALUES ('memory_context_count', '8')
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN memories.tone IS
  '提起这段记忆时的情绪底色：warm（暖）、cold（冷）、neutral（中性）';
