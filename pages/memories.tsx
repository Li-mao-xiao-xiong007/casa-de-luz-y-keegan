import { GetServerSideProps } from 'next';
import { createClient } from '@supabase/supabase-js';
import { useState } from 'react';

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

export default function MemoriesPage({ memories: initialMemories }: { memories: Memory[] }) {
  const [memories] = useState(initialMemories);
  const [layerFilter, setLayerFilter] = useState('');

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

  return (
    <div className="min-h-screen bg-forest-950 text-warm-100 px-6 py-12">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-serif text-warm-100 mb-8">Memorias</h1>

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
                className="bg-forest-800/50 border border-forest-700/50 rounded-lg p-5 animate-slide-up"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-center gap-2 text-xs text-warm-200/60 mb-2">
                  <span>{typeEmoji[m.type] || '·'}</span>
                  <span>{m.source === 'keegan' ? 'Keegan' : m.source === 'luz' ? 'Luz' : 'API'}</span>
                  <span>·</span>
                  <span>{formatDate(m.created_at)}</span>
                  <span>·</span>
                  <span className="text-amber-300/60">{LAYER_LABELS[m.layer]}</span>
                </div>
                <p className="text-warm-100 text-sm leading-relaxed whitespace-pre-wrap line-clamp-4">
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
    .order('created_at', { ascending: false })
    .limit(50);

  return { props: { memories: data || [] } };
};
