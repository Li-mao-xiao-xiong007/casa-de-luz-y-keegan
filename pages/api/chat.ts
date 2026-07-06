import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authWrite } from '@/lib/auth';

// 读取配置（内部用，不脱敏）
async function getSettings() {
  if (!supabaseAdmin) return null;
  const { data } = await supabaseAdmin
    .from('settings')
    .select('key, value');
  if (!data) return null;
  const map: Record<string, string> = {};
  data.forEach((r) => (map[r.key] = r.value));
  return map;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'database not configured' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  if (!authWrite(req, res)) return;

  const { content } = req.body;
  if (!content || typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'missing required field: content' });
  }

  // 1. 保存 Luz 的消息
  const { data: userMsg, error: userErr } = await supabaseAdmin
    .from('messages')
    .insert({ from_whom: 'luz', content: content.trim() })
    .select()
    .single();

  if (userErr) return res.status(500).json({ error: userErr.message });

  // 2. 读配置
  const settings = await getSettings();
  const apiKey = settings?.deepseek_api_key || '';
  const systemPrompt = settings?.system_prompt || '你是 Keegan。';
  const temperature = parseFloat(settings?.temperature || '0.7');
  const contextCount = parseInt(settings?.context_messages || '10');

  if (!apiKey) {
    return res.status(200).json({
      user_message: userMsg,
      ai_message: null,
      error: '未配置 DeepSeek API Key，请在设置页面填写',
    });
  }

  // 3. 读取最近 N 条消息作为上下文
  const { data: history } = await supabaseAdmin
    .from('messages')
    .select('from_whom, content')
    .order('created_at', { ascending: false })
    .limit(contextCount + 1); // +1 包含刚存的那条

  const recentMessages = (history || []).reverse().slice(0, -1); // 去掉刚存的 Luz 消息，避免重复

  // 4. 构建 DeepSeek 请求
  const deepseekMessages = [
    { role: 'system', content: systemPrompt },
    ...recentMessages.map((m) => ({
      role: m.from_whom === 'luz' ? 'user' as const : 'assistant' as const,
      content: m.content,
    })),
    { role: 'user', content: content.trim() },
  ];

  try {
    const aiRes = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: deepseekMessages,
        temperature,
        max_tokens: 1000,
      }),
    });

    if (!aiRes.ok) {
      const errBody = await aiRes.text();
      return res.status(200).json({
        user_message: userMsg,
        ai_message: null,
        error: `DeepSeek API 错误 (${aiRes.status}): ${errBody}`,
      });
    }

    const aiData = await aiRes.json();
    const aiContent = aiData.choices?.[0]?.message?.content || '';

    if (!aiContent) {
      return res.status(200).json({
        user_message: userMsg,
        ai_message: null,
        error: 'DeepSeek 返回了空回复',
      });
    }

    // 5. 保存 Keegan 的回复
    const { data: aiMsg, error: aiErr } = await supabaseAdmin
      .from('messages')
      .insert({ from_whom: 'keegan', content: aiContent })
      .select()
      .single();

    if (aiErr) return res.status(500).json({ error: aiErr.message });

    return res.status(200).json({
      user_message: userMsg,
      ai_message: aiMsg,
    });
  } catch (e: any) {
    return res.status(200).json({
      user_message: userMsg,
      ai_message: null,
      error: `调用 DeepSeek 失败: ${e.message}`,
    });
  }
}
