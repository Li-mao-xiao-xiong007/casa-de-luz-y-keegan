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

  const { name, color } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  const { data, error } = await supabaseAdmin
    .from('tags')
    .upsert({ name, color }, { onConflict: 'name' })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json(data);
}
