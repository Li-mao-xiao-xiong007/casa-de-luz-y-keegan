import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authWrite } from '@/lib/auth';
import { formatMemoriesForPrompt, getRelevantMemories } from '@/lib/memory-recall';

type ChatRole = 'system' | 'user' | 'assistant';
type DeepSeekMessage = { role: ChatRole; content: string };

const DEFAULT_CONVERSATION_ID = '00000000-0000-0000-0000-000000000001';

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

async function updateGeneration(id: string | null, status: 'completed' | 'cancelled' | 'failed') {
  if (!supabaseAdmin || !id) return;
  await supabaseAdmin
    .from('chat_generations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'running');
}

async function isGenerationCancelled(id: string | null) {
  if (!supabaseAdmin || !id) return false;
  const { data } = await supabaseAdmin
    .from('chat_generations')
    .select('status')
    .eq('id', id)
    .single();
  return data?.status === 'cancelled';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'database not configured' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  if (!authWrite(req, res)) return;

  const { content, save_user = true, conversation_id } = req.body;
  if (!content || typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'missing required field: content' });
  }

  const text = content.trim();
  const shouldSaveUser = save_user !== false;
  const conversationId = typeof conversation_id === 'string' && conversation_id
    ? conversation_id
    : DEFAULT_CONVERSATION_ID;

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
  let generationId: string | null = null;

  try {
    const { data: generation, error: generationError } = await supabaseAdmin
      .from('chat_generations')
      .insert({ conversation_id: conversationId })
      .select('id, conversation_id, status, created_at')
      .single();

    if (generationError) {
      sendEvent(res, 'error', { error: generationError.message });
      responseFinished = true;
      return res.end();
    }

    generationId = generation.id;
    sendEvent(res, 'generation', generation);

    if (shouldSaveUser) {
      const { data, error } = await supabaseAdmin
        .from('messages')
        .insert({ from_whom: 'luz', content: text, conversation_id: conversationId })
        .select()
        .single();

      if (error) {
        await updateGeneration(generationId, 'failed');
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
    const configuredMemoryCount = parseInt(settings?.memory_context_count || '8');
    const memoryContextCount = Number.isFinite(configuredMemoryCount)
      ? Math.min(Math.max(configuredMemoryCount, 0), 20)
      : 8;

    if (!apiKey) {
      await updateGeneration(generationId, 'failed');
      sendEvent(res, 'error', { error: '未配置 DeepSeek API Key，请在设置页面填写', user_message: userMsg });
      responseFinished = true;
      return res.end();
    }

    const { data: history } = await supabaseAdmin
      .from('messages')
      .select('from_whom, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(Math.max(contextCount, 1));

    const recentMessages = (history || []).reverse();
    const recalledMemories = await getRelevantMemories(supabaseAdmin, {
      query: text,
      limit: memoryContextCount,
    });
    const memoryContext = formatMemoriesForPrompt(recalledMemories);
    const effectiveSystemPrompt = memoryContext
      ? `${systemPrompt}\n\n${memoryContext}`
      : systemPrompt;

    const deepseekMessages: DeepSeekMessage[] = [
      { role: 'system', content: effectiveSystemPrompt },
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
      await updateGeneration(generationId, 'failed');
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

      if (await isGenerationCancelled(generationId)) {
        abortController.abort();
        await updateGeneration(generationId, 'cancelled');
        sendEvent(res, 'aborted', { ok: true, generation_id: generationId });
        responseFinished = true;
        return res.end();
      }

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

    if (await isGenerationCancelled(generationId)) {
      await updateGeneration(generationId, 'cancelled');
      sendEvent(res, 'aborted', { ok: true, generation_id: generationId });
      responseFinished = true;
      return res.end();
    }

    const finalContent = aiContent.trim();
    if (!finalContent) {
      await updateGeneration(generationId, 'failed');
      sendEvent(res, 'error', { error: 'DeepSeek 返回了空回复', user_message: userMsg });
      responseFinished = true;
      return res.end();
    }

    const { data: aiMsg, error: aiErr } = await supabaseAdmin
      .from('messages')
      .insert({ from_whom: 'keegan', content: finalContent, conversation_id: conversationId })
      .select()
      .single();

    if (aiErr) {
      await updateGeneration(generationId, 'failed');
      sendEvent(res, 'error', { error: aiErr.message, user_message: userMsg });
      responseFinished = true;
      return res.end();
    }

    await supabaseAdmin
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);
    await updateGeneration(generationId, 'completed');

    sendEvent(res, 'done', { user_message: userMsg, ai_message: aiMsg, generation_id: generationId });
    responseFinished = true;
    return res.end();
  } catch (e: any) {
    if (abortController.signal.aborted) {
      await updateGeneration(generationId, 'cancelled');
      sendEvent(res, 'aborted', { ok: true, generation_id: generationId });
      responseFinished = true;
      return res.end();
    }

    await updateGeneration(generationId, 'failed');
    sendEvent(res, 'error', {
      error: `调用 DeepSeek 失败: ${e.message}`,
      user_message: userMsg,
    });
    responseFinished = true;
    return res.end();
  }
}
