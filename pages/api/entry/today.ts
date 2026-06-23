import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabase-admin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'database not configured' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin
    .from('entries')
    .select('*')
    .eq('date', date)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ data, date });
}
