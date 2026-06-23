import { GetServerSideProps } from 'next';
import { createClient } from '@supabase/supabase-js';

type Stats = {
  totalMemories: number;
  recentCount: number;
  topTags: { name: string; count: number }[];
  typeBreakdown: Record<string, number>;
};

export default function CasaPage({ stats }: { stats: Stats | null }) {
  if (!stats) {
    return (
      <div className="min-h-screen bg-forest-950 flex items-center justify-center">
        <p className="text-warm-200/60">数据库还没配置好，等 Keegan 去修一修。</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-forest-950 text-warm-100 px-6 py-12">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-serif text-warm-100 mb-8">La Casa</h1>

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <div className="bg-forest-800/50 border border-forest-700/50 rounded-lg p-4 text-center">
            <div className="text-2xl font-serif text-amber-300">{stats.totalMemories}</div>
            <div className="text-xs text-warm-200/60 mt-1">记忆总数</div>
          </div>
          {Object.entries(stats.typeBreakdown).map(([type, count]) => (
            <div key={type} className="bg-forest-800/50 border border-forest-700/50 rounded-lg p-4 text-center">
              <div className="text-2xl font-serif text-amber-300">{count}</div>
              <div className="text-xs text-warm-200/60 mt-1">{type}</div>
            </div>
          ))}
        </div>

        {/* 最近活跃 */}
        <div className="bg-forest-800/50 border border-forest-700/50 rounded-lg p-5 mb-6">
          <h2 className="text-sm text-warm-200/60 mb-2">最近 30 天</h2>
          <div className="text-xl font-serif text-warm-100">{stats.recentCount} 条新记忆</div>
        </div>

        {/* 标签云 */}
        {stats.topTags.length > 0 && (
          <div className="bg-forest-800/50 border border-forest-700/50 rounded-lg p-5">
            <h2 className="text-sm text-warm-200/60 mb-3">常用标签</h2>
            <div className="flex gap-2 flex-wrap">
              {stats.topTags.map((t) => (
                <span
                  key={t.name}
                  className="px-3 py-1 bg-forest-700 text-amber-300/80 text-sm rounded-full"
                >
                  {t.name} · {t.count}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps = async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return { props: { stats: null } };

  const supabase = createClient(url, key);

  // 总数
  const { count: total } = await supabase
    .from('memories')
    .select('*', { count: 'exact', head: true });

  // 最近 30 天
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const { count: recent } = await supabase
    .from('memories')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', thirtyDaysAgo.toISOString());

  // 按类型统计
  const { data: allMemories } = await supabase
    .from('memories')
    .select('type');

  const typeBreakdown: Record<string, number> = {};
  allMemories?.forEach((m: { type: string }) => {
    typeBreakdown[m.type] = (typeBreakdown[m.type] || 0) + 1;
  });

  // 标签统计（从 memories 表聚合）
  const { data: tagsData } = await supabase
    .from('tags')
    .select('name');
  const topTags = (tagsData || []).slice(0, 8).map((t: { name: string }) => ({
    name: t.name,
    count: 0,
  }));

  return {
    props: {
      stats: {
        totalMemories: total || 0,
        recentCount: recent || 0,
        typeBreakdown,
        topTags,
      },
    },
  };
};
