import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authWrite } from '@/lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'database not configured' });
  }

  // GET — 获取所有配置
  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('settings')
      .select('key, value');

    if (error) return res.status(500).json({ error: error.message });

    // 转为对象格式，API Key 脱敏
    const settings: Record<string, string> = {};
    data?.forEach((row) => {
      if (row.key === 'deepseek_api_key' && row.value) {
        // 只显示前4位和后4位
        settings[row.key] = row.value.length > 8
          ? row.value.slice(0, 4) + '****' + row.value.slice(-4)
          : '****';
      } else {
        settings[row.key] = row.value;
      }
    });

    return res.status(200).json(settings);
  }

  // PUT — 更新配置
  if (req.method === 'PUT') {
    if (!authWrite(req, res)) return;

    const updates = req.body; // { key: value, ... }
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'request body must be an object' });
    }

    // 逐个更新
    for (const [key, value] of Object.entries(updates)) {
      if (typeof value !== 'string') continue;
      const { error } = await supabaseAdmin
        .from('settings')
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'method not allowed' });
}
