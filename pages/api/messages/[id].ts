import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authWrite } from '@/lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'database not configured' });
  }

  const id = req.query.id as string;
  if (!id) {
    return res.status(400).json({ error: 'missing message id' });
  }

  if (req.method === 'PATCH') {
    if (!authWrite(req, res)) return;

    const { content } = req.body;
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'missing required field: content' });
    }

    const { data, error } = await supabaseAdmin
      .from('messages')
      .update({ content: content.trim(), edited_at: new Date().toISOString() })
      .eq('id', id)
      .eq('from_whom', 'luz')
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'message not found or not editable' });

    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    if (!authWrite(req, res)) return;

    const { error } = await supabaseAdmin
      .from('messages')
      .delete()
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'method not allowed' });
}
