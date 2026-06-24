import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authWrite } from '@/lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'database not configured' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'invalid id' });
  }

  // GET — 读取单条
  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('memories')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return res.status(404).json({ error: 'not found' });
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json(data);
  }

  // PATCH — 更新记忆（浏览器编辑）
  if (req.method === 'PATCH') {
    if (!authWrite(req, res)) return;

    const { content, layer, tags, source, type, status } = req.body;

    const updates: Record<string, any> = {};
    if (content !== undefined) updates.content = content;
    if (layer !== undefined) updates.layer = layer;
    if (tags !== undefined) updates.tags = tags;
    if (source !== undefined) updates.source = source;
    if (type !== undefined) updates.type = type;
    if (status !== undefined) updates.status = status;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'no fields to update' });
    }

    const { data, error } = await supabaseAdmin
      .from('memories')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // DELETE — 删除记忆
  if (req.method === 'DELETE') {
    if (!authWrite(req, res)) return;

    const { error } = await supabaseAdmin
      .from('memories')
      .delete()
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'method not allowed' });
}
