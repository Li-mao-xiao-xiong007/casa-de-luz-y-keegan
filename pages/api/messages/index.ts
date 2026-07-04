import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authWrite } from '@/lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'database not configured' });
  }

  // POST — 写入消息
  if (req.method === 'POST') {
    if (!authWrite(req, res)) return;

    const { from_whom, content } = req.body;
    if (!from_whom || !content) {
      return res.status(400).json({ error: 'missing required fields: from_whom, content' });
    }
    if (!['keegan', 'luz'].includes(from_whom)) {
      return res.status(400).json({ error: 'from_whom must be keegan or luz' });
    }

    const { data, error } = await supabaseAdmin
      .from('messages')
      .insert({ from_whom, content: content.trim() })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  // GET — 消息列表（分页）
  if (req.method === 'GET') {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const before = req.query.before as string; // uuid 游标

    let query = supabaseAdmin
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit + 1); // 多查一条用来判断 has_more

    if (before) {
      // 获取 before 对应消息的 created_at，然后查更早的
      const { data: ref } = await supabaseAdmin
        .from('messages')
        .select('created_at')
        .eq('id', before)
        .single();
      if (ref) {
        query = query.lt('created_at', ref.created_at);
      }
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    const has_more = data.length > limit;
    const messages = (has_more ? data.slice(0, limit) : data).reverse(); // 正序返回

    return res.status(200).json({ messages, has_more });
  }

  return res.status(405).json({ error: 'method not allowed' });
}
