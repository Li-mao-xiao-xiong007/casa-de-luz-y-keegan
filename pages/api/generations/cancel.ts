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

  const { generation_id } = req.body || {};
  if (!generation_id || typeof generation_id !== 'string') {
    return res.status(400).json({ error: 'missing required field: generation_id' });
  }

  const { error } = await supabaseAdmin
    .from('chat_generations')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', generation_id)
    .eq('status', 'running');

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}
