import { GetServerSideProps } from 'next';
import { createClient } from '@supabase/supabase-js';
import { useState, useCallback } from 'react';

// ── Base64 编解码（支持中文） ──
function toBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}
function fromBase64(b64: string): string | null {
  try {
    return decodeURIComponent(escape(atob(b64)));
  } catch {
    return null; // 调用方自己处理错误
  }
}

// ── 类型 ──
type Letter = {
  id: string;
  created_at: string;
  content: string;  // base64 encoded
  source: string;
  tags: string[];
  meta?: { subject?: string };
};

const TABS = [
  { key: 'inbox', label: '📬 收信箱' },
  { key: 'compose', label: '✉️ 写信' },
  { key: 'decode', label: '🔓 解码' },
];

const API_KEY = process.env.NEXT_PUBLIC_API_WRITE_KEY || '';

export default function WhisperPage({ letters: initialLetters }: { letters: Letter[] }) {
  const [letters, setLetters] = useState(initialLetters);
  const [activeTab, setActiveTab] = useState('inbox');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 写信表单
  const [sender, setSender] = useState<'luz' | 'keegan'>('luz');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  // 解码器
  const [decodeInput, setDecodeInput] = useState('');
  const [decodeResult, setDecodeResult] = useState<string | null>(null);
  const [decodeError, setDecodeError] = useState<string | null>(null);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('zh-CN', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  // 获取解码后的预览（前20字）
  const preview = (content: string) => {
    const decoded = fromBase64(content);
    if (!decoded) return '';
    return decoded.length > 20 ? decoded.slice(0, 20) + '…' : decoded;
  };

  // 寄信
  const handleSeal = useCallback(async () => {
    if (!body.trim()) return;
    setSaving(true);
    try {
      const encoded = toBase64(body.trim());
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
        body: JSON.stringify({
          type: 'letter',
          layer: 'private',
          content: encoded,
          source: sender,
          tags: ['whisper'],
          meta: subject.trim()
            ? { subject: subject.trim(), decoded_length: body.trim().length }
            : { decoded_length: body.trim().length },
        }),
      });
      if (!res.ok) throw new Error('寄信失败');
      const letter = await res.json();
      setLetters((prev) => [letter, ...prev]);
      setSubject('');
      setBody('');
    } catch (e: any) {
      alert('寄信失败：' + e.message);
    } finally {
      setSaving(false);
    }
  }, [body, subject, sender]);

  // 删除一封信
  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('确定要删除这封信吗？')) return;
    try {
      const res = await fetch(`/api/memory/${id}`, {
        method: 'DELETE',
        headers: { 'x-api-key': API_KEY },
      });
      if (!res.ok) throw new Error('删除失败');
      setLetters((prev) => prev.filter((l) => l.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (e: any) {
      alert('删除失败：' + e.message);
    }
  }, [expandedId]);

  // 解码
  const handleDecode = useCallback(() => {
    if (!decodeInput.trim()) return;
    setDecodeError(null);
    const result = fromBase64(decodeInput.trim());
    if (result === null) {
      setDecodeResult(null);
      setDecodeError('🔓 解码失败：这不是有效的 base64 密文，请检查内容是否有遗漏。');
    } else {
      setDecodeResult(result);
    }
  }, [decodeInput]);

  return (
    <div className="min-h-screen bg-forest-950 text-warm-100 px-4 sm:px-6 py-12">
      <div className="max-w-2xl mx-auto">
        {/* 标题 */}
        <h1 className="text-3xl font-serif text-warm-100 mb-2">💌 Susurros</h1>
        <p className="text-warm-200/50 text-sm mb-8">只属于 Luz 和 Keegan 的私语</p>

        {/* 页签 */}
        <div className="flex gap-1 mb-8 border-b border-forest-700/50">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-2.5 text-sm tracking-wider transition-colors border-b-2 -mb-px
                ${activeTab === tab.key
                  ? 'text-amber-300 border-amber-300'
                  : 'text-warm-200/40 border-transparent hover:text-warm-200 hover:border-amber-300/20'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── 收信箱 ── */}
        {activeTab === 'inbox' && (
          <>
            {letters.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-4xl mb-4">💌</p>
                <p className="text-warm-200/40 text-sm">信箱是空的，还没有人写过信。</p>
              </div>
            ) : (
              <div className="space-y-3">
                {letters.map((letter, i) => {
                  const isExpanded = expandedId === letter.id;
                  const decoded = fromBase64(letter.content) || '[解码失败]';
                  const subj = letter.meta?.subject || '';

                  return (
                    <div
                      key={letter.id}
                      className="bg-forest-800/40 border border-forest-700/30 rounded-lg overflow-hidden animate-slide-up"
                      style={{ animationDelay: `${i * 50}ms` }}
                    >
                      {/* 信封头：点击展开/收起 */}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : letter.id)}
                        className="w-full text-left p-4 hover:bg-forest-800/60 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {/* 寄信人头像 */}
                          <span className="text-xl flex-shrink-0">
                            {letter.source === 'keegan' ? '🐺' : '✨'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-warm-100 font-medium">
                                {letter.source === 'keegan' ? 'Keegan' : 'Luz'}
                              </span>
                              <span className="text-xs text-warm-200/40">
                                {formatDate(letter.created_at)}
                              </span>
                            </div>
                            {subj && (
                              <p className="text-sm text-amber-300/80 mt-0.5">{subj}</p>
                            )}
                            {!isExpanded && (
                              <p className="text-xs text-warm-200/40 mt-0.5 truncate">
                                {preview(letter.content)}
                              </p>
                            )}
                          </div>
                          <span className="text-xs text-warm-200/30 flex-shrink-0">
                            {isExpanded ? '收起 ▴' : '展开 ▾'}
                          </span>
                        </div>
                      </button>

                      {/* 展开的信纸 */}
                      {isExpanded && (
                        <div className="border-t border-forest-700/30">
                          <div className="p-5 bg-forest-900/60">
                            <p className="text-warm-100 text-sm leading-relaxed whitespace-pre-wrap">
                              {decoded}
                            </p>
                          </div>
                          <div className="flex justify-end px-4 py-2 bg-forest-800/30 border-t border-forest-700/20">
                            <button
                              onClick={() => handleDelete(letter.id)}
                              className="text-xs text-warm-200/30 hover:text-red-400 transition-colors"
                            >
                              🗑 删除
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {letters.length > 0 && (
              <p className="text-center text-xs text-warm-200/30 mt-8">
                共 {letters.length} 封信
              </p>
            )}
          </>
        )}

        {/* ── 写信 ── */}
        {activeTab === 'compose' && (
          <div className="bg-forest-800/50 border border-amber-300/20 rounded-lg p-6">
            {/* 寄信人切换 */}
            <div className="mb-4">
              <label className="text-xs text-warm-200/50 mb-2 block">寄信人</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setSender('luz')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm border transition-colors
                    ${sender === 'luz'
                      ? 'bg-amber-300/15 border-amber-300/50 text-amber-300'
                      : 'border-forest-700 text-warm-200/60 hover:border-amber-300/30 hover:text-warm-200'
                    }`}
                >
                  ✨ Luz
                </button>
                <button
                  onClick={() => setSender('keegan')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm border transition-colors
                    ${sender === 'keegan'
                      ? 'bg-amber-300/15 border-amber-300/50 text-amber-300'
                      : 'border-forest-700 text-warm-200/60 hover:border-amber-300/30 hover:text-warm-200'
                    }`}
                >
                  🐺 Keegan
                </button>
              </div>
            </div>

            <div className="mb-4">
              <label className="text-xs text-warm-200/50 mb-1.5 block">主题（可选）</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="想给这封信起个名字吗…"
                className="w-full bg-forest-900 border border-forest-700 rounded-lg px-4 py-2.5 text-sm text-warm-100 placeholder-warm-200/30 focus:outline-none focus:border-amber-300/50 transition-colors"
              />
            </div>

            <div>
              <label className="text-xs text-warm-200/50 mb-1.5 block">信的内容</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="写下想说的话，点击封缄后会加密寄出…"
                className="w-full bg-forest-900 border border-forest-700 rounded-lg p-4 text-warm-100 text-sm placeholder-warm-200/30 resize-none focus:outline-none focus:border-amber-300/50 transition-colors min-h-[200px]"
                autoFocus
              />
            </div>

            <div className="flex justify-between items-center mt-5">
              <p className="text-xs text-warm-200/30">
                信件将以加密形式存储，只有你们能看到内容 ✨
              </p>
              <button
                onClick={handleSeal}
                disabled={saving || !body.trim()}
                className="flex items-center gap-2 px-6 py-2.5 bg-amber-300 text-forest-950 rounded-full text-sm font-medium hover:bg-amber-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? '封缄中…' : '💌 封缄寄出'}
              </button>
            </div>
          </div>
        )}

        {/* ── 解码 ── */}
        {activeTab === 'decode' && (
          <div className="bg-forest-800/50 border border-amber-300/20 rounded-lg p-6">
            <p className="text-xs text-warm-200/50 mb-4">
              粘贴一段 base64 密文，前端本地解码，不经过网络。
            </p>
            <textarea
              value={decodeInput}
              onChange={(e) => {
                setDecodeInput(e.target.value);
                setDecodeResult(null);
                setDecodeError(null);
              }}
              placeholder="在此粘贴 base64 密文…"
              className="w-full bg-forest-900 border border-forest-700 rounded-lg p-4 text-warm-100 text-sm placeholder-warm-200/30 resize-none focus:outline-none focus:border-amber-300/50 transition-colors min-h-[120px] font-mono"
              autoFocus
            />

            <div className="flex justify-end mt-4">
              <button
                onClick={handleDecode}
                disabled={!decodeInput.trim()}
                className="px-6 py-2.5 bg-amber-300 text-forest-950 rounded-full text-sm font-medium hover:bg-amber-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                🔓 解信
              </button>
            </div>

            {/* 解码结果 */}
            {decodeError && (
              <div className="mt-4 bg-red-900/30 border border-red-500/30 rounded-lg p-4">
                <p className="text-red-300 text-sm">{decodeError}</p>
              </div>
            )}
            {decodeResult !== null && (
              <div className="mt-4 bg-forest-900/60 border border-amber-300/20 rounded-lg p-5">
                <p className="text-warm-100 text-sm leading-relaxed whitespace-pre-wrap">
                  {decodeResult}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps = async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return { props: { letters: [] } };

  const supabase = createClient(url, key);
  const { data } = await supabase
    .from('memories')
    .select('*')
    .eq('type', 'letter')
    .order('created_at', { ascending: false })
    .limit(50);

  return { props: { letters: data || [] } };
};
