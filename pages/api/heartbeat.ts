import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * 心跳端点 — 被 Vercel Cron 每天调用一次
 * 对 Supabase 做一次轻量查询，防止项目因不活跃被自动暂停
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  // 验证 Vercel Cron 来源（如果配置了 CRON_SECRET）
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'unauthorized' });
    }
  }

  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'database not configured' });
  }

  // 轻量查询：读 settings 表第一条记录
  const { error } = await supabaseAdmin
    .from('settings')
    .select('key')
    .limit(1);

  if (error) {
    console.error('[heartbeat] supabase ping failed:', error.message);
    return res.status(500).json({ ok: false, error: error.message });
  }

  return res.status(200).json({
    ok: true,
    timestamp: new Date().toISOString(),
    message: 'supabase heartbeat ok',
  });
}
