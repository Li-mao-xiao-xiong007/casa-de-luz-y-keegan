import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabase-admin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'database not configured' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const q = (req.query.q as string || '').trim();
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
  const offset = parseInt(req.query.offset as string) || 0;

  if (!q) {
    return res.status(400).json({ error: 'query parameter "q" is required' });
  }

  const { data, count, error } = await supabaseAdmin
    .from('memories')
    .select('*', { count: 'exact' })
    .ilike('content', `%${q}%`)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ data, total: count, limit, offset, q });
}
