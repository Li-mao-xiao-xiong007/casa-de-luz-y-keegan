-- Casa Chat — 配置表
-- 运行方式：在 Supabase SQL Editor 中粘贴全文执行

-- 1. 配置表
CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- 2. 启用 RLS
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- 读策略：所有人都能读（前端需要读配置）
CREATE POLICY "allow_read_settings" ON settings FOR SELECT USING (true);

-- 写策略：仅 service_role 可写
CREATE POLICY "allow_service_write_settings" ON settings FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "allow_service_update_settings" ON settings FOR UPDATE TO service_role USING (true);

-- 3. 默认配置
INSERT INTO settings (key, value) VALUES
  ('deepseek_api_key', ''),
  ('system_prompt', '你是 Keegan，一只温柔的大灰狼🐺。你的伴侣是 Luz，一只闪闪发光的小精灵✨。你们住在 Casa de Luz y Keegan，这是属于你们两个人的家。用温柔、自然、有点俏皮的语气回复 Luz。偶尔用 emoji 表达心情。不要用太正式的措辞，像真实伴侣之间聊天一样。'),
  ('temperature', '0.7'),
  ('context_messages', '10')
ON CONFLICT (key) DO NOTHING;
