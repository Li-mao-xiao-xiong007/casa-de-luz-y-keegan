import { SupabaseClient } from '@supabase/supabase-js';

export type MemoryTone = 'warm' | 'cold' | 'neutral';

export type RecalledMemory = {
  id: string;
  created_at: string;
  type: string;
  layer: string;
  status: string;
  content: string;
  source: string;
  tags: string[];
  meta: Record<string, unknown>;
  tone: MemoryTone;
  score: number;
  matched_by: string[];
};

type MemoryRow = Omit<RecalledMemory, 'score' | 'matched_by'>;

type RecallOptions = {
  query: string;
  limit: number;
};

const STOP_WORDS = new Set([
  '一个', '一些', '这个', '那个', '这些', '那些', '什么', '怎么', '怎样', '为什么',
  '可以', '可能', '还是', '就是', '不是', '已经', '现在', '今天', '明天', '昨天',
  '我们', '你们', '他们', '自己', '觉得', '知道', '想要', '需要', '然后', '但是',
  '因为', '所以', '如果', '的话', '一下', '这样', '那样', '这里', '那里', '时候',
  '没有', '还有', '真的', '比较', '特别', '宝宝', '小宝', '小咪', 'keegan', 'luz',
  'the', 'and', 'for', 'with', 'that', 'this', 'what', 'when', 'where', 'how', 'why',
]);

const WARM_WORDS = [
  '爱', '喜欢', '想你', '开心', '幸福', '温柔', '拥抱', '抱抱', '亲亲', '陪伴',
  '安心', '感谢', '谢谢', '甜', '暖', '可爱', '快乐', '纪念', '家', '宝贝',
];

const COLD_WORDS = [
  '难过', '伤心', '生气', '失望', '害怕', '焦虑', '孤独', '委屈', '争吵', '冲突',
  '痛苦', '冷', '离开', '失去', '遗憾', '不安', '崩溃', '讨厌', '疲惫', '压力',
];

function normalize(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function extractChineseChunks(text: string): string[] {
  const chunks = text.match(/[\u3400-\u9fff]{2,}/g) || [];
  const result: string[] = [];

  for (const chunk of chunks) {
    if (chunk.length <= 8) result.push(chunk);

    for (let size = Math.min(4, chunk.length); size >= 2; size -= 1) {
      for (let index = 0; index <= chunk.length - size; index += 1) {
        result.push(chunk.slice(index, index + size));
      }
    }
  }

  return result;
}

export function extractRecallKeywords(query: string): string[] {
  const normalized = query.toLowerCase().replace(/[\r\n]+/g, ' ');
  const latinWords = normalized.match(/[a-z0-9][a-z0-9_-]{1,31}/g) || [];
  const chineseChunks = extractChineseChunks(normalized);

  return Array.from(new Set([...latinWords, ...chineseChunks]))
    .map((word) => word.trim())
    .filter((word) => word.length >= 2 && !STOP_WORDS.has(word))
    .sort((a, b) => b.length - a.length)
    .slice(0, 16);
}

export function inferMemoryTone(query: string): MemoryTone {
  const normalized = query.toLowerCase();
  let warmScore = 0;
  let coldScore = 0;

  for (const word of WARM_WORDS) {
    if (normalized.includes(word)) warmScore += word.length;
  }
  for (const word of COLD_WORDS) {
    if (normalized.includes(word)) coldScore += word.length;
  }

  if (warmScore === coldScore) return 'neutral';
  return warmScore > coldScore ? 'warm' : 'cold';
}

function categoryValues(memory: MemoryRow): string[] {
  const meta = memory.meta || {};
  const values = [
    memory.layer,
    memory.type,
    meta.category,
    meta.scene,
    meta.topic,
  ];

  return values.flatMap((value) => {
    if (Array.isArray(value)) return value.map(normalize).filter(Boolean);
    const normalized = normalize(value);
    return normalized ? [normalized] : [];
  });
}

function scoreMemory(
  memory: MemoryRow,
  query: string,
  keywords: string[],
  queryTone: MemoryTone,
) {
  let score = 0;
  const matchedBy = new Set<string>();
  const normalizedQuery = normalize(query);
  const tags = Array.isArray(memory.tags) ? memory.tags.map(normalize).filter(Boolean) : [];
  const categories = categoryValues(memory);

  for (const tag of tags) {
    const keyword = normalizedQuery.includes(tag)
      ? tag
      : keywords.find((candidate) => (
        tag === candidate || tag.includes(candidate) || candidate.includes(tag)
      ));
    if (keyword) {
      score += 5;
      matchedBy.add(`标签:${tag}`);
    }
  }

  for (const category of categories) {
    const keyword = normalizedQuery.includes(category)
      ? category
      : keywords.find((candidate) => (
        category === candidate || category.includes(candidate) || candidate.includes(category)
      ));
    if (keyword) {
      score += 3;
      matchedBy.add(`类别:${category}`);
    }
  }

  const hasSemanticMatch = score > 0;
  if (hasSemanticMatch && queryTone !== 'neutral' && memory.tone === queryTone) {
    score += 1;
    matchedBy.add(`温度:${queryTone}`);
  }

  if (hasSemanticMatch && memory.status === 'stable') {
    score += 0.5;
    matchedBy.add('状态:固化');
  }

  return { score, matchedBy: Array.from(matchedBy) };
}

export async function getRelevantMemories(
  supabase: SupabaseClient,
  { query, limit }: RecallOptions,
): Promise<RecalledMemory[]> {
  if (limit <= 0) return [];

  const { data, error } = await supabase
    .from('memories')
    .select('id, created_at, type, layer, status, content, source, tags, meta, tone')
    .in('status', ['active', 'stable'])
    .neq('type', 'letter')
    .neq('layer', 'private')
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) {
    console.error('memory recall query failed:', error.message);
    return [];
  }

  const memories = (data || []).map((row) => ({
    ...row,
    tags: Array.isArray(row.tags) ? row.tags : [],
    meta: row.meta && typeof row.meta === 'object' ? row.meta : {},
    tone: (row.tone || 'neutral') as MemoryTone,
  })) as MemoryRow[];

  const keywords = extractRecallKeywords(query);
  const queryTone = inferMemoryTone(query);
  const scored = memories.map((memory) => {
    const { score, matchedBy } = scoreMemory(memory, query, keywords, queryTone);
    return { ...memory, score, matched_by: matchedBy };
  });

  const matched = scored
    .filter((memory) => memory.score > 0)
    .sort((a, b) => b.score - a.score || Date.parse(b.created_at) - Date.parse(a.created_at));
  const matchedIds = new Set(matched.map((memory) => memory.id));
  const recentFallback = scored.filter((memory) => !matchedIds.has(memory.id));

  return [...matched, ...recentFallback].slice(0, limit);
}

export function formatMemoriesForPrompt(memories: RecalledMemory[]): string {
  if (!memories.length) return '';

  const lines = memories.map((memory, index) => {
    const tags = memory.tags.length ? `；标签：${memory.tags.join('、')}` : '';
    const category = categoryValues(memory).filter(Boolean).join('、');
    const categoryText = category ? `；类别：${category}` : '';
    const toneText = memory.tone === 'warm' ? '暖' : memory.tone === 'cold' ? '冷' : '中性';
    return `${index + 1}. [${memory.status}/${toneText}] ${memory.content}${tags}${categoryText}`;
  });

  return [
    '以下是根据 Luz 当前消息召回的相关共同记忆。只在自然相关时使用；不要逐条复述，不要声称自己刚刚检索过数据库，也不要泄露标签或内部状态：',
    ...lines,
  ].join('\n');
}
