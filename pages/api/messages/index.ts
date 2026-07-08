import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authWrite } from '@/lib/auth';

const DEFAULT_CONVERSATION_ID = '00000000-0000-0000-0000-000000000001';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'database not configured' });
  }

  if (req.method === 'POST') {
    if (!authWrite(req, res)) return;

    const { from_whom, content, conversation_id } = req.body;
    if (!from_whom || !content) {
      return res.status(400).json({ error: 'missing required fields: from_whom, content' });
    }
    if (!['keegan', 'luz'].includes(from_whom)) {
      return res.status(400).json({ error: 'from_whom must be keegan or luz' });
    }

    const targetConversationId = conversation_id || DEFAULT_CONVERSATION_ID;

    const { data, error } = await supabaseAdmin
      .from('messages')
      .insert({ from_whom, content: content.trim(), conversation_id: targetConversationId })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    await supabaseAdmin
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', targetConversationId);

    return res.status(201).json(data);
  }

  if (req.method === 'GET') {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const before = req.query.before as string;
    const conversationId = (req.query.conversation_id as string) || DEFAULT_CONVERSATION_ID;

    let query = supabaseAdmin
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (before) {
      const { data: ref } = await supabaseAdmin
        .from('messages')
        .select('created_at')
        .eq('id', before)
        .eq('conversation_id', conversationId)
        .single();
      if (ref) {
        query = query.lt('created_at', ref.created_at);
      }
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    const has_more = data.length > limit;
    const messages = (has_more ? data.slice(0, limit) : data).reverse();

    return res.status(200).json({ messages, has_more });
  }

  return res.status(405).json({ error: 'method not allowed' });
}
