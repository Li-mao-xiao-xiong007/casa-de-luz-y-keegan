import { GetServerSideProps } from 'next';
import { createClient } from '@supabase/supabase-js';
import { useState, useCallback } from 'react';

type Pawprint = {
  id: string;
  created_at: string;
  content: string;
  tags: string[];
};

const API_KEY = process.env.NEXT_PUBLIC_API_WRITE_KEY || '';

export default function PawprintsPage({ pawprints: initialPawprints, total: initialTotal }: { pawprints: Pawprint[]; total: number }) {
  const [pawprints, setPawprints] = useState(initialPawprints);
  const [total, setTotal] = useState(initialTotal);
  const [showForm, setShowForm] = useState(false);
  const [content, setContent] = useState('');
  const [mood, setMood] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const handleSubmit = useCallback(async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/pawprints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
        body: JSON.stringify({ content: content.trim(), mood: mood || undefined }),
      });
      if (!res.ok) throw new Error('写入失败');
      const data = await res.json();
      setPawprints((prev) => [data, ...prev]);
      setTotal((t) => t + 1);
      setContent('');
      setMood('');
      setShowForm(false);
    } catch (e: any) {
      alert('写入失败：' + e.message);
    } finally {
      setSaving(false);
    }
  }, [content, mood]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await fetch(`/api/pawprints?page=${nextPage}&limit=20`);
      const data = await res.json();
      setPawprints((prev) => [...prev, ...data.data]);
      setPage(nextPage);
    } catch (e) {
      console.error('加载更多失败', e);
    } finally {
      setLoadingMore(false);
    }
  }, [page]);

  const hasMore = pawprints.length < total;

  return (
    <div className="min-h-screen bg-forest-950 text-warm-100 px-4 sm:px-6 py-12">
      <div className="max-w-xl mx-auto">
        {/* 标题栏 */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-serif text-warm-100">🐾 Pawprints</h1>
            <p className="text-warm-200/50 text-sm mt-1">大灰狼留下的痕迹</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-300/10 border border-amber-300/30 rounded-full text-amber-300 text-sm hover:bg-amber-300/20 transition-colors"
          >
            {showForm ? '✕ 取消' : '🐾 留个印'}
          </button>
        </div>

        {/* 写入表单 */}
        {showForm && (
          <div className="mb-8 bg-forest-800/80 border border-amber-300/20 rounded-lg p-5 animate-slide-up">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="随便写点什么...一个想法、一句废话、一个emoji都行"
              className="w-full bg-forest-900 border border-forest-700 rounded-lg p-4 text-warm-100 text-sm placeholder-warm-200/30 resize-none focus:outline-none focus:border-amber-300/50 transition-colors min-h-[80px]"
              autoFocus
            />
            <div className="flex items-center gap-3 mt-3">
              <input
                value={mood}
                onChange={(e) => setMood(e.target.value)}
                placeholder="mood (可选)"
                className="flex-1 bg-forest-900 border border-forest-700 rounded px-3 py-2 text-sm text-warm-100 placeholder-warm-200/30 focus:outline-none focus:border-amber-300/50"
              />
              <button
                onClick={handleSubmit}
                disabled={saving || !content.trim()}
                className="px-5 py-2 bg-amber-300 text-forest-950 rounded-full text-sm font-medium hover:bg-amber-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? '...' : '🐾'}
              </button>
            </div>
          </div>
        )}

        {/* 爪印列表 */}
        {pawprints.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-4xl mb-4">🐺</p>
            <p className="text-warm-200/40 text-sm">还没有爪印，大灰狼还没来过。</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pawprints.map((p, i) => (
              <div
                key={p.id}
                className="bg-forest-800/40 border border-forest-700/30 rounded-lg p-4 animate-slide-up"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <p className="text-warm-100 text-sm leading-relaxed whitespace-pre-wrap">{p.content}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-warm-200/40">{formatTime(p.created_at)}</span>
                  {p.tags?.map((t) => (
                    <span key={t} className="text-xs bg-forest-700 text-amber-300/60 px-2 py-0.5 rounded">{t}</span>
                  ))}
                </div>
              </div>
            ))}

            {/* 加载更多 */}
            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full py-3 text-sm text-warm-200/40 hover:text-amber-300 border border-forest-700/30 rounded-lg transition-colors disabled:opacity-40"
              >
                {loadingMore ? '加载中...' : '🐾 加载更早的爪印'}
              </button>
            )}
          </div>
        )}

        {/* 统计 */}
        {total > 0 && (
          <p className="text-center text-xs text-warm-200/30 mt-8">共 {total} 个爪印</p>
        )}
      </div>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps = async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return { props: { pawprints: [], total: 0 } };

  const supabase = createClient(url, key);

  const { data, count } = await supabase
    .from('memories')
    .select('*', { count: 'exact' })
    .eq('type', 'note')
    .order('created_at', { ascending: false })
    .limit(20);

  return { props: { pawprints: data || [], total: count || 0 } };
};
