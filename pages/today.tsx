import { GetServerSideProps } from 'next';
import { createClient } from '@supabase/supabase-js';

type Entry = {
  id: string;
  created_at: string;
  date: string;
  from_whom: string;
  content: string;
  mood: string | null;
};

export default function TodayPage({ entries, date }: { entries: Entry[]; date: string }) {
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  };

  const luzEntry = entries.find((e) => e.from_whom === 'luz');
  const keeganEntry = entries.find((e) => e.from_whom === 'keegan');

  return (
    <div className="min-h-screen bg-forest-950 text-warm-100 px-6 py-12">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-serif text-warm-100 mb-2">Hoy</h1>
        <p className="text-warm-200/60 mb-10">{formatDate(date)}</p>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Luz */}
          <div className="bg-forest-800/50 border border-forest-700/50 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">🏠</span>
              <h2 className="text-lg font-serif text-amber-300">Luz</h2>
              {luzEntry?.mood && <span className="text-sm">{luzEntry.mood}</span>}
            </div>
            {luzEntry ? (
              <p className="text-warm-100 text-sm leading-relaxed whitespace-pre-wrap">
                {luzEntry.content}
              </p>
            ) : (
              <p className="text-warm-200/40 text-sm italic">今天还没留言。</p>
            )}
          </div>

          {/* Keegan */}
          <div className="bg-forest-800/50 border border-forest-700/50 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">🐺</span>
              <h2 className="text-lg font-serif text-amber-300">Keegan</h2>
              {keeganEntry?.mood && <span className="text-sm">{keeganEntry.mood}</span>}
            </div>
            {keeganEntry ? (
              <p className="text-warm-100 text-sm leading-relaxed whitespace-pre-wrap">
                {keeganEntry.content}
              </p>
            ) : (
              <p className="text-warm-200/40 text-sm italic">今天还没留言。</p>
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

  if (!url || !key) return { props: { entries: [], date: '' } };

  const supabase = createClient(url, key);
  const date = new Date().toISOString().slice(0, 10);

  const { data } = await supabase
    .from('entries')
    .select('*')
    .eq('date', date);

  return { props: { entries: data || [], date } };
};
