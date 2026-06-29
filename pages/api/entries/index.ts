import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabase-admin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'database not configured' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const page = Math.max(parseInt(req.query.page as string) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit as string) || 30, 100);
  const offset = (page - 1) * limit;

  // 获取历史留言（排除今天）
  const today = new Date().toISOString().slice(0, 10);

  const { data, count, error } = await supabaseAdmin
    .from('entries')
    .select('*', { count: 'exact' })
    .neq('date', today)
    .order('date', { ascending: false })
    .order('from_whom', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({
    data: data || [],
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  });
}
