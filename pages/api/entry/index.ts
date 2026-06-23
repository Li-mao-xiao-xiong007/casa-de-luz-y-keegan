import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authWrite } from '@/lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'database not configured' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  if (!authWrite(req, res)) return;

  // 请求体中不传 date 时，自动取今天
  const { date, from_whom, content, mood } = req.body;
  const entryDate = date || new Date().toISOString().slice(0, 10);

  if (!from_whom || !content) {
    return res.status(400).json({ error: 'from_whom and content are required' });
  }

  // upsert: 同一天同一人已有记录则更新
  const { data, error } = await supabaseAdmin
    .from('entries')
    .upsert({ date: entryDate, from_whom, content, mood }, { onConflict: 'date,from_whom' })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json(data);
}
