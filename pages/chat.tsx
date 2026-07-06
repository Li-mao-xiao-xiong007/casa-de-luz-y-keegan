import { GetServerSideProps } from 'next';
import { createClient } from '@supabase/supabase-js';
import { useState, useEffect, useRef, useCallback } from 'react';

type Message = {
  id: string;
  created_at: string;
  from_whom: 'keegan' | 'luz';
  content: string;
};

const API_KEY = process.env.NEXT_PUBLIC_API_WRITE_KEY || '';

// ── 日期格式工具 ──
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

export default function ChatPage({ messages: initialMessages }: { messages: Message[] }) {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialMessages.length >= 50);

  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // 首次加载滚到底
  useEffect(() => {
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView();
    });
  }, []);

  // 30 秒轮询拉新消息
  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const res = await fetch('/api/messages?limit=10');
        const data = await res.json();
        if (data.messages?.length > 0) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const fresh = data.messages.filter((m: Message) => !existingIds.has(m.id));
            if (fresh.length === 0) return prev;
            const updated = [...prev, ...fresh];
            setTimeout(scrollToBottom, 100);
            return updated;
          });
        }
      } catch (e) {
        // 轮询失败静默忽略
      }
    }, 30000);

    return () => clearInterval(poll);
  }, [messages, scrollToBottom]);

  // 发送消息 → 调用 /api/chat（自动触发 Keegan 回复）
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    setAiThinking(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
        body: JSON.stringify({ content: text }),
      });
      const data = await res.json();

      if (data.user_message) {
        setMessages((prev) => [...prev, data.user_message]);
      }
      if (data.ai_message) {
        setMessages((prev) => [...prev, data.ai_message]);
      } else if (data.error) {
        // AI 没回复但有错误提示，显示给用户
        setMessages((prev) => [
          ...prev,
          {
            id: 'error-' + Date.now(),
            created_at: new Date().toISOString(),
            from_whom: 'keegan',
            content: `⚠️ ${data.error}`,
          },
        ]);
      }

      setInput('');
      setTimeout(scrollToBottom, 50);
    } catch (e: any) {
      alert('发送失败：' + e.message);
    } finally {
      setSending(false);
      setAiThinking(false);
    }
  }, [input, sending, scrollToBottom]);

  // 加载更早的消息
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

  // 键盘：Enter 发送
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="min-h-screen bg-forest-950 text-warm-100 flex flex-col">
      {/* 顶部标题栏 */}
      <div className="sticky top-0 z-20 bg-forest-950/95 backdrop-blur border-b border-forest-700/30 px-4 py-3">
        <h1 className="text-lg font-serif text-warm-100">💬 Chat</h1>
        <p className="text-xs text-warm-200/40">只有你和我知道的对话</p>
      </div>

      {/* 消息列表 */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-4 py-4 max-w-2xl mx-auto w-full"
      >
        {/* 加载更多 */}
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

        {/* 空状态 */}
        {messages.length === 0 && (
          <div className="text-center py-20">
            <p className="text-4xl mb-4">💬</p>
            <p className="text-warm-200/40 text-sm">你们的第一条对话从这里开始</p>
          </div>
        )}

        {/* 消息气泡 */}
        {messages.map((msg, i) => {
          const isLuz = msg.from_whom === 'luz';
          const prev = i > 0 ? messages[i - 1] : null;
          const showDateSep = !prev || !isSameDay(prev.created_at, msg.created_at);

          return (
            <div key={msg.id}>
              {/* 日期分隔符 */}
              {showDateSep && (
                <div className="flex items-center gap-3 my-6">
                  <div className="flex-1 h-px bg-forest-700/30" />
                  <span className="text-xs text-warm-200/30 whitespace-nowrap">
                    {formatDateLabel(msg.created_at)}
                  </span>
                  <div className="flex-1 h-px bg-forest-700/30" />
                </div>
              )}

              {/* 气泡行 */}
              <div className={`flex mb-2 ${isLuz ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] ${isLuz ? 'items-end' : 'items-start'} flex flex-col`}>
                  {/* 头像 + 时间 */}
                  <div className={`flex items-center gap-1.5 mb-1 ${isLuz ? 'flex-row-reverse' : 'flex-row'}`}>
                    <span className="text-sm">{isLuz ? '✨' : '🐺'}</span>
                    <span className="text-xs text-warm-200/40">{formatTime(msg.created_at)}</span>
                  </div>
                  {/* 气泡 */}
                  <div
                    className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap
                      ${isLuz
                        ? 'bg-amber-300/15 border border-amber-300/20 rounded-br-md'
                        : 'bg-forest-800/60 border border-forest-700/30 rounded-bl-md'
                      }`}
                  >
                    {msg.content}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* AI 正在思考 */}
        {aiThinking && (
          <div className="flex justify-start mb-2">
            <div className="max-w-[75%] flex flex-col items-start">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-sm">🐺</span>
                <span className="text-xs text-warm-200/40">正在思考…</span>
              </div>
              <div className="px-4 py-2.5 rounded-2xl rounded-bl-md bg-forest-800/60 border border-forest-700/30">
                <div className="flex gap-1.5">
                  <span className="w-1.5 h-1.5 bg-amber-300/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-amber-300/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-amber-300/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 滚动锚点 */}
        <div ref={bottomRef} />
      </div>

      {/* 输入框 */}
      <div className="sticky bottom-0 z-20 bg-forest-950/95 backdrop-blur border-t border-forest-700/30 px-4 py-3">
        <div className="max-w-2xl mx-auto flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="在这里写消息…"
            className="flex-1 bg-forest-900 border border-forest-700 rounded-full px-4 py-2.5 text-sm text-warm-100 placeholder-warm-200/30 focus:outline-none focus:border-amber-300/50 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="px-5 py-2.5 bg-amber-300 text-forest-950 rounded-full text-sm font-medium hover:bg-amber-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {sending ? '…' : '发送'}
          </button>
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
