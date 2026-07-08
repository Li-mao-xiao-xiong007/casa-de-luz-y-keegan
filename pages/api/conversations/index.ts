import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authWrite } from '@/lib/auth';

function defaultTitle() {
  return `新的对话 ${new Date().toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'database not configured' });
  }

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .select('id, title, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ conversations: data || [] });
  }

  if (req.method === 'POST') {
    if (!authWrite(req, res)) return;

    const title = typeof req.body?.title === 'string' && req.body.title.trim()
      ? req.body.title.trim()
      : defaultTitle();

    const { data, error } = await supabaseAdmin
      .from('conversations')
      .insert({ title })
      .select('id, title, created_at, updated_at')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  return res.status(405).json({ error: 'method not allowed' });
}
