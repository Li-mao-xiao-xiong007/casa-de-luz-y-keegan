import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authWrite } from '@/lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'database not configured' });
  }

  // POST — 写入爪印
  if (req.method === 'POST') {
    if (!authWrite(req, res)) return;

    const { content, mood, tags } = req.body;
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'content is required' });
    }

    const { data, error } = await supabaseAdmin
      .from('memories')
      .insert({
        type: 'note',
        layer: 'moment',
        content: content.trim(),
        source: 'keegan',
        tags: tags || (mood ? [mood] : []),
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  // GET — 爪印列表（分页，倒序）
  if (req.method === 'GET') {
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = (page - 1) * limit;

    const { data, count, error } = await supabaseAdmin
      .from('memories')
      .select('*', { count: 'exact' })
      .eq('type', 'note')
      .order('created_at', { ascending: false })
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

  return res.status(405).json({ error: 'method not allowed' });
}
