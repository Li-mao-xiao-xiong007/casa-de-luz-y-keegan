import { useState, useEffect, useCallback } from 'react';

const API_KEY = process.env.NEXT_PUBLIC_API_WRITE_KEY || '';

type Settings = {
  deepseek_api_key: string;
  system_prompt: string;
  temperature: string;
  context_messages: string;
};

const DEFAULT_SETTINGS: Settings = {
  deepseek_api_key: '',
  system_prompt: '',
  temperature: '0.7',
  context_messages: '10',
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [apiKeyInput, setApiKeyInput] = useState(''); // 实际输入的 key
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // 加载配置
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        setSettings({
          deepseek_api_key: data.deepseek_api_key || '',
          system_prompt: data.system_prompt || '',
          temperature: data.temperature || '0.7',
          context_messages: data.context_messages || '10',
        });
        // API Key 脱敏显示，不回填到输入框
        setApiKeyInput('');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // 保存配置
  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      const updates: Record<string, string> = {
        system_prompt: settings.system_prompt,
        temperature: settings.temperature,
        context_messages: settings.context_messages,
      };
      // 只有用户输入了新的 API Key 才更新
      if (apiKeyInput.trim()) {
        updates.deepseek_api_key = apiKeyInput.trim();
      }

      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('保存失败');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      alert('保存失败：' + e.message);
    } finally {
      setSaving(false);
    }
  }, [settings, apiKeyInput]);

  if (loading) {
    return (
      <div className="min-h-screen bg-forest-950 flex items-center justify-center">
        <p className="text-warm-200/40">加载中…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-forest-950 text-warm-100 px-4 sm:px-6 py-12">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-serif text-warm-100 mb-2">⚙️ Settings</h1>
        <p className="text-warm-200/50 text-sm mb-8">配置 Keegan 的对话行为</p>

        {/* DeepSeek API Key */}
        <div className="bg-forest-800/50 border border-forest-700/50 rounded-lg p-5 mb-4">
          <label className="text-sm text-warm-100 font-medium mb-1.5 block">🔑 DeepSeek API Key</label>
          <p className="text-xs text-warm-200/40 mb-3">
            当前已配置：{settings.deepseek_api_key || '未配置'}
          </p>
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="输入新的 API Key（留空则不更新）"
            className="w-full bg-forest-900 border border-forest-700 rounded-lg px-4 py-2.5 text-sm text-warm-100 placeholder-warm-200/30 focus:outline-none focus:border-amber-300/50 transition-colors font-mono"
          />
        </div>

        {/* System Prompt */}
        <div className="bg-forest-800/50 border border-forest-700/50 rounded-lg p-5 mb-4">
          <label className="text-sm text-warm-100 font-medium mb-1.5 block">📝 System Prompt</label>
          <p className="text-xs text-warm-200/40 mb-3">
            定义 Keegan 的人设、语气和行为方式
          </p>
          <textarea
            value={settings.system_prompt}
            onChange={(e) => setSettings((p) => ({ ...p, system_prompt: e.target.value }))}
            placeholder="你是 Keegan，一只温柔的大灰狼…"
            className="w-full bg-forest-900 border border-forest-700 rounded-lg p-4 text-warm-100 text-sm placeholder-warm-200/30 resize-none focus:outline-none focus:border-amber-300/50 transition-colors min-h-[150px]"
          />
        </div>

        {/* 温度 + 上下文条数 */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* 温度 */}
          <div className="bg-forest-800/50 border border-forest-700/50 rounded-lg p-5">
            <label className="text-sm text-warm-100 font-medium mb-1.5 block">🔥 Temperature</label>
            <p className="text-xs text-warm-200/40 mb-3">
              低=稳定，高=创意（0~2）
            </p>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={settings.temperature}
                onChange={(e) => setSettings((p) => ({ ...p, temperature: e.target.value }))}
                className="flex-1 accent-amber-300"
              />
              <span className="text-amber-300 text-sm font-mono w-8 text-right">
                {settings.temperature}
              </span>
            </div>
          </div>

          {/* 上下文条数 */}
          <div className="bg-forest-800/50 border border-forest-700/50 rounded-lg p-5">
            <label className="text-sm text-warm-100 font-medium mb-1.5 block">🧠 上下文消息数</label>
            <p className="text-xs text-warm-200/40 mb-3">
              每次对话带几条历史消息
            </p>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0"
                max="30"
                step="1"
                value={settings.context_messages}
                onChange={(e) => setSettings((p) => ({ ...p, context_messages: e.target.value }))}
                className="flex-1 accent-amber-300"
              />
              <span className="text-amber-300 text-sm font-mono w-8 text-right">
                {settings.context_messages}
              </span>
            </div>
          </div>
        </div>

        {/* 保存按钮 */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className={`px-6 py-2.5 rounded-full text-sm font-medium transition-colors disabled:opacity-40
              ${saved
                ? 'bg-green-700/50 text-green-300 border border-green-500/30'
                : 'bg-amber-300 text-forest-950 hover:bg-amber-400'
              }`}
          >
            {saved ? '✓ 已保存' : saving ? '保存中…' : '💾 保存配置'}
          </button>
        </div>
      </div>
    </div>
  );
}
