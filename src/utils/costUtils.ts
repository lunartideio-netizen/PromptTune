/**
 * costUtils.ts
 * 负责 Token 细分测算与多模型费率成本预估看板 (FEAT-4)
 */

export type ModelRateCategory = '开源与低成本' | '轻量高性价比' | '顶级旗舰推理' | '本地免费';

export interface ModelRate {
  id?: string;
  name: string;
  category: ModelRateCategory;
  inputPerMillionUsd: number; // 美元 / 100万 tokens (输入)
  outputPerMillionUsd: number; // 美元 / 100万 tokens (输出预估)
  maxContext: number; // 上下文窗口大小
  isFree?: boolean;
}

export const MODEL_RATES: Record<string, ModelRate> = {
  // 开源与极低成本
  'deepseek-chat': {
    id: 'deepseek-chat',
    name: 'DeepSeek-V3',
    category: '开源与低成本',
    inputPerMillionUsd: 0.14,
    outputPerMillionUsd: 0.28,
    maxContext: 65536,
  },
  'deepseek-reasoner': {
    id: 'deepseek-reasoner',
    name: 'DeepSeek-R1 (深度思考)',
    category: '开源与低成本',
    inputPerMillionUsd: 0.55,
    outputPerMillionUsd: 2.19,
    maxContext: 65536,
  },
  'qwen-2.5-72b': {
    id: 'qwen-2.5-72b',
    name: 'Qwen 2.5 72B (通义千问)',
    category: '开源与低成本',
    inputPerMillionUsd: 0.35,
    outputPerMillionUsd: 0.70,
    maxContext: 32768,
  },
  'glm-4-plus': {
    id: 'glm-4-plus',
    name: 'GLM-4-Plus (智谱清言)',
    category: '开源与低成本',
    inputPerMillionUsd: 0.70,
    outputPerMillionUsd: 0.70,
    maxContext: 128000,
  },
  'llama-3.3-70b': {
    id: 'llama-3.3-70b',
    name: 'Llama 3.3 70B (Meta/Groq)',
    category: '开源与低成本',
    inputPerMillionUsd: 0.59,
    outputPerMillionUsd: 0.79,
    maxContext: 128000,
  },
  'llama3': {
    id: 'llama3',
    name: 'Llama 3 (Groq/Ollama)',
    category: '开源与低成本',
    inputPerMillionUsd: 0.05,
    outputPerMillionUsd: 0.08,
    maxContext: 8192,
  },

  // 轻量高性价比
  'gpt-4o-mini': {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    category: '轻量高性价比',
    inputPerMillionUsd: 0.15,
    outputPerMillionUsd: 0.60,
    maxContext: 128000,
  },
  'claude-3-5-haiku': {
    id: 'claude-3-5-haiku',
    name: 'Claude 3.5 Haiku',
    category: '轻量高性价比',
    inputPerMillionUsd: 0.80,
    outputPerMillionUsd: 4.00,
    maxContext: 200000,
  },
  'gemini-1.5-flash': {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    category: '轻量高性价比',
    inputPerMillionUsd: 0.075,
    outputPerMillionUsd: 0.30,
    maxContext: 1000000,
  },
  'gemini-2.0-flash': {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    category: '轻量高性价比',
    inputPerMillionUsd: 0.10,
    outputPerMillionUsd: 0.40,
    maxContext: 1000000,
  },
  'moonshot-v1-8k': {
    id: 'moonshot-v1-8k',
    name: 'Moonshot (Kimi)',
    category: '轻量高性价比',
    inputPerMillionUsd: 1.65,
    outputPerMillionUsd: 1.65,
    maxContext: 8192,
  },

  // 顶级旗舰推理
  'gpt-4o': {
    id: 'gpt-4o',
    name: 'GPT-4o',
    category: '顶级旗舰推理',
    inputPerMillionUsd: 2.50,
    outputPerMillionUsd: 10.00,
    maxContext: 128000,
  },
  'claude-3-5-sonnet': {
    id: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    category: '顶级旗舰推理',
    inputPerMillionUsd: 3.00,
    outputPerMillionUsd: 15.00,
    maxContext: 200000,
  },
  'claude-3-opus': {
    id: 'claude-3-opus',
    name: 'Claude 3 Opus',
    category: '顶级旗舰推理',
    inputPerMillionUsd: 15.00,
    outputPerMillionUsd: 75.00,
    maxContext: 200000,
  },
  'o1': {
    id: 'o1',
    name: 'OpenAI o1 (高阶慢思考)',
    category: '顶级旗舰推理',
    inputPerMillionUsd: 15.00,
    outputPerMillionUsd: 60.00,
    maxContext: 200000,
  },
  'o1-mini': {
    id: 'o1-mini',
    name: 'OpenAI o1-mini',
    category: '顶级旗舰推理',
    inputPerMillionUsd: 3.00,
    outputPerMillionUsd: 12.00,
    maxContext: 128000,
  },
  'gemini-1.5-pro': {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    category: '顶级旗舰推理',
    inputPerMillionUsd: 1.25,
    outputPerMillionUsd: 5.00,
    maxContext: 2000000,
  },

  // 本地免费
  'ollama': {
    id: 'ollama',
    name: 'Ollama 本地运行',
    category: '本地免费',
    inputPerMillionUsd: 0.00,
    outputPerMillionUsd: 0.00,
    maxContext: 32768,
    isFree: true,
  },
  'vllm': {
    id: 'vllm',
    name: 'vLLM / 私有部署节点',
    category: '本地免费',
    inputPerMillionUsd: 0.00,
    outputPerMillionUsd: 0.00,
    maxContext: 32768,
    isFree: true,
  },
};

