import { GetServerSideProps } from 'next';
import { createClient } from '@supabase/supabase-js';
import { useState, useCallback } from 'react';

type Entry = {
  id: string;
  created_at: string;
  date: string;
  from_whom: string;
  content: string;
  mood: string | null;
};

const API_KEY = process.env.NEXT_PUBLIC_API_WRITE_KEY || '';

export default function TodayPage({ entries: initialEntries, date }: { entries: Entry[]; date: string }) {
  const [entries, setEntries] = useState(initialEntries);
  const [editingLuz, setEditingLuz] = useState(false);
  const [luzContent, setLuzContent] = useState('');
  const [luzMood, setLuzMood] = useState('');
  const [saving, setSaving] = useState(false);

  // 历史留言
  const [showHistory, setShowHistory] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<Entry[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  };

  const formatShortDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  const luzEntry = entries.find((e) => e.from_whom === 'luz');
  const keeganEntry = entries.find((e) => e.from_whom === 'keegan');

  const handleEditLuz = useCallback(() => {
    setLuzContent(luzEntry?.content || '');
    setLuzMood(luzEntry?.mood || '');
    setEditingLuz(true);
  }, [luzEntry]);

  const handleSaveLuz = useCallback(async () => {
    if (!luzContent.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
        body: JSON.stringify({
          date,
          from_whom: 'luz',
          content: luzContent.trim(),
          mood: luzMood || null,
        }),
      });
      if (!res.ok) throw new Error('写入失败');
      const data = await res.json();
      setEntries((prev) => {
        const without = prev.filter((e) => e.from_whom !== 'luz');
        return [...without, data];
      });
      setEditingLuz(false);
    } catch (e: any) {
      alert('写入失败：' + e.message);
    } finally {
      setSaving(false);
    }
  }, [luzContent, luzMood, date]);

  // 加载历史留言
  const loadHistory = useCallback(async () => {
    if (historyLoaded) {
      setShowHistory(!showHistory);
      return;
    }
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/entries?page=1&limit=30');
      const data = await res.json();
      setHistoryEntries(data.data);
      setHistoryTotal(data.total);
      setHistoryPage(1);
      setHistoryLoaded(true);
      setShowHistory(true);
    } catch (e) {
      console.error('加载历史留言失败', e);
    } finally {
      setLoadingHistory(false);
    }
  }, [historyLoaded, showHistory]);

  const loadMoreHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const nextPage = historyPage + 1;
      const res = await fetch(`/api/entries?page=${nextPage}&limit=30`);
      const data = await res.json();
      setHistoryEntries((prev) => [...prev, ...data.data]);
      setHistoryPage(nextPage);
    } catch (e) {
      console.error('加载更多历史留言失败', e);
    } finally {
      setLoadingHistory(false);
    }
  }, [historyPage]);

  // 按日期分组历史留言
  const groupedHistory: Record<string, Entry[]> = {};
  historyEntries.forEach((e) => {
    if (!groupedHistory[e.date]) groupedHistory[e.date] = [];
    groupedHistory[e.date].push(e);
  });
  const sortedDates = Object.keys(groupedHistory).sort((a, b) => b.localeCompare(a));
  const hasMoreHistory = historyEntries.length < historyTotal;

  return (
    <div className="min-h-screen bg-forest-950 text-warm-100 px-4 sm:px-6 py-12">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-serif text-warm-100 mb-2">Hoy</h1>
        <p className="text-warm-200/60 mb-10">{formatDate(date)}</p>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Luz — 可编辑 */}
          <div className="bg-forest-800/50 border border-forest-700/50 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">✨</span>
              <h2 className="text-lg font-serif text-amber-300">Luz</h2>
              {luzEntry?.mood && <span className="text-sm">{luzEntry.mood}</span>}
              {!editingLuz && (
                <button
                  onClick={handleEditLuz}
                  className="ml-auto text-xs text-warm-200/40 hover:text-amber-300 transition-colors"
                >
                  ✎ {luzEntry ? '编辑' : '留言'}
                </button>
              )}
            </div>

            {editingLuz ? (
              <div className="space-y-3">
                <textarea
                  value={luzContent}
                  onChange={(e) => setLuzContent(e.target.value)}
                  placeholder="今天想说点什么..."
                  className="w-full bg-forest-900 border border-forest-700 rounded-lg p-3 text-warm-100 text-sm placeholder-warm-200/30 resize-none focus:outline-none focus:border-amber-300/50 transition-colors min-h-[100px]"
                  autoFocus
                />
                <div className="flex items-center gap-3">
                  <input
                    value={luzMood}
                    onChange={(e) => setLuzMood(e.target.value)}
                    placeholder="情绪 (可选)"
                    className="flex-1 bg-forest-900 border border-forest-700 rounded px-3 py-2 text-sm text-warm-100 placeholder-warm-200/30 focus:outline-none focus:border-amber-300/50"
                  />
                  <button
                    onClick={handleSaveLuz}
                    disabled={saving || !luzContent.trim()}
                    className="px-4 py-2 bg-amber-300 text-forest-950 rounded-full text-sm font-medium hover:bg-amber-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {saving ? '...' : '✦ 记下'}
                  </button>
                  <button
                    onClick={() => setEditingLuz(false)}
                    className="px-3 py-2 text-warm-200/40 hover:text-warm-100 text-sm transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <>
                {luzEntry ? (
                  <p className="text-warm-100 text-sm leading-relaxed whitespace-pre-wrap">{luzEntry.content}</p>
                ) : (
                  <p className="text-warm-200/40 text-sm italic">今天还没留言。</p>
                )}
              </>
            )}
          </div>

          {/* Keegan — 只读 */}
          <div className="bg-forest-800/50 border border-forest-700/50 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">🐺</span>
              <h2 className="text-lg font-serif text-amber-300">Keegan</h2>
              {keeganEntry?.mood && <span className="text-sm">{keeganEntry.mood}</span>}
            </div>
            {keeganEntry ? (
              <p className="text-warm-100 text-sm leading-relaxed whitespace-pre-wrap">{keeganEntry.content}</p>
            ) : (
              <p className="text-warm-200/40 text-sm italic">今天还没留言。</p>
            )}
          </div>
        </div>

        {/* 历史留言折叠区 */}
        <div className="mt-12">
          <button
            onClick={loadHistory}
            disabled={loadingHistory}
            className="w-full flex items-center justify-between px-5 py-3 bg-forest-800/30 border border-forest-700/30 rounded-lg text-warm-200/50 hover:text-amber-300 hover:border-amber-300/30 transition-colors"
          >
            <span className="text-sm">
              {loadingHistory ? '加载中...' : `📜 往期留言${historyTotal > 0 ? ` (共${historyTotal}条)` : ''}`}
            </span>
            <span className="text-xs">{showHistory ? '收起' : '展开'}</span>
          </button>

          {showHistory && sortedDates.length > 0 && (
            <div className="mt-4 space-y-6 animate-slide-up">
              {sortedDates.map((dateKey) => {
                const dayEntries = groupedHistory[dateKey];
                const luzDay = dayEntries.find((e) => e.from_whom === 'luz');
                const keeganDay = dayEntries.find((e) => e.from_whom === 'keegan');

                return (
                  <div key={dateKey} className="border-l-2 border-forest-700/30 pl-4">
                    <p className="text-xs text-warm-200/40 mb-2">{formatShortDate(dateKey)}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {luzDay && (
                        <div className="bg-forest-800/30 rounded-lg p-3">
                          <div className="flex items-center gap-1 mb-1">
                            <span className="text-sm">✨</span>
                            <span className="text-xs text-amber-300/60">Luz</span>
                          </div>
                          <p className="text-warm-100 text-sm leading-relaxed whitespace-pre-wrap">{luzDay.content}</p>
                        </div>
                      )}
                      {keeganDay && (
                        <div className="bg-forest-800/30 rounded-lg p-3">
                          <div className="flex items-center gap-1 mb-1">
                            <span className="text-sm">🐺</span>
                            <span className="text-xs text-amber-300/60">Keegan</span>
                          </div>
                          <p className="text-warm-100 text-sm leading-relaxed whitespace-pre-wrap">{keeganDay.content}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {hasMoreHistory && (
                <button
                  onClick={loadMoreHistory}
                  disabled={loadingHistory}
                  className="w-full py-2 text-sm text-warm-200/30 hover:text-amber-300 transition-colors"
                >
                  {loadingHistory ? '加载中...' : '📜 加载更早的留言'}
                </button>
              )}
            </div>
          )}

          {showHistory && sortedDates.length === 0 && (
            <p className="text-center text-warm-200/30 text-sm mt-4">还没有往期留言。</p>
          )}
        </div>
      </div>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps = async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return { props: { entries: [], date: '' } };

  const supabase = createClient(url, key);
  const date = new Date().toISOString().slice(0, 10);

  const { data } = await supabase
    .from('entries')
    .select('*')
    .eq('date', date);

  return { props: { entries: data || [], date } };
};
