import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authWrite } from '@/lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'database not configured' });
  }

  // POST — 写入记忆
  if (req.method === 'POST') {
    if (!authWrite(req, res)) return;

    const { type, layer, content, source, tags, parent_id, meta, tone } = req.body;
    if (!type || !layer || !content || !source) {
      return res.status(400).json({ error: 'missing required fields: type, layer, content, source' });
    }
    if (tone !== undefined && !['warm', 'cold', 'neutral'].includes(tone)) {
      return res.status(400).json({ error: 'invalid tone: expected warm, cold, or neutral' });
    }

    const memory = { type, layer, content, source, tags, parent_id, meta, ...(tone ? { tone } : {}) };
    const { data, error } = await supabaseAdmin
      .from('memories')
      .insert(memory)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  // GET — 记忆列表（分页 + 筛选）
  if (req.method === 'GET') {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = parseInt(req.query.offset as string) || 0;
    const type = req.query.type as string;
    const layer = req.query.layer as string;

    let query = supabaseAdmin
      .from('memories')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (type) query = query.eq('type', type);
    if (layer) query = query.eq('layer', layer);

    const { data, count, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ data, total: count, limit, offset });
  }

  return res.status(405).json({ error: 'method not allowed' });
}
