import { estimateTokensAccurate, MODEL_RATES } from './costUtils';

export interface TokenSavingsReport {
  originalTokens: number;
  compressedTokens: number;
  savedTokens: number;
  savingRatePercent: number; // 例如 32.5 表示节省 32.5%
  estimatedCostSavedPer10kCallsUsd: number;
  estimatedCostSavedPer10kCallsCny: number;
  redundantPhrasesDetected: string[];
}

/**
 * 经典提示词冗余反模式词表
 */
const REDUNDANT_PATTERNS: { regex: RegExp; label: string }[] = [
  { regex: /(作为一个|作为一名|身为一名?)(优秀的|资深的|专业的)?(AI|人工智能|语言模型|助手)/g, label: '无意义身份铺垫 ("作为一名AI助手")' },
  { regex: /(好的|好的，|明白|我明白你的意思了|我知道了|收到|好的收到)[，。！!]?/g, label: '会话客套口癖 ("好的，我明白你的意思了")' },
  { regex: /(请务必|务必|千万|一定要|绝对要|切记)(注意|牢记)?/g, label: '情绪化强调词 ("请务必注意")' },
  { regex: /(在接下来的(回答|输出|任务)中|接下来)/g, label: '过渡冗余词 ("在接下来的任务中")' },
  { regex: /(尽最大努力|竭尽全力|尽力而为|尽你所能)/g, label: '模糊期望套话 ("尽最大努力")' },
  { regex: /(无论如何|不管怎样|任何情况下都不要|不可违背)/g, label: '重复重申词 ("无论如何")' },
  { regex: /(请开始你的(表演|回答|工作)|现在开始)/g, label: '收尾冗余口令 ("现在开始")' },
];

/**
 * 检测提示词中潜藏的冗余短语
 */
export function detectRedundantPatterns(text: string): string[] {
  if (!text) return [];
  const hits = new Set<string>();
  for (const item of REDUNDANT_PATTERNS) {
    if (item.regex.test(text)) {
      hits.add(item.label);
    }
  }
  return Array.from(hits);
}

/**
 * 计算 Token 节省情况
 */
export function calculateTokenSavings(
  originalText: string,
  compressedText: string,
  modelName: string = 'gpt-4o',
  usdToCnyRate: number = 7.25
): TokenSavingsReport {
  const originalTokens = estimateTokensAccurate(originalText);
  const compressedTokens = estimateTokensAccurate(compressedText);
  
  const savedTokens = Math.max(0, originalTokens - compressedTokens);
  const savingRatePercent = originalTokens > 0 
    ? Math.min(100, Math.round(((savedTokens / originalTokens) * 100) * 10) / 10)
    : 0;

  // 获取模型输入单价 (按每百万 Tokens 计算)
  const rate = MODEL_RATES[modelName] || MODEL_RATES['gpt-4o'];
  const inputPricePerMillion = rate.inputPerMillionUsd || 2.5;

  // 10,000 次调用的节省金额
  const savedTokensPer10k = (savedTokens * 10000);
  const savedUsd = (savedTokensPer10k / 1000000) * inputPricePerMillion;
  const savedCny = savedUsd * usdToCnyRate;

  return {
    originalTokens,
    compressedTokens,
    savedTokens,
    savingRatePercent,
    estimatedCostSavedPer10kCallsUsd: Math.round(savedUsd * 1000) / 1000,
    estimatedCostSavedPer10kCallsCny: Math.round(savedCny * 100) / 100,
    redundantPhrasesDetected: detectRedundantPatterns(originalText),
  };
}

/**
 * 生成大模型 Token 智能瘦身提示词
 */
export function generateCompressorPrompt(promptText: string): string {
  return `你是一位世界顶级的提示词编译与 Token 极致压缩专家（Prompt Compression & Minification Engine）。
你的任务是对用户提供的提示词进行【极致无损压缩（Lossless Token Minification）】。

【核心目标】：
在保证原有业务逻辑、角色能力、边界红线与输出格式 100% 不失真、不削弱的前提下，最大幅度缩减 Token 消耗（目标压缩率 20% ~ 45%）。

【压缩铁律与原则】：
1. 彻底清除套话口癖：消除“作为一个AI助手”、“好的”、“请务必注意”、“尽最大努力”、“在接下来的回答中”等无效废话。
2. 消除语法冗余：将长复合句改为简练指令，合并语义重复的条目，去掉显而易见的常识说明。
3. 绝对保留占位符：所有形如 {{variable}} 的模板变量和 {{@引用}} 必须原封不动 100% 完整保留！
4. 绝对保留负向约束：核心规则、禁止事项、代码格式限制（如 JSON Schema）不可擅自删减。
5. 紧凑排版：消除无意义的多重空行，改用紧凑的 Markdown 列表或精炼结构。

【待压缩提示词】：
"""
${promptText}
"""

【输出要求】：
仅直接输出压缩瘦身后的提示词正文，禁止包含任何外部解释、客套开头或总结说明！`;
}
