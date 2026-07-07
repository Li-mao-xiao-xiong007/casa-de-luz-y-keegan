import { GetServerSideProps } from 'next';
import { createClient } from '@supabase/supabase-js';
import { useState, useEffect, useRef, useCallback } from 'react';

type Message = {
  id: string;
  created_at: string;
  from_whom: 'keegan' | 'luz';
  content: string;
  edited_at?: string | null;
  local_status?: 'streaming' | 'error';
  error_text?: string;
  retry_content?: string;
};

const API_KEY = process.env.NEXT_PUBLIC_API_WRITE_KEY || '';

function isSameDay(a: string, b: string) {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function formatDateLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = today.getTime() - target.getTime();
  const days = Math.floor(diff / 86400000);

  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  return d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function upsertMessage(list: Message[], message: Message) {
  const index = list.findIndex((m) => m.id === message.id);
  if (index === -1) return [...list, message];
  const copy = [...list];
  copy[index] = { ...copy[index], ...message };
  return copy;
}

function parseStreamEvent(raw: string) {
  let event = 'message';
  let data = '';

  raw.split('\n').forEach((line) => {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    if (line.startsWith('data:')) data += line.slice(5).trim();
  });

  if (!data) return null;

  try {
    return { event, data: JSON.parse(data) };
  } catch {
    return null;
  }
}

export default function ChatPage({ messages: initialMessages }: { messages: Message[] }) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialMessages.length >= 50);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamingIdRef = useRef<string | null>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
    });
  }, []);

  const settleKeyboardAndScroll = useCallback(() => {
    scrollToBottom('smooth');
    window.setTimeout(() => scrollToBottom('smooth'), 120);
    window.setTimeout(() => scrollToBottom('smooth'), 320);
  }, [scrollToBottom]);

  useEffect(() => {
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ block: 'end' });
    });
  }, []);

  useEffect(() => {
    const onResize = () => settleKeyboardAndScroll();
    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener('resize', onResize);
    visualViewport?.addEventListener('scroll', onResize);
    window.addEventListener('resize', onResize);

    return () => {
      visualViewport?.removeEventListener('resize', onResize);
      visualViewport?.removeEventListener('scroll', onResize);
      window.removeEventListener('resize', onResize);
    };
  }, [settleKeyboardAndScroll]);

  useEffect(() => {
    const poll = setInterval(async () => {
      if (generating) return;
      try {
        const res = await fetch('/api/messages?limit=10');
        const data = await res.json();
        if (data.messages?.length > 0) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const fresh = data.messages.filter((m: Message) => !existingIds.has(m.id));
            if (fresh.length === 0) return prev;
            setTimeout(() => scrollToBottom('smooth'), 100);
            return [...prev, ...fresh];
          });
        }
      } catch {
        // 轮询失败静默忽略
      }
    }, 30000);

    return () => clearInterval(poll);
  }, [generating, scrollToBottom]);

  const appendError = useCallback((error: string, retryContent: string) => {
    const errorMessage: Message = {
      id: `error-${Date.now()}`,
      created_at: new Date().toISOString(),
      from_whom: 'keegan',
      content: error,
      local_status: 'error',
      error_text: error,
      retry_content: retryContent,
    };
    setMessages((prev) => [...prev.filter((m) => m.local_status !== 'streaming'), errorMessage]);
    setTimeout(() => scrollToBottom('smooth'), 50);
  }, [scrollToBottom]);

  const runChat = useCallback(async (content: string, options?: { saveUser?: boolean }) => {
    const text = content.trim();
    if (!text || generating) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setGenerating(true);

    const tempId = `stream-${Date.now()}`;
    streamingIdRef.current = tempId;

    setMessages((prev) => [
      ...prev.filter((m) => m.local_status !== 'error'),
      {
        id: tempId,
        created_at: new Date().toISOString(),
        from_whom: 'keegan',
        content: '',
        local_status: 'streaming',
      },
    ]);
    setTimeout(() => scrollToBottom('smooth'), 50);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
        body: JSON.stringify({ content: text, save_user: options?.saveUser !== false }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`请求失败 (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || '';

        for (const chunk of chunks) {
          const parsed = parseStreamEvent(chunk);
          if (!parsed) continue;

          if (parsed.event === 'user_message') {
            setMessages((prev) => upsertMessage(prev, parsed.data as Message));
          }

          if (parsed.event === 'delta') {
            const delta = parsed.data.content || '';
            setMessages((prev) => prev.map((m) => (
              m.id === tempId ? { ...m, content: `${m.content}${delta}` } : m
            )));
            setTimeout(() => scrollToBottom('smooth'), 10);
          }

          if (parsed.event === 'done') {
            setMessages((prev) => {
              const withoutTemp = prev.filter((m) => m.id !== tempId);
              const withUser = parsed.data.user_message
                ? upsertMessage(withoutTemp, parsed.data.user_message as Message)
                : withoutTemp;
              return upsertMessage(withUser, parsed.data.ai_message as Message);
            });
          }

          if (parsed.event === 'error') {
            appendError(parsed.data.error || 'AI 回复失败，可以重试。', text);
          }
        }
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        return;
      }
      appendError(e.message || 'AI 回复失败，可以重试。', text);
    } finally {
      setGenerating(false);
      abortRef.current = null;
      streamingIdRef.current = null;
      setTimeout(() => scrollToBottom('smooth'), 80);
    }
  }, [appendError, generating, scrollToBottom]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || generating) return;
    setInput('');
    await runChat(text, { saveUser: true });
  }, [generating, input, runChat]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleRetry = useCallback((content: string) => {
    runChat(content, { saveUser: false });
  }, [runChat]);

  const deleteMessage = useCallback(async (id: string) => {
    if (id.startsWith('error-') || id.startsWith('stream-')) return true;

    const res = await fetch(`/api/messages/${id}`, {
      method: 'DELETE',
      headers: { 'x-api-key': API_KEY },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      appendError(data.error || '删除旧回复失败。', '');
      return false;
    }

    return true;
  }, [appendError]);

  const findPreviousLuzMessage = useCallback((index: number) => {
    for (let i = index - 1; i >= 0; i -= 1) {
      if (messages[i]?.from_whom === 'luz') return messages[i];
    }
    return null;
  }, [messages]);

  const handleRegenerate = useCallback(async (index: number) => {
    const prompt = findPreviousLuzMessage(index);
    const target = messages[index];
    if (!prompt || !target || generating) return;

    const deleted = await deleteMessage(target.id);
    if (!deleted) return;

    setMessages((prev) => prev.filter((m) => m.id !== target.id));
    runChat(prompt.content, { saveUser: false });
  }, [deleteMessage, findPreviousLuzMessage, generating, messages, runChat]);

  const startEdit = useCallback((message: Message) => {
    if (generating || message.from_whom !== 'luz') return;
    setEditingId(message.id);
    setEditingText(message.content);
  }, [generating]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingText('');
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingId || !editingText.trim()) return;
    const originalIndex = messages.findIndex((m) => m.id === editingId);
    const original = messages[originalIndex];
    if (!original) return;
    const nextReply = messages[originalIndex + 1]?.from_whom === 'keegan'
      ? messages[originalIndex + 1]
      : null;

    const res = await fetch(`/api/messages/${editingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({ content: editingText }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      appendError(data.error || '消息编辑失败。', original.content);
      return;
    }

    const updated = await res.json();

    if (nextReply) {
      const deleted = await deleteMessage(nextReply.id);
      if (!deleted) return;
    }

    setMessages((prev) => {
      const withoutOldReply = nextReply ? prev.filter((m) => m.id !== nextReply.id) : prev;
      return upsertMessage(withoutOldReply, updated);
    });
    setEditingId(null);
    setEditingText('');
    await runChat(updated.content, { saveUser: false });
  }, [appendError, deleteMessage, editingId, editingText, messages, runChat]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const firstId = messages[0]?.id;
      const res = await fetch(`/api/messages?before=${firstId}&limit=50`);
      const data = await res.json();
      if (data.messages?.length > 0) {
        setMessages((prev) => [...data.messages, ...prev]);
      }
      setHasMore(data.has_more);
    } catch (e) {
      console.error('加载更多失败', e);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, messages]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const inputBottomPadding = 'calc(88px + env(safe-area-inset-bottom))';

  return (
    <div className="min-h-[100dvh] bg-forest-950 text-warm-100 flex flex-col overflow-hidden">
      <div className="sticky top-0 z-20 bg-forest-950/95 backdrop-blur border-b border-forest-700/30 px-4 py-3">
        <h1 className="text-lg font-serif text-warm-100">💬 Chat</h1>
        <p className="text-xs text-warm-200/40">只有你和我知道的对话</p>
      </div>

      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-4 py-4 max-w-2xl mx-auto w-full"
        style={{ paddingBottom: inputBottomPadding }}
      >
        {hasMore && (
          <div className="text-center mb-4">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="text-xs text-warm-200/40 hover:text-amber-300 transition-colors disabled:opacity-40"
            >
              {loadingMore ? '加载中…' : '↑ 加载更早的消息'}
            </button>
          </div>
        )}

        {messages.length === 0 && (
          <div className="text-center py-20">
            <p className="text-4xl mb-4">💬</p>
            <p className="text-warm-200/40 text-sm">你们的第一条对话从这里开始</p>
          </div>
        )}

        {messages.map((msg, i) => {
          const isLuz = msg.from_whom === 'luz';
          const prev = i > 0 ? messages[i - 1] : null;
          const showDateSep = !prev || !isSameDay(prev.created_at, msg.created_at);
          const isEditing = editingId === msg.id;
          const canRegenerate = !isLuz && !msg.local_status && !!findPreviousLuzMessage(i);

          return (
            <div key={msg.id}>
              {showDateSep && (
                <div className="flex items-center gap-3 my-6">
                  <div className="flex-1 h-px bg-forest-700/30" />
                  <span className="text-xs text-warm-200/30 whitespace-nowrap">
                    {formatDateLabel(msg.created_at)}
                  </span>
                  <div className="flex-1 h-px bg-forest-700/30" />
                </div>
              )}

              <div className={`flex mb-3 ${isLuz ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[82%] ${isLuz ? 'items-end' : 'items-start'} flex flex-col`}>
                  <div className={`flex items-center gap-1.5 mb-1 ${isLuz ? 'flex-row-reverse' : 'flex-row'}`}>
                    <span className="text-sm">{isLuz ? '✨' : '🐺'}</span>
                    <span className="text-xs text-warm-200/40">
                      {formatTime(msg.created_at)}{msg.edited_at ? ' · 已编辑' : ''}
                    </span>
                  </div>

                  <div
                    className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap
                      ${isLuz
                        ? 'bg-amber-300/15 border border-amber-300/20 rounded-br-md'
                        : msg.local_status === 'error'
                          ? 'bg-red-900/30 border border-red-400/30 rounded-bl-md text-red-100'
                          : 'bg-forest-800/60 border border-forest-700/30 rounded-bl-md'
                      }`}
                  >
                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          className="w-full min-h-[86px] bg-forest-950/60 border border-amber-300/20 rounded-xl px-3 py-2 text-sm text-warm-100 placeholder-warm-200/30 focus:outline-none focus:border-amber-300/50"
                          autoFocus
                        />
                        <div className="flex justify-end gap-2">
                          <button onClick={cancelEdit} className="text-xs text-warm-200/50 hover:text-warm-100">取消</button>
                          <button onClick={saveEdit} className="text-xs text-amber-300 hover:text-amber-200">保存并重答</button>
                        </div>
                      </div>
                    ) : msg.local_status === 'streaming' && !msg.content ? (
                      <div className="flex gap-1.5 py-1.5">
                        <span className="w-1.5 h-1.5 bg-amber-300/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-amber-300/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 bg-amber-300/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    ) : (
                      msg.content
                    )}
                  </div>

                  {!isEditing && (
                    <div className={`mt-1.5 flex gap-3 text-[11px] text-warm-200/35 ${isLuz ? 'justify-end' : 'justify-start'}`}>
                      {isLuz && !msg.local_status && (
                        <button onClick={() => startEdit(msg)} disabled={generating} className="hover:text-amber-300 disabled:opacity-30">
                          编辑
                        </button>
                      )}
                      {canRegenerate && (
                        <button onClick={() => handleRegenerate(i)} disabled={generating} className="hover:text-amber-300 disabled:opacity-30">
                          重新生成
                        </button>
                      )}
                      {msg.local_status === 'error' && msg.retry_content && (
                        <button onClick={() => handleRetry(msg.retry_content || '')} disabled={generating} className="hover:text-amber-300 disabled:opacity-30">
                          重试
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-20 bg-forest-950/95 backdrop-blur border-t border-forest-700/30 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="max-w-2xl mx-auto flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={settleKeyboardAndScroll}
            placeholder="在这里写消息…"
            className="flex-1 min-w-0 bg-forest-900 border border-forest-700 rounded-full px-4 py-2.5 text-sm text-warm-100 placeholder-warm-200/30 focus:outline-none focus:border-amber-300/50 transition-colors"
          />
          {generating ? (
            <button
              onClick={handleStop}
              className="px-4 py-2.5 bg-forest-800 border border-forest-700 text-warm-100 rounded-full text-sm hover:border-amber-300/40 transition-colors"
            >
              停止
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="px-5 py-2.5 bg-amber-300 text-forest-950 rounded-full text-sm font-medium hover:bg-amber-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              发送
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps = async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return { props: { messages: [] } };

  const supabase = createClient(url, key);
  const { data } = await supabase
    .from('messages')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(50);

  return { props: { messages: data || [] } };
};
