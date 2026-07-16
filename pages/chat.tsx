import { GetServerSideProps } from 'next';
import { createClient } from '@supabase/supabase-js';
import { useState, useEffect, useRef, useCallback } from 'react';

type RecallMemory = {
  id: string;
  score: number;
  matched_by: string[];
  content_preview: string;
  tone: string;
  status: string;
};

type RecallInfo = {
  query: string;
  keywords: string[];
  memories: RecallMemory[];
};

type Message = {
  id: string;
  created_at: string;
  from_whom: 'keegan' | 'luz';
  content: string;
  conversation_id?: string | null;
  edited_at?: string | null;
  local_status?: 'streaming' | 'error';
  error_text?: string;
  retry_content?: string;
  recall_info?: RecallInfo | null;
};

type Conversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type ChatPageProps = {
  messages: Message[];
  conversations: Conversation[];
  activeConversationId: string;
};

const API_KEY = process.env.NEXT_PUBLIC_API_WRITE_KEY || '';
const DEFAULT_CONVERSATION_ID = '00000000-0000-0000-0000-000000000001';

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

function conversationTitle(conversation: Conversation | undefined) {
  return conversation?.title || '新的对话';
}

export default function ChatPage({
  messages: initialMessages,
  conversations: initialConversations,
  activeConversationId: initialConversationId,
}: ChatPageProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [activeConversationId, setActiveConversationId] = useState(initialConversationId);
  const [input, setInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [showConversations, setShowConversations] = useState(false);
  const [hasMore, setHasMore] = useState(initialMessages.length >= 50);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [expandedRecallIds, setExpandedRecallIds] = useState<Set<string>>(new Set());

  const toggleRecallPanel = useCallback((id: string) => {
    setExpandedRecallIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const generationIdRef = useRef<string | null>(null);
  const streamingIdRef = useRef<string | null>(null);
  const activeConversationIdRef = useRef(activeConversationId);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

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

  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  const loadMessages = useCallback(async (conversationId: string, options?: { silent?: boolean }) => {
    if (!options?.silent) setLoadingConversation(true);
    try {
      const res = await fetch(`/api/messages?conversation_id=${conversationId}&limit=50`);
      const data = await res.json();
      setMessages(data.messages || []);
      setHasMore(!!data.has_more);
      setEditingId(null);
      setEditingText('');
      window.setTimeout(() => scrollToBottom('auto'), 50);
    } finally {
      if (!options?.silent) setLoadingConversation(false);
    }
  }, [scrollToBottom]);

  const refreshConversations = useCallback(async () => {
    const res = await fetch('/api/conversations');
    const data = await res.json();
    if (data.conversations) setConversations(data.conversations);
  }, []);

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
        const conversationId = activeConversationIdRef.current;
        const res = await fetch(`/api/messages?conversation_id=${conversationId}&limit=10`);
        const data = await res.json();
        if (data.messages?.length > 0) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const optimisticContents = new Set(
              prev
                .filter((m) => m.id.startsWith('user-'))
                .map((m) => m.content),
            );
            const fresh = data.messages.filter((m: Message) => {
              if (existingIds.has(m.id)) return false;
              if (m.from_whom === 'luz' && optimisticContents.has(m.content)) return false;
              return true;
            });
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
      conversation_id: activeConversationIdRef.current,
      content: error,
      local_status: 'error',
      error_text: error,
      retry_content: retryContent,
    };
    setMessages((prev) => [...prev.filter((m) => m.local_status !== 'streaming'), errorMessage]);
    setTimeout(() => scrollToBottom('smooth'), 50);
  }, [scrollToBottom]);

  const cancelGeneration = useCallback(async (generationId: string | null) => {
    if (!generationId) return;
    await fetch('/api/generations/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({ generation_id: generationId }),
    }).catch(() => undefined);
  }, []);

  const runChat = useCallback(async (content: string, options?: { saveUser?: boolean }) => {
    const text = content.trim();
    if (!text || generating) return;

    const conversationId = activeConversationIdRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    generationIdRef.current = null;
    setGenerating(true);

    const now = Date.now();
    const shouldSaveUser = options?.saveUser !== false;
    const tempUserId = shouldSaveUser ? `user-${now}` : null;
    const tempId = `stream-${now}`;
    streamingIdRef.current = tempId;

    setMessages((prev) => {
      const base = prev.filter((m) => m.local_status !== 'error');
      const optimisticUser: Message[] = tempUserId
        ? [{
          id: tempUserId,
          created_at: new Date().toISOString(),
          from_whom: 'luz',
          conversation_id: conversationId,
          content: text,
        }]
        : [];

      return [
        ...base,
        ...optimisticUser,
        {
          id: tempId,
          created_at: new Date().toISOString(),
          from_whom: 'keegan',
          conversation_id: conversationId,
          content: '',
          local_status: 'streaming',
        },
      ];
    });
    setTimeout(() => scrollToBottom('smooth'), 50);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
        body: JSON.stringify({
          content: text,
          save_user: shouldSaveUser,
          conversation_id: conversationId,
        }),
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

          if (parsed.event === 'generation') {
            generationIdRef.current = parsed.data.id;
          }

          if (parsed.event === 'recall_info') {
            const info = parsed.data as RecallInfo;
            setMessages((prev) => prev.map((m) => (
              m.id === tempId ? { ...m, recall_info: info } : m
            )));
          }

          if (parsed.event === 'user_message') {
            const userMessage = parsed.data as Message;
            setMessages((prev) => {
              if (tempUserId) {
                return prev.map((m) => (m.id === tempUserId ? userMessage : m));
              }
              return upsertMessage(prev, userMessage);
            });
          }

          if (parsed.event === 'delta') {
            const delta = parsed.data.content || '';
            setMessages((prev) => prev.map((m) => (
              m.id === tempId ? { ...m, content: `${m.content}${delta}` } : m
            )));
            setTimeout(() => scrollToBottom('smooth'), 10);
          }

          if (parsed.event === 'aborted') {
            setMessages((prev) => prev.filter((m) => m.id !== tempId));
          }

          if (parsed.event === 'done') {
            setMessages((prev) => {
              const tempMsg = prev.find((m) => m.id === tempId);
              const recallInfo = tempMsg?.recall_info || null;
              const withoutTemp = prev.filter((m) => m.id !== tempId);
              const withUser = parsed.data.user_message
                ? upsertMessage(withoutTemp, parsed.data.user_message as Message)
                : withoutTemp;
              const aiMessage = { ...(parsed.data.ai_message as Message), recall_info: recallInfo };
              return upsertMessage(withUser, aiMessage);
            });
            refreshConversations();
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
      generationIdRef.current = null;
      streamingIdRef.current = null;
      setTimeout(() => scrollToBottom('smooth'), 80);
    }
  }, [appendError, cancelGeneration, generating, refreshConversations, scrollToBottom]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || generating) return;
    setInput('');
    await runChat(text, { saveUser: true });
  }, [generating, input, runChat]);

  const handleStop = useCallback(async () => {
    const generationId = generationIdRef.current;
    const streamingId = streamingIdRef.current;
    setMessages((prev) => prev.filter((m) => m.id !== streamingId));
    await cancelGeneration(generationId);
    abortRef.current?.abort();
  }, [cancelGeneration]);

  const handleRetry = useCallback((content: string) => {
    runChat(content, { saveUser: false });
  }, [runChat]);

  const deleteMessage = useCallback(async (id: string) => {
    if (id.startsWith('error-') || id.startsWith('stream-') || id.startsWith('user-')) return true;

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
      const res = await fetch(`/api/messages?conversation_id=${activeConversationId}&before=${firstId}&limit=50`);
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
  }, [activeConversationId, loadingMore, hasMore, messages]);

  const switchConversation = useCallback(async (conversationId: string) => {
    if (conversationId === activeConversationId || generating) return;
    setActiveConversationId(conversationId);
    setShowConversations(false);
    await loadMessages(conversationId);
  }, [activeConversationId, generating, loadMessages]);

  const createConversation = useCallback(async () => {
    if (generating) return;
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({}),
    });
    const conversation = await res.json();
    if (!res.ok) {
      appendError(conversation.error || '新建对话失败。', '');
      return;
    }
    setConversations((prev) => [conversation, ...prev]);
    setActiveConversationId(conversation.id);
    setMessages([]);
    setHasMore(false);
    setInput('');
    setShowConversations(false);
  }, [appendError, generating]);

  const deleteConversation = useCallback(async (conversation: Conversation) => {
    if (generating || conversations.length <= 1) return;
    const ok = window.confirm(`确定删除「${conversation.title}」吗？这段对话里的消息也会一起删除。`);
    if (!ok) return;

    const res = await fetch(`/api/conversations/${conversation.id}`, {
      method: 'DELETE',
      headers: { 'x-api-key': API_KEY },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      appendError(data.error || '删除对话失败。', '');
      return;
    }

    const remaining = conversations.filter((item) => item.id !== conversation.id);
    setConversations(remaining);

    if (conversation.id === activeConversationId) {
      const next = remaining[0];
      if (next) {
        setActiveConversationId(next.id);
        await loadMessages(next.id);
      } else {
        setMessages([]);
        setHasMore(false);
      }
    }
    setShowConversations(false);
  }, [activeConversationId, appendError, conversations, generating, loadMessages]);

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
    <div className="min-h-[100dvh] bg-forest-950 text-warm-100 flex">
      {/* ---- 桌面端侧边栏 ---- */}
      <aside className="hidden md:flex fixed left-0 top-12 bottom-0 w-64 bg-forest-950/95 border-r border-forest-700/30 flex-col z-20">
        <div className="p-4 border-b border-forest-700/30">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-warm-200">对话列表</h2>
            <button
              onClick={createConversation}
              disabled={generating}
              className="text-xs px-2.5 py-1 rounded-full border border-amber-300/25 text-amber-300 hover:bg-amber-300/10 disabled:opacity-40 transition-colors"
            >
              + 新建
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`group flex items-center gap-1.5 rounded-lg border px-2.5 py-2 transition-colors ${
                conversation.id === activeConversationId
                  ? 'border-amber-300/25 bg-amber-300/8'
                  : 'border-transparent hover:bg-forest-900/60'
              }`}
            >
              <button
                onClick={() => switchConversation(conversation.id)}
                disabled={generating || loadingConversation}
                className="min-w-0 flex-1 text-left disabled:opacity-40"
              >
                <p className="truncate text-[13px] text-warm-100">{conversation.title}</p>
                <p className="text-[10px] text-warm-200/30">
                  {new Date(conversation.updated_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                </p>
              </button>
              {conversations.length > 1 && (
                <button
                  onClick={() => deleteConversation(conversation)}
                  disabled={generating}
                  className="shrink-0 opacity-0 group-hover:opacity-100 px-1.5 py-0.5 rounded text-[10px] text-warm-200/30 hover:text-red-200 hover:bg-red-900/20 disabled:opacity-0 transition-opacity"
                >
                  删除
                </button>
              )}
            </div>
          ))}
        </div>
      </aside>

      {/* ---- 主聊天区 ---- */}
      <div className="flex-1 md:ml-64 flex flex-col min-h-[100dvh]">
      <div className="sticky top-0 z-20 bg-forest-950/95 backdrop-blur border-b border-forest-700/30 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-3 min-w-0">
          <button
            onClick={() => setShowConversations(true)}
            className="md:hidden shrink-0 px-2.5 py-1.5 rounded-full border border-forest-600 text-xs text-warm-200/70 hover:border-amber-300/40 hover:text-warm-100 transition-colors"
          >
            对话
          </button>
          <div className="min-w-0">
            <h1 className="text-base font-serif text-warm-100">💬 Chat</h1>
            <p className="text-xs text-warm-200/40 truncate">{conversationTitle(activeConversation)}</p>
          </div>
        </div>
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

        {loadingConversation && (
          <div className="text-center py-16 text-sm text-warm-200/40">正在打开对话…</div>
        )}

        {!loadingConversation && messages.length === 0 && (
          <div className="text-center py-20">
            <p className="text-4xl mb-4">💬</p>
            <p className="text-warm-200/40 text-sm">这段对话从这里开始</p>
          </div>
        )}

        {!loadingConversation && messages.map((msg, i) => {
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

                  {/* 召回调试面板 — 仅 AI 消息且有 recall_info 时显示 */}
                  {!isLuz && msg.recall_info && msg.recall_info.memories.length > 0 && (
                    <div className="mt-2 max-w-full">
                      <button
                        onClick={() => toggleRecallPanel(msg.id)}
                        className="flex items-center gap-1.5 text-[10px] text-warm-200/30 hover:text-amber-300/60 transition-colors"
                      >
                        <span>🧠</span>
                        <span>召回了 {msg.recall_info.memories.length} 条记忆</span>
                        <span className="text-warm-200/20">
                          {expandedRecallIds.has(msg.id) ? '收起 ▲' : '展开 ▼'}
                        </span>
                      </button>
                      {expandedRecallIds.has(msg.id) && (
                        <div className="mt-1.5 space-y-1.5 text-[10px] text-warm-200/40 border-l border-forest-700/40 pl-2.5">
                          {msg.recall_info.keywords.length > 0 && (
                            <div>
                              <span className="text-amber-300/40">关键词：</span>
                              <span>{msg.recall_info.keywords.slice(0, 8).join(' · ')}</span>
                            </div>
                          )}
                          {msg.recall_info.memories.map((mem) => (
                            <div key={mem.id} className="flex gap-1.5">
                              <span className="shrink-0 text-amber-300/50 font-mono">{mem.score.toFixed(1)}</span>
                              <span className="shrink-0 text-warm-200/25">
                                {mem.tone === 'warm' ? '暖' : mem.tone === 'cold' ? '冷' : '·'}/{mem.status === 'stable' ? '固' : '活'}
                              </span>
                              <span className="truncate text-warm-200/35">{mem.content_preview}</span>
                              <span className="shrink-0 text-amber-300/25">{mem.matched_by.join(',')}</span>
                            </div>
                          ))}
                        </div>
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

      {showConversations && (
        <div className="md:hidden fixed inset-0 z-30 bg-forest-950/20" onClick={() => setShowConversations(false)}>
          <div
            className="absolute inset-x-4 bottom-[calc(76px+env(safe-area-inset-bottom))] max-w-2xl mx-auto rounded-2xl border border-forest-700/50 bg-forest-950/98 shadow-2xl shadow-forest-950/60 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-forest-700/30">
              <div>
                <p className="text-sm text-warm-100">对话管理</p>
                <p className="text-xs text-warm-200/35">新建、切换或删除一段对话</p>
              </div>
              <button
                onClick={createConversation}
                disabled={generating}
                className="shrink-0 px-3 py-1.5 rounded-full bg-amber-300 text-forest-950 text-xs font-medium disabled:opacity-40"
              >
                新对话
              </button>
            </div>
            <div className="max-h-[42vh] overflow-y-auto p-2 space-y-1">
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={`flex items-center gap-2 rounded-xl border px-2 py-2 ${conversation.id === activeConversationId
                    ? 'border-amber-300/30 bg-amber-300/10'
                    : 'border-transparent hover:bg-forest-900/70'
                  }`}
                >
                  <button
                    onClick={() => switchConversation(conversation.id)}
                    disabled={generating || loadingConversation}
                    className="min-w-0 flex-1 text-left disabled:opacity-40"
                  >
                    <p className="truncate text-sm text-warm-100">{conversation.title}</p>
                    <p className="text-[11px] text-warm-200/35">{new Date(conversation.updated_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                  </button>
                  <button
                    onClick={() => deleteConversation(conversation)}
                    disabled={generating || conversations.length <= 1}
                    className="shrink-0 px-2 py-1 rounded-lg text-[11px] text-warm-200/35 hover:text-red-200 hover:bg-red-900/20 disabled:opacity-25"
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 md:left-64 z-20 bg-forest-950/95 backdrop-blur border-t border-forest-700/30 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="max-w-2xl mx-auto flex gap-2">
          <button
            onClick={() => setShowConversations((value) => !value)}
            className="shrink-0 px-3 py-2.5 bg-forest-900 border border-forest-700 text-warm-100 rounded-full text-sm hover:border-amber-300/40 transition-colors"
          >
            对话
          </button>
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
    </div>
  );
}

export const getServerSideProps: GetServerSideProps = async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return {
      props: {
        messages: [],
        conversations: [],
        activeConversationId: DEFAULT_CONVERSATION_ID,
      },
    };
  }

  const supabase = createClient(url, key);
  const fallbackConversation = {
    id: DEFAULT_CONVERSATION_ID,
    title: '旧日对话',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: conversationsData, error: conversationsError } = await supabase
    .from('conversations')
    .select('id, title, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(50);

  const conversations = conversationsData?.length ? conversationsData : [fallbackConversation];
  const activeConversationId = conversations[0]?.id || DEFAULT_CONVERSATION_ID;

  let messageQuery = supabase
    .from('messages')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(50);

  if (!conversationsError) {
    messageQuery = messageQuery.eq('conversation_id', activeConversationId);
  }

  const { data } = await messageQuery;

  return { props: { messages: data || [], conversations, activeConversationId } };
};
