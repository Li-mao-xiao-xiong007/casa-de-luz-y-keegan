import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authWrite } from '@/lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'database not configured' });
  }

  const id = req.query.id as string;
  if (!id) {
    return res.status(400).json({ error: 'missing conversation id' });
  }

  if (req.method === 'DELETE') {
    if (!authWrite(req, res)) return;

    const { count: totalCount } = await supabaseAdmin
      .from('conversations')
      .select('id', { count: 'exact', head: true });

    if ((totalCount || 0) <= 1) {
      return res.status(400).json({ error: '至少保留一个对话' });
    }

    const { error } = await supabaseAdmin
      .from('conversations')
      .delete()
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'method not allowed' });
}
