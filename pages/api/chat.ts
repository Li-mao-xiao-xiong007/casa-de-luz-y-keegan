import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authWrite } from '@/lib/auth';

type ChatRole = 'system' | 'user' | 'assistant';
type DeepSeekMessage = { role: ChatRole; content: string };

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

function sendEvent(res: NextApiResponse, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function toDeepSeekRole(fromWhom: string): 'user' | 'assistant' {
  return fromWhom === 'luz' ? 'user' : 'assistant';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'database not configured' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  if (!authWrite(req, res)) return;

  const { content, save_user = true } = req.body;
  if (!content || typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'missing required field: content' });
  }

  const text = content.trim();
  const shouldSaveUser = save_user !== false;

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const abortController = new AbortController();
  let responseFinished = false;
  req.on('aborted', () => abortController.abort());
  res.on('close', () => {
    if (!responseFinished) abortController.abort();
  });

  let userMsg = null;

  try {
    if (shouldSaveUser) {
      const { data, error } = await supabaseAdmin
        .from('messages')
        .insert({ from_whom: 'luz', content: text })
        .select()
        .single();

      if (error) {
        sendEvent(res, 'error', { error: error.message });
        responseFinished = true;
        return res.end();
      }

      userMsg = data;
      sendEvent(res, 'user_message', data);
    }

    const settings = await getSettings();
    const apiKey = settings?.deepseek_api_key || '';
    const systemPrompt = settings?.system_prompt || '你是 Keegan。';
    const temperature = parseFloat(settings?.temperature || '0.7');
    const contextCount = parseInt(settings?.context_messages || '10');

    if (!apiKey) {
      sendEvent(res, 'error', { error: '未配置 DeepSeek API Key，请在设置页面填写', user_message: userMsg });
      responseFinished = true;
      return res.end();
    }

    const { data: history } = await supabaseAdmin
      .from('messages')
      .select('from_whom, content')
      .order('created_at', { ascending: false })
      .limit(Math.max(contextCount, 1));

    const recentMessages = (history || []).reverse();
    const deepseekMessages: DeepSeekMessage[] = [
      { role: 'system', content: systemPrompt },
      ...recentMessages.map((m) => ({
        role: toDeepSeekRole(m.from_whom),
        content: m.content,
      })),
    ];

    const lastMessage = recentMessages[recentMessages.length - 1];
    if (!lastMessage || lastMessage.from_whom !== 'luz' || lastMessage.content !== text) {
      deepseekMessages.push({ role: 'user', content: text });
    }

    const aiRes = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      signal: abortController.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: deepseekMessages,
        temperature,
        max_tokens: 1000,
        stream: true,
      }),
    });

    if (!aiRes.ok || !aiRes.body) {
      const errBody = await aiRes.text();
      sendEvent(res, 'error', { error: `DeepSeek API 错误 (${aiRes.status}): ${errBody}`, user_message: userMsg });
      responseFinished = true;
      return res.end();
    }

    const reader = aiRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let aiContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;

        try {
          const parsed = JSON.parse(payload);
          const delta = parsed.choices?.[0]?.delta?.content || '';
          if (delta) {
            aiContent += delta;
            sendEvent(res, 'delta', { content: delta });
          }
        } catch {
          // 忽略 DeepSeek 流式分片中的非 JSON 行
        }
      }
    }

    const finalContent = aiContent.trim();
    if (!finalContent) {
      sendEvent(res, 'error', { error: 'DeepSeek 返回了空回复', user_message: userMsg });
      responseFinished = true;
      return res.end();
    }

    const { data: aiMsg, error: aiErr } = await supabaseAdmin
      .from('messages')
      .insert({ from_whom: 'keegan', content: finalContent })
      .select()
      .single();

    if (aiErr) {
      sendEvent(res, 'error', { error: aiErr.message, user_message: userMsg });
      responseFinished = true;
      return res.end();
    }

    sendEvent(res, 'done', { user_message: userMsg, ai_message: aiMsg });
    responseFinished = true;
    return res.end();
  } catch (e: any) {
    if (abortController.signal.aborted) {
      sendEvent(res, 'aborted', { ok: true });
      responseFinished = true;
      return res.end();
    }

    sendEvent(res, 'error', {
      error: `调用 DeepSeek 失败: ${e.message}`,
      user_message: userMsg,
    });
    responseFinished = true;
    return res.end();
  }
}
