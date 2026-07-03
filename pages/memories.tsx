import { GetServerSideProps } from 'next';
import { createClient } from '@supabase/supabase-js';
import { useState, useCallback } from 'react';

const LAYERS = ['', 'basic', 'relation', 'dynamic', 'private', 'moment'] as const;
const LAYER_LABELS: Record<string, string> = {
  '': '全部',
  basic: '基础',
  relation: '关系',
  dynamic: '动态',
  private: '私密',
  moment: '瞬间',
};

type Memory = {
  id: string;
  created_at: string;
  type: string;
  layer: string;
  content: string;
  source: string;
  tags: string[];
};

const API_KEY = process.env.NEXT_PUBLIC_API_WRITE_KEY || '';

export default function MemoriesPage({ memories: initialMemories }: { memories: Memory[] }) {
  const [memories, setMemories] = useState(initialMemories);
  const [layerFilter, setLayerFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ content: '', layer: 'moment', tags: '', mood: '' });

  // 编辑状态：正在编辑哪条记忆、临时编辑内容
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const filtered = layerFilter
    ? memories.filter((m) => m.layer === layerFilter)
    : memories;

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const typeEmoji: Record<string, string> = {
    thought: '🌙',
    observation: '👁',
    summary: '📝',
    message: '✉️',
  };

  // 写入新记忆
  const handleSubmit = useCallback(async () => {
    if (!form.content.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
        body: JSON.stringify({
          type: 'message',
          layer: form.layer,
          content: form.content.trim(),
          source: 'luz',
          tags: form.tags ? form.tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean) : [],
          meta: form.mood ? { mood: form.mood } : undefined,
        }),
      });
      if (!res.ok) throw new Error('写入失败');
      const memory = await res.json();
      setMemories((prev) => [memory, ...prev]);
      setForm({ content: '', layer: 'moment', tags: '', mood: '' });
      setShowForm(false);
    } catch (e: any) {
      alert('写入失败：' + e.message);
    } finally {
      setSaving(false);
    }
  }, [form]);

  // 开始编辑某条记忆
  const startEdit = useCallback((m: Memory) => {
    setEditingId(m.id);
    setEditContent(m.content);
  }, []);

  // 保存编辑
  const saveEdit = useCallback(async () => {
    if (!editingId || !editContent.trim()) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/memory/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
        body: JSON.stringify({ content: editContent.trim() }),
      });
      if (!res.ok) throw new Error('更新失败');
      const updated = await res.json();
      setMemories((prev) => prev.map((m) => m.id === editingId ? { ...m, ...updated } : m));
      setEditingId(null);
      setEditContent('');
    } catch (e: any) {
      alert('更新失败：' + e.message);
    } finally {
      setEditSaving(false);
    }
  }, [editingId, editContent]);

  // 删除记忆
  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('确定要删除这条记忆吗？')) return;
    try {
      const res = await fetch(`/api/memory/${id}`, {
        method: 'DELETE',
        headers: { 'x-api-key': API_KEY },
      });
      if (!res.ok) throw new Error('删除失败');
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch (e: any) {
      alert('删除失败：' + e.message);
    }
  }, []);

  return (
    <div className="min-h-screen bg-forest-950 text-warm-100 px-6 py-12">
      <div className="max-w-2xl mx-auto">
        {/* 标题栏 */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-serif text-warm-100">Memorias</h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-300/10 border border-amber-300/30 rounded-full text-amber-300 text-sm hover:bg-amber-300/20 transition-colors"
          >
            {showForm ? '✕ 取消' : '✦ 写下此刻'}
          </button>
        </div>

        {/* 写入表单 */}
        {showForm && (
          <div className="mb-8 bg-forest-800/80 border border-amber-300/20 rounded-lg p-5 animate-slide-up">
            <textarea
              value={form.content}
              onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
              placeholder="这一刻，有什么值得记住的..."
              className="w-full bg-forest-900 border border-forest-700 rounded-lg p-4 text-warm-100 text-sm placeholder-warm-200/30 resize-none focus:outline-none focus:border-amber-300/50 transition-colors min-h-[120px]"
            />
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="text-xs text-warm-200/50 mb-1 block">层级</label>
                <select
                  value={form.layer}
                  onChange={(e) => setForm((p) => ({ ...p, layer: e.target.value }))}
                  className="w-full bg-forest-900 border border-forest-700 rounded px-3 py-2 text-sm text-warm-100 focus:outline-none focus:border-amber-300/50"
                >
                  <option value="moment">瞬间</option>
                  <option value="basic">基础</option>
                  <option value="relation">关系</option>
                  <option value="dynamic">动态</option>
                  <option value="private">私密</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-warm-200/50 mb-1 block">标签（逗号分隔）</label>
                <input
                  value={form.tags}
                  onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))}
                  placeholder="如：日常,瞬间"
                  className="w-full bg-forest-900 border border-forest-700 rounded px-3 py-2 text-sm text-warm-100 placeholder-warm-200/30 focus:outline-none focus:border-amber-300/50"
                />
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <button
                onClick={handleSubmit}
                disabled={saving || !form.content.trim()}
                className="px-5 py-2 bg-amber-300 text-forest-950 rounded-full text-sm font-medium hover:bg-amber-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? '记录中...' : '✦ 记下来'}
              </button>
            </div>
          </div>
        )}

        {/* 层级筛选 */}
        <div className="flex gap-2 mb-8 flex-wrap">
          {LAYERS.map((l) => (
            <button
              key={l}
              onClick={() => setLayerFilter(l)}
              className={`px-3 py-1 text-sm rounded-full border transition-colors
                ${layerFilter === l
                  ? 'border-amber-300 text-amber-300 bg-amber-300/10'
                  : 'border-forest-700 text-warm-200 hover:border-amber-300/50'
                }`}
            >
              {LAYER_LABELS[l]}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <p className="text-warm-200/60 text-center py-20">还没有记忆，Keegan 还没来过呢。</p>
        ) : (
          <div className="space-y-4">
            {filtered.map((m, i) => (
              <div
                key={m.id}
                className="bg-forest-800/50 border border-forest-700/50 rounded-lg p-5 animate-slide-up group"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                {/* 卡片头部 */}
                <div className="flex items-center gap-2 text-xs text-warm-200/60 mb-2">
                  <span>{typeEmoji[m.type] || '·'}</span>
                  <span>{m.source === 'keegan' ? 'Keegan' : m.source === 'luz' ? 'Luz' : 'API'}</span>
                  <span>·</span>
                  <span>{formatDate(m.created_at)}</span>
                  <span>·</span>
                  <span className="text-amber-300/60">{LAYER_LABELS[m.layer]}</span>
                  {/* 编辑/删除按钮 — 悬浮时显示 */}
                  {editingId !== m.id && (
                    <>
                      <button
                        onClick={() => startEdit(m)}
                        className="ml-auto text-xs text-warm-200/50 hover:text-amber-300 transition-colors"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => handleDelete(m.id)}
                        className="text-xs text-warm-200/50 hover:text-red-400 transition-colors"
                      >
                        🗑
                      </button>
                    </>
                  )}
                </div>

                {/* 内容区：编辑 or 展示 */}
                {editingId === m.id ? (
                  <div className="space-y-3">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full bg-forest-900 border border-forest-700 rounded-lg p-3 text-warm-100 text-sm resize-none focus:outline-none focus:border-amber-300/50 transition-colors min-h-[100px]"
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => { setEditingId(null); setEditContent(''); }}
                        className="px-3 py-1.5 text-xs text-warm-200/40 hover:text-warm-100 transition-colors"
                      >
                        取消
                      </button>
                      <button
                        onClick={saveEdit}
                        disabled={editSaving || !editContent.trim()}
                        className="px-4 py-1.5 bg-amber-300 text-forest-950 rounded-full text-xs font-medium hover:bg-amber-400 transition-colors disabled:opacity-40"
                      >
                        {editSaving ? '...' : '✦ 保存'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-warm-100 text-sm leading-relaxed whitespace-pre-wrap">
                      {m.content}
                    </p>
                    {m.tags?.length > 0 && (
                      <div className="flex gap-1 mt-3 flex-wrap">
                        {m.tags.map((t: string) => (
                          <span key={t} className="text-xs bg-forest-700 text-amber-300/80 px-2 py-0.5 rounded">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps = async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return { props: { memories: [] } };

  const supabase = createClient(url, key);
  const { data } = await supabase
    .from('memories')
    .select('*')
    .neq('type', 'letter')
    .order('created_at', { ascending: false })
    .limit(50);

  return { props: { memories: data || [] } };
};
