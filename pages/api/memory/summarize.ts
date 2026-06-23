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

  const { memory_ids, title, content } = req.body;
  if (!memory_ids || !Array.isArray(memory_ids) || memory_ids.length === 0 || !content) {
    return res.status(400).json({ error: 'memory_ids (array) and content are required' });
  }

  // 1. 创建总结记忆
  const { data: summary, error: summaryError } = await supabaseAdmin
    .from('memories')
    .insert({
      type: 'summary',
      layer: 'dynamic',
      content: title ? `## ${title}\n\n${content}` : content,
      source: 'keegan',
      meta: { summarized_from: memory_ids },
    })
    .select()
    .single();

  if (summaryError) return res.status(500).json({ error: summaryError.message });

  // 2. 将原始碎片记忆归档
  await supabaseAdmin
    .from('memories')
    .update({ status: 'archived', parent_id: summary.id })
    .in('id', memory_ids);

  return res.status(201).json(summary);
}