const DEFAULT_RATE: ModelRate = {
  name: '通用标准模型',
  category: '开源与低成本',
  inputPerMillionUsd: 1.00,
  outputPerMillionUsd: 2.00,
  maxContext: 32768,
};

/**
 * 精准混合 Token 估算器 (中英混排与标点符号加权)
 */
export function estimateTokensAccurate(text: string): number {
  if (!text || text.trim().length === 0) return 0;
  
  // 匹配中文字符、中文标点
  const cjkMatches = text.match(/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/g);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  
  // 剩余字符 (英文、数字、空格、ASCII标点)
  const nonCjkLength = text.length - cjkCount;
  
  // 行业经验值：汉字按 1.25~1.4 tokens 计，英文词/符号平均 3.8 字符合 1 token
  const estimated = Math.ceil(cjkCount * 1.35 + nonCjkLength / 3.8);
  return Math.max(1, estimated);
}

export interface TokenCostReport {
  systemTokens: number;
  templateTokens: number;
  variableTokens: number;
  totalTokens: number;
  rateInfo: ModelRate;
  costPerCallUsd: number;
  costPerCallCny: number;
  costPer100kUsd: number;
  costPer100kCny: number;
  contextUsagePercent: number;
  isWarning: boolean;
  isCritical: boolean;
}

export function calculateTokenCostReport(
  systemText: string,
  templateText: string,
  variableText: string,
  modelName: string = 'gpt-4o',
  usdToCnyRate: number = 7.25,
  customRate?: Partial<ModelRate>
): TokenCostReport {
  const systemTokens = estimateTokensAccurate(systemText);
  const templateTokens = estimateTokensAccurate(templateText);
  const variableTokens = estimateTokensAccurate(variableText);
  const totalTokens = systemTokens + templateTokens + variableTokens;

  // 匹配费率规则 (优先精确 key，再小写模糊匹配)
  const lower = modelName.toLowerCase();
  let matchedRate: ModelRate = DEFAULT_RATE;
  if (MODEL_RATES[modelName]) {
    matchedRate = MODEL_RATES[modelName];
  } else {
    for (const [key, rate] of Object.entries(MODEL_RATES)) {
      if (lower.includes(key) || lower.includes(rate.name.toLowerCase())) {
        matchedRate = rate;
        break;
      }
    }
  }

  if (customRate) {
    matchedRate = {
      ...matchedRate,
      ...customRate,
      name: customRate.name || matchedRate.name,
      category: customRate.category || matchedRate.category,
    };
  }

  // 假定平均输出为输入长度的 0.8 倍 (作为单次调用综合估算)
  const estimatedOutputTokens = Math.max(50, Math.round(totalTokens * 0.8));
  
  const inputCost = (totalTokens / 1_000_000) * matchedRate.inputPerMillionUsd;
  const outputCost = (estimatedOutputTokens / 1_000_000) * matchedRate.outputPerMillionUsd;
  const costPerCallUsd = inputCost + outputCost;
  const costPerCallCny = costPerCallUsd * usdToCnyRate;

  const costPer100kUsd = costPerCallUsd * 100_000;
  const costPer100kCny = costPerCallCny * 100_000;

  const contextUsagePercent = Math.min(100, (totalTokens / matchedRate.maxContext) * 100);
  const isWarning = totalTokens > 4000;
  const isCritical = totalTokens > matchedRate.maxContext * 0.8;

  return {
    systemTokens,
    templateTokens,
    variableTokens,
    totalTokens,
    rateInfo: matchedRate,
    costPerCallUsd,
    costPerCallCny,
    costPer100kUsd,
    costPer100kCny,
    contextUsagePercent,
    isWarning,
    isCritical,
  };
}
