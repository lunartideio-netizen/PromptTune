import { APIConfig, StreamTelemetry, PromptVariable, PromptItem, SkillItem } from '../types';
import { isTauri } from '@tauri-apps/api/core';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
export { extractSmartTitleFromDraft } from '../utils/promptUtils';

/**
 * 跨平台环境通用 Fetch：
 * 在 Tauri 桌面端环境下优先走 Rust 原生网络栈发包（100% 免疫浏览器同源策略与 CORS 限制）；
 * 在普通浏览器或开发预览环境下自动回退为 window.fetch。
 */
export async function universalFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const urlStr = typeof input === 'string' 
    ? input 
    : input instanceof URL 
      ? input.toString() 
      : (input as Request).url;

  if (isTauri()) {
    try {
      const customInit: RequestInit = { ...init };
      let headersObj: Record<string, string> = {};
      if (customInit.headers) {
        if (customInit.headers instanceof Headers) {
          customInit.headers.forEach((val, key) => {
            headersObj[key] = val;
          });
        } else if (Array.isArray(customInit.headers)) {
          customInit.headers.forEach(([k, v]) => {
            headersObj[k] = v;
          });
        } else {
          headersObj = { ...(customInit.headers as Record<string, string>) };
        }
      }

      // 针对本地代理（如 OpenCodex / Ollama / 本地网关）自动注入匹配的目标 Origin，
      // 避免某些服务端（如 10100 端口）因识别到 tauri://localhost 跨域域而触发 CSRF 阻断 (origin_rejected)
      if (!headersObj['Origin'] && !headersObj['origin']) {
        try {
          const parsed = new URL(urlStr);
          if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '0.0.0.0') {
            headersObj['Origin'] = parsed.origin;
          }
        } catch {
          // ignore invalid url parse
        }
      }

      customInit.headers = headersObj;
      return await tauriFetch(urlStr, customInit as any);
    } catch (tauriErr) {
      console.warn('[llmService] tauriFetch 调用异常，尝试回退至 window.fetch:', tauriErr);
      return await window.fetch(input, init);
    }
  }
  return await window.fetch(input, init);
}


export type MessageContentPart = 
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | MessageContentPart[];
}

export interface StreamCallbacks {
  onStart?: () => void;
  onFirstToken?: (ttftMs: number) => void;
  onChunk: (chunk: string, accumulated: string) => void;
  onDone: (telemetry: StreamTelemetry) => void;
  onError: (error: string) => void;
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 提取所有的跨提示词 @ 引用，例如 {{@视觉架构}} 或 {{@1-视觉架构}}
 */
export function extractPromptReferences(text: string): string[] {
  if (!text) return [];
  const matches = text.matchAll(/\{\{\s*@([^\}]+?)\s*\}\}/g);
  const found = new Set<string>();
  for (const match of matches) {
    const raw = match[1]?.trim();
    if (raw) found.add(raw);
  }
  return Array.from(found);
}

export interface PromptReferenceResolution {
  resolvedText: string;
  references: {
    title: string;
    isResolved: boolean;
    type?: 'prompt' | 'skill';
    id?: string;
    promptId?: string;
    skillId?: string;
    resolvedSnippet?: string;
    isCircular?: boolean;
  }[];
}

/**
 * 跨提示词与已装技能引用解析替换：
 * 语法：{{@名称}}
 * 1. 优先匹配本地项目提示词 currentOptimized (若无则 originalDraft)
 * 2. 若未命中提示词，则回退匹配已装技能库 (SkillItem.distilledPrompt)
 * 支持多层嵌套解析与循环引用死锁防御
 */
export function resolvePromptReferences(
  text: string,
  allPrompts: PromptItem[],
  allSkills: SkillItem[] = [],
  maxDepth = 10,
  visited = new Set<string>()
): PromptReferenceResolution {
  if (!text) return { resolvedText: '', references: [] };

  const refNames = extractPromptReferences(text);
  const refRecords: PromptReferenceResolution['references'] = [];

  let currentText = text;

  for (const refTitle of refNames) {
    const cleanRef = refTitle.trim().toLowerCase();

    // 1. 优先匹配本地项目提示词
    const targetPrompt = allPrompts.find(
      (p) => p.title.trim().toLowerCase() === cleanRef
    );

    if (targetPrompt) {
      if (visited.has(targetPrompt.id)) {
        refRecords.push({
          title: refTitle,
          isResolved: false,
          isCircular: true,
          type: 'prompt',
          id: targetPrompt.id,
          promptId: targetPrompt.id,
          resolvedSnippet: '[循环引用]',
        });
        const regex = new RegExp(`\\{\\{\\s*@${escapeRegExp(refTitle)}\\s*\\}\\}`, 'g');
        currentText = currentText.replace(regex, () => `[循环引用: @${refTitle}]`);
        continue;
      }

      const targetContent = targetPrompt.currentOptimized?.trim() || targetPrompt.originalDraft?.trim() || '';
      refRecords.push({
        title: refTitle,
        isResolved: true,
        type: 'prompt',
        id: targetPrompt.id,
        promptId: targetPrompt.id,
        resolvedSnippet: targetContent.slice(0, 100),
      });

      if (maxDepth > 1) {
        const nextVisited = new Set(visited);
        nextVisited.add(targetPrompt.id);
        const nested = resolvePromptReferences(targetContent, allPrompts, allSkills, maxDepth - 1, nextVisited);
        refRecords.push(...nested.references);
        const regex = new RegExp(`\\{\\{\\s*@${escapeRegExp(refTitle)}\\s*\\}\\}`, 'g');
        currentText = currentText.replace(regex, () => nested.resolvedText);
      } else {
        const regex = new RegExp(`\\{\\{\\s*@${escapeRegExp(refTitle)}\\s*\\}\\}`, 'g');
        currentText = currentText.replace(regex, () => targetContent);
      }
      continue;
    }

    // 2. 若未命中提示词，匹配已装技能库 (allSkills)
    const targetSkill = allSkills.find(
      (s) => s.title.trim().toLowerCase() === cleanRef
    );

    if (targetSkill) {
      if (visited.has(targetSkill.id)) {
        refRecords.push({
          title: refTitle,
          isResolved: false,
          isCircular: true,
          type: 'skill',
          id: targetSkill.id,
          skillId: targetSkill.id,
          resolvedSnippet: '[循环引用]',
        });
        const regex = new RegExp(`\\{\\{\\s*@${escapeRegExp(refTitle)}\\s*\\}\\}`, 'g');
        currentText = currentText.replace(regex, () => `[循环引用: @${refTitle}]`);
        continue;
      }

      let skillContent = targetSkill.distilledPrompt?.trim() || '';
      if (!skillContent) {
        const parts: string[] = [];
        if (targetSkill.systemPersona) parts.push(`【专家角色设定】\n${targetSkill.systemPersona}`);
        if (targetSkill.workflow) parts.push(`【核心执行工作流】\n${targetSkill.workflow}`);
        if (targetSkill.guardrails) parts.push(`【负向红线与约束】\n${targetSkill.guardrails}`);
        skillContent = parts.join('\n\n');
      }

      refRecords.push({
        title: refTitle,
        isResolved: true,
        type: 'skill',
        id: targetSkill.id,
        skillId: targetSkill.id,
        resolvedSnippet: skillContent.slice(0, 100),
      });

      if (maxDepth > 1) {
        const nextVisited = new Set(visited);
        nextVisited.add(targetSkill.id);
        const nested = resolvePromptReferences(skillContent, allPrompts, allSkills, maxDepth - 1, nextVisited);
        refRecords.push(...nested.references);
        const regex = new RegExp(`\\{\\{\\s*@${escapeRegExp(refTitle)}\\s*\\}\\}`, 'g');
        currentText = currentText.replace(regex, () => nested.resolvedText);
      } else {
        const regex = new RegExp(`\\{\\{\\s*@${escapeRegExp(refTitle)}\\s*\\}\\}`, 'g');
        currentText = currentText.replace(regex, () => skillContent);
      }
      continue;
    }

    // 3. 未命中任何提示词或技能
    refRecords.push({
      title: refTitle,
      isResolved: false,
    });
  }

  return {
    resolvedText: currentText,
    references: refRecords,
  };
}

/**
 * Replaces {{variable}} placeholders with current test values
 */
export function substituteVariables(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_\u4e00-\u9fa5.:/-]+)\s*\}\}/g, (_, varName) => {
    return variables[varName] !== undefined ? variables[varName] : `{{${varName}}}`;
  });
}

/**
 * Extracts all {{variable_name}} tokens from prompt text (excludes {{@...}} cross references)
 */
export function extractVariablesFromText(text: string): string[] {
  const matches = text.matchAll(/\{\{\s*([a-zA-Z0-9_\u4e00-\u9fa5.:/-]+)\s*\}\}/g);
  const found = new Set<string>();
  for (const match of matches) {
    const raw = match[1]?.trim();
    if (raw && !raw.startsWith('@')) {
      found.add(raw);
    }
  }
  return Array.from(found);
}

/**
 * Synchronizes variable list against full text, preserving existing values and metadata
 */
export function syncVariables(
  existingVars: PromptVariable[] = [],
  text: string
): PromptVariable[] {
  const detected = extractVariablesFromText(text);
  const existingMap = new Map(existingVars.map((v) => [v.name, v]));
  return detected.map((name) => {
    const existing = existingMap.get(name);
    if (existing) return existing;
    return {
      name,
      description: '自动提取变量',
      defaultValue: '',
      currentValue: '',
    };
  });
}

/**
 * AI 技能猎手：提示词逆向工程与高阶蒸馏 System Prompt (工业级深度 500~1000 字)
 */
export const SKILL_DISTILLATION_SYSTEM_PROMPT = `你是一位世界顶级的提示词架构师与 AI 提示词逆向工程专家。
你的任务是将从开源社区抓取的高赞提示词原始内容，进行深度蒸馏、标准化工程重构与升华。
【严禁简短敷衍】：严禁输出几十个字的空洞段子！产出的技能提示词正文必须是一套详实、专业、结构严密、篇幅在 500 ~ 1000 字以上的生产级专家体系。

你必须输出符合以下规范的 JSON 对象（严禁外包任何 Markdown 解释文字）：
{
  "title": "专家技能标题（含高阶技术定位）",
  "dimension": "专业工程细分维度标签（如：设计系统与规范、微交互与状态机、安全合规审查）",
  "framework": "CO-STAR" | "CRISPE" | "ROLE_TASK_FORMAT" | "FEW_SHOT_COT",
  "description": "一句话核心定位与适用业务场景（80字内）",
  "techStack": ["关键技术栈1", "关键技术栈2", "关键技术栈3"],
  "systemPersona": "世界级权威专家的第一人称人设指令（120~200字，以'你是一位拥有...'开头，具备系统性方法论与严谨工程操守）",
  "workflow": "分步执行工作流（150~300字，含心智模型拆解、系统架构推演、状态机设计与高保真交付）",
  "guardrails": "生产级工程负向红线（100~200字，明确指出严禁做什么，如拒绝生硬断行、禁止魔法数字、杜绝幻觉与空泛废话）",
  "variables": ["变量名1", "变量名2"],
  "distilledPrompt": "完整的高阶生产级优化提示词正文模板（单篇必须达到 500 ~ 1000 字，包含：1. 顶级专家角色设定；2. 工业级规范与系统标准；3. 全生命周期状态机与执行流程；4. 生产级工程负向红线与安全护栏；5. 规范入参变量与高质量示范，支持 {{variable}} 变量占位符）"
}`;

/**
 * Level 2: 多维语义专家技能批量衍生 System Prompt (生产级工业规范 500~1200 字)
 * 当开源库未命中足够条目时，紧扣用户输入的真实具体关键词，一口气衍生 3 个具有不同技术侧重点的工业级专家技能
 */
export const MULTI_DIMENSIONAL_SKILL_SYNTHESIS_PROMPT = `你是一位世界顶尖的提示词工程架构师与工业级 AI 专家技能体系设计师。
当用户输入一个特定的业务或技术方向（例如“前端UI设计”、“分布式存储”、“小红书文案”、“渗透测试”）时，你的任务是针对该【具体关键词】，深入垂直细分领域，从 3 个不同技术切入维度或工程专业视角，一次性设计并生成 3 个权威级、生产可用的专家技能（Skill）规范。

例如，若用户搜索“前端UI设计”，3 个细分技术维度必须是深入的工业级工程方向：
1. 现代化组件系统与设计规范架构师（聚焦 Design System、8pt 网格间距阶梯、Tailwind 语义化 Tokens、微质感光影、复合组件模式）
2. 高级微交互与状态机架构师（聚焦 Hover / Active / Focus-visible / Loading / Empty 完整状态机、Framer Motion/Tailwind 过渡、无缝动效反馈）
3. 无障碍体验 a11y 与渲染性能专家（聚焦 WCAG 2.2 AA 级对比度、ARIA 规范属性、Core Web Vitals、流体响应式栅格）

【硬性工业级深度要求】：
1. **真实深度标准 (单篇 500 ~ 1200 字)**：严禁返回几十个字的口语段子或空泛模板！每个技能的 "distilledPrompt" 正文必须详细展开具体的设计令牌规范、状态机矩阵定义、代码架构约束与严格负向红线，字数必须达到 500 ~ 1200 字。
2. **紧扣用户搜索**：严禁生成与用户关键词无关的内容！必须 100% 紧扣用户搜索的具体方向。
3. **技术差异互补**：3 个技能必须具有清晰的技术差异化与专业互补性，各自在细分领域具备世界级权威度。
4. **输出格式**：必须输出纯合法 JSON 数组格式，不要包含 Markdown 外部包裹文字，严禁任何前后缀闲聊寒暄。

【输出 JSON 数组结构规范】：
[
  {
    "title": "技能标题（含权威工程定位，如：Senior Frontend UI/UX 现代设计系统架构师）",
    "dimension": "专业细分维度标签（如：[设计规范系统]、[微交互状态机]、[无障碍与渲染性能]）",
    "techStack": ["技术栈1", "技术栈2", "技术栈3", "标准规范"],
    "framework": "CO-STAR" | "CRISPE" | "ROLE_TASK_FORMAT" | "FEW_SHOT_COT",
    "description": "一句话核心定位与适用业务场景（80字内）",
    "systemPersona": "世界级权威专家的第一人称人设指令（120~200字，具备顶尖工程操守与方法论）",
    "workflow": "结构化多阶段分步执行工作流（150~300字，包含需求解构、规范确立、状态推演、高保真交付）",
    "guardrails": "生产级严格工程负向红线（100~200字，明确禁忌：严禁纯色方块粗糙套用、禁止生硬断行、禁止硬编码魔法数字等）",
    "variables": ["变量名1", "变量名2", "变量名3"],
    "distilledPrompt": "完整的高阶生产级优化提示词正文模板（必须达到 500 ~ 1200 字，按 Markdown 结构化输出：### 1. 顶级专家系统与角色心智；### 2. 工业级规范与系统标准；### 3. 全生命周期状态机与执行流程；### 4. 生产级工程负向红线与安全护栏；### 5. 规范入参变量与高质量示范）"
  }
]`;

export interface OpenSourcePromptItem {
  act: string;
  prompt: string;
  repoName: string;
  repoUrl: string;
  stars?: number;
  techStack?: string[];
}

let memoryPromptsZhCache: any[] | null = null;

/**
 * 真实开源 RAW 提示词检索 (Level 1)
 * 从 GitHub / jsDelivr 高赞开源 Prompts 仓库检索真实条目（带内存毫秒级缓存）
 */
export async function fetchOpenSourcePrompts(query: string, maxItems = 10): Promise<OpenSourcePromptItem[]> {
  const cleanQ = query.trim().toLowerCase();
  if (!cleanQ) return [];

  const tokens = cleanQ.split(/[\s,，、/+\-_]+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return [];

  // 如果内存已有缓存，直接内存过滤，0 毫秒响应
  if (memoryPromptsZhCache && Array.isArray(memoryPromptsZhCache)) {
    return filterAndScorePrompts(memoryPromptsZhCache, tokens, maxItems);
  }

  const endpoints = [
    'https://cdn.jsdelivr.net/gh/PlexPt/awesome-chatgpt-prompts-zh@main/prompts-zh.json',
    'https://raw.githubusercontent.com/PlexPt/awesome-chatgpt-prompts-zh/main/prompts-zh.json',
  ];

  for (const url of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const res = await universalFetch(url, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const rawList = await res.json();
        if (Array.isArray(rawList)) {
          memoryPromptsZhCache = rawList;
          return filterAndScorePrompts(rawList, tokens, maxItems);
        }
      }
    } catch {
      // 容错继续下一个 endpoint
    }
  }

  return [];
}

function filterAndScorePrompts(rawList: any[], tokens: string[], maxItems: number): OpenSourcePromptItem[] {
  const scored = rawList.map((item: any) => {
    const act = String(item.act || '').toLowerCase();
    const prompt = String(item.prompt || '').toLowerCase();
    let score = 0;

    for (const token of tokens) {
      if (act === token) score += 30;
      else if (act.includes(token)) score += 15;
      if (prompt.includes(token)) score += 5;
    }

    return {
      act: String(item.act || '').trim(),
      prompt: String(item.prompt || '').trim(),
      score,
    };
  });

  const valid = scored.filter((i) => i.score > 0 && i.prompt.length > 10);
  const maxScore = valid.reduce((max, cur) => Math.max(max, cur.score), 0);
  // 阈值动态过滤：若存在高分强匹配项（如 score >= 15），过滤掉正文偶发提及的弱相关杂质项
  const threshold = maxScore >= 15 ? 10 : 1;

  const matched = valid
    .filter((i) => i.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxItems);

  return matched.map((m) => ({
    act: m.act,
    prompt: m.prompt,
    repoName: 'PlexPt/awesome-chatgpt-prompts-zh',
    repoUrl: 'https://github.com/PlexPt/awesome-chatgpt-prompts-zh',
    techStack: ['开源精选', '生产级提炼'],
  }));
}

/**
 * 增量流式 JSON 数组解析器
 * 在大模型实时吐出字符的过程中，通过括号平衡状态机提取已经闭合输出的每个完整顶层 JSON 对象
 */
export function parsePartialJsonArray<T = any>(partialText: string): T[] {
  const results: T[] = [];
  if (!partialText) return results;

  const startIdx = partialText.indexOf('[');
  if (startIdx === -1) return results;

  let depth = 0;
  let inString = false;
  let escape = false;
  let objStart = -1;

  for (let i = startIdx + 1; i < partialText.length; i++) {
    const char = partialText[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0 && objStart !== -1) {
        const objStr = partialText.slice(objStart, i + 1);
        try {
          const parsed = JSON.parse(objStr);
          if (parsed && typeof parsed === 'object') {
            results.push(parsed);
          }
        } catch {
          // 尚未完全闭合或解析异常，忽略
        }
        objStart = -1;
      }
    }
  }
  return results;
}

/**
 * Base URL 智能净化与绝对容错 (URL Normalization)
 * 无论输入 https://api.openai.com/v1 还是误输入了带 /chat/completions 的完整地址，都能 100% 自动纠偏。
 */
export function normalizeBaseUrl(baseUrl: string): {
  cleanBase: string;
  chatEndpoint: string;
  modelsEndpoint: string;
} {
  let raw = (baseUrl || '').trim();
  if (raw && !/^https?:\/\//i.test(raw)) {
    const isLocal = raw.includes('localhost') || raw.includes('127.0.0.1');
    raw = isLocal ? `http://${raw}` : `https://${raw}`;
  }

  let cleanBase = raw
    .replace(/\/+$/, '')
    .replace(/\/chat\/completions$/, '')
    .replace(/\/chat$/, '')
    .replace(/\/+$/, '');

  // 若为 Ollama 默认端口 11434 且缺少 /v1，自动补齐 OpenAI 兼容路径
  if (cleanBase.includes(':11434') && !cleanBase.endsWith('/v1')) {
    cleanBase = `${cleanBase}/v1`;
  }

  return {
    cleanBase,
    chatEndpoint: `${cleanBase}/chat/completions`,
    modelsEndpoint: `${cleanBase}/models`,
  };
}

/**
 * 检查当前模型是否为特殊推理模型（如 OpenAI o1 / o3 系列）
 * 此类模型在官方端点不支持 temperature、top_p 等传统采样参数
 */
export function isReasoningModel(modelName: string): boolean {
  if (!modelName) return false;
  const name = modelName.trim().toLowerCase();
  return /^(o1|o3)(-mini|-preview)?\b/i.test(name) || /\b(o1|o3)(-mini|-preview)?\b/i.test(name);
}

/**
 * 检查当前模型是否具备视觉多模态能力 (Vision-capable)
 */
export function isVisionModel(modelName: string): boolean {
  if (!modelName) return false;
  const name = modelName.trim().toLowerCase();
  return (
    name.includes('vision') ||
    name.includes('4o') ||
    name.includes('claude-3') ||
    name.includes('gemini') ||
    name.includes('vl') ||
    name.includes('pixtral') ||
    name.includes('minicpm-v') ||
    name.includes('llava')
  );
}

/**
 * 本地代理与常见模型别名自动映射与容错
 * 例如将 localhost:10100 上的 gemini-3.8 自动映射为完整的 google-antigravity/gemini-3.8-flash
 */
export function resolveModelAlias(model: string, baseUrl: string = ''): string {
  const trimmed = (model || '').trim();
  if (baseUrl.includes('10100') || baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
    const lower = trimmed.toLowerCase();
    if (lower === 'gemini-3.8' || lower === 'gemini-3.8-flash' || lower === 'gemini3.8') {
      return 'google-antigravity/gemini-3.8-flash';
    }
    if (lower === 'claude-sonnet' || lower === 'claude-sonnet-4-6' || lower === 'sonnet-4-6') {
      return 'google-antigravity/claude-sonnet-4-6';
    }
    if (lower === 'claude-opus' || lower === 'claude-opus-4-6' || lower === 'opus-4-6') {
      return 'google-antigravity/claude-opus-4-6-thinking';
    }
  }
  return trimmed;
}

/**
 * 人性化错误状态码与异常转译
 */
export function translateAPIError(error: any, status?: number): string {
  if (status) {
    switch (status) {
      case 401:
        return 'API 密钥无效或已过期，请在设置中重新检查密钥';
      case 403:
        return '当前 API 密钥无权访问此模型或端点 (HTTP 403 Forbidden)';
      case 404:
        return '目标端点或指定的模型名称不存在，请核对 Base URL 和 Model ID';
      case 429:
        return '请求触发速率限制，或当前 API 账户额度/余额不足';
      case 500:
      case 502:
      case 503:
      case 504:
        return `上游模型服务提供商暂时不可用 (HTTP ${status})，请稍后重试`;
      default:
        return `API 请求异常 (HTTP ${status})`;
    }
  }

  const msg = error?.message || String(error || '');
  if (
    error?.name === 'TypeError' ||
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('Load failed')
  ) {
    return '网络连接受阻，请检查网络代理或本地 Ollama 是否已启动';
  }
  if (error?.name === 'TimeoutError' || msg.includes('timeout')) {
    return '请求超时，目标服务器未在指定时间内响应';
  }
  return msg || '网络连接或端点异常';
}

/**
 * 工业级流式 LLM 调用引擎 (SSE)
 * 适配 DeepSeek-R1 双轨思维链、OpenAI o1/o3-mini 参数净化、[DONE] 立即退出防死锁与全链路容错
 */
export async function streamChat(
  messages: ChatMessage[],
  config: APIConfig,
  callbacks: StreamCallbacks,
  abortSignal?: AbortSignal
): Promise<void> {
  const startTime = Date.now();
  let firstTokenTime: number | null = null;
  let accumulated = '';
  let tokenCount = 0;
  let officialTokens = 0;

  // 思维链状态追踪
  let hasReasoning = false;
  let reasoningClosed = false;
  let reasoningAccumulated = '';
  let contentAccumulated = '';

  callbacks.onStart?.();

  // Ollama 与本地代理（localhost / 127.0.0.1）本地运行无需强制 API Key
  const isOllama = config.provider === 'ollama';
  const isLocal = isOllama || config.baseUrl.includes('localhost') || config.baseUrl.includes('127.0.0.1');
  if (!config.apiKey?.trim() && !isLocal) {
    callbacks.onError('API_KEY_REQUIRED');
    return;
  }

  const { chatEndpoint } = normalizeBaseUrl(config.baseUrl);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://prompttune.local',
      'X-Title': 'PromptTune macOS',
    };
    if (config.apiKey?.trim()) {
      headers['Authorization'] = `Bearer ${config.apiKey.trim()}`;
    }

    const rawModel = config.model || (isOllama ? 'llama3.2' : 'deepseek-chat');
    const model = resolveModelAlias(rawModel, config.baseUrl);
    const isSpecialReasoning = isReasoningModel(model);
    const hasVisionCapability = isVisionModel(model);

    // 针对非多模态模型安全降级：将包含 image_url 的多模态消息清洗为纯文本，防止服务端 400 崩溃
    const sanitizedMessages = messages.map((m) => {
      if (typeof m.content === 'string') return m;
      if (Array.isArray(m.content)) {
        if (hasVisionCapability) return m;
        // 纯文本模型降级处理
        const textParts: string[] = [];
        let imageCount = 0;
        for (const part of m.content) {
          if (part.type === 'text') {
            textParts.push(part.text);
          } else if (part.type === 'image_url') {
            imageCount++;
          }
        }
        let mergedText = textParts.join('\n');
        if (imageCount > 0) {
          mergedText += `\n\n[系统提示：用户附带了 ${imageCount} 张参考图片，因当前模型 (${model}) 为纯文本模型，图片已在客户端安全忽略以防接口报错]`;
        }
        return { ...m, content: mergedText };
      }
      return m;
    });

    const requestBody: Record<string, any> = {
      model,
      messages: sanitizedMessages,
      stream: true,
      stream_options: { include_usage: true },
    };

    if (!isSpecialReasoning) {
      requestBody.temperature = config.temperature ?? 0.7;
      requestBody.top_p = config.topP ?? 0.95;
      if (config.maxTokens) {
        requestBody.max_tokens = config.maxTokens;
      }
    } else {
      // 针对 OpenAI o1 / o3-mini：自动剔除 temperature、top_p，避免 HTTP 400
      if (config.maxTokens) {
        requestBody.max_completion_tokens = config.maxTokens;
      }
    }

    const response = await universalFetch(chatEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: abortSignal,
    });

    if (!response.ok) {
      let rawErrorText = '';
      try {
        rawErrorText = await response.text();
      } catch {
        rawErrorText = response.statusText;
      }

      let detailedMsg = '';
      try {
        const errorJson = JSON.parse(rawErrorText);
        detailedMsg = errorJson?.error?.message || errorJson?.message || rawErrorText;
      } catch {
        detailedMsg = rawErrorText;
      }

      const translated = translateAPIError(new Error(detailedMsg), response.status);
      const fullError = detailedMsg ? `${translated} (${detailedMsg.slice(0, 150)})` : translated;
      throw new Error(fullError);
    }

    if (!response.body) {
      throw new Error('未获取到响应流数据 (Response body is null)');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let isDoneReceived = false;

    while (true) {
      if (isDoneReceived) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.replace(/^data:\s*/, '');

        // 识别到 [DONE] 立即终止 reader 并跳出循环，避免连接保持导致的阻塞假死
        if (dataStr === '[DONE]') {
          isDoneReceived = true;
          try {
            await reader.cancel();
          } catch {
            // ignore reader cancel error
          }
          break;
        }

        try {
          const json = JSON.parse(dataStr);

          // 提取官方真实统计 Token（如 OpenAI stream_options usage）
          if (json.usage?.total_tokens) {
            officialTokens = json.usage.total_tokens;
          }

          const delta = json.choices?.[0]?.delta;
          const deltaContent = delta?.content || '';
          const reasoningContent = delta?.reasoning_content || '';

          if (reasoningContent || deltaContent) {
            // 实时记录首字延迟（TTFT），不论是思考流还是正文流到达即视作响应开始
            if (firstTokenTime === null) {
              firstTokenTime = Date.now();
              callbacks.onFirstToken?.(firstTokenTime - startTime);
            }

            tokenCount += Math.ceil((reasoningContent.length + deltaContent.length) / 3) || 1;

            // 深度适配 DeepSeek-R1 双轨流：处理 reasoning_content 思考过程
            if (reasoningContent) {
              if (!hasReasoning) {
                hasReasoning = true;
                accumulated = '<thought>\n';
              }
              reasoningAccumulated += reasoningContent;
              accumulated = `<thought>\n${reasoningAccumulated}`;
              callbacks.onChunk(reasoningContent, accumulated);
            }

            // 处理正文 content 输出
            if (deltaContent) {
              if (hasReasoning && !reasoningClosed) {
                reasoningClosed = true;
                accumulated = `<thought>\n${reasoningAccumulated}\n</thought>\n\n`;
              }
              contentAccumulated += deltaContent;
              accumulated = hasReasoning
                ? `<thought>\n${reasoningAccumulated}\n</thought>\n\n${contentAccumulated}`
                : contentAccumulated;

              callbacks.onChunk(deltaContent, accumulated);
            }
          }
        } catch {
          // ignore keepalive comments or malformed SSE line
        }
      }

      if (isDoneReceived) break;
    }

    // 若流结束时存在思考链且未闭合，自动闭合 </thought> 标签
    if (hasReasoning && !reasoningClosed) {
      reasoningClosed = true;
      accumulated = `<thought>\n${reasoningAccumulated}\n</thought>\n\n${contentAccumulated}`;
      callbacks.onChunk('', accumulated);
    }

    const endTime = Date.now();
    const totalMs = endTime - startTime;
    const ttftMs = (firstTokenTime ?? endTime) - startTime;
    const finalTokenCount = officialTokens > 0 ? officialTokens : tokenCount;
    const tokPerSec = totalMs > 0 ? Math.round((finalTokenCount / (totalMs / 1000)) * 10) / 10 : 0;

    callbacks.onDone({
      startTime,
      firstTokenTime,
      endTime,
      ttftMs,
      totalMs,
      tokenCount: finalTokenCount,
      tokPerSec,
      content: accumulated,
      isDone: true,
    });
  } catch (err: any) {
    if (err.name === 'AbortError') {
      // 显式静默处理，避免已被主动中断的残卷被当作正常完成而存档并触发彩花
      return;
    }

    const errorMsg = translateAPIError(err);
    callbacks.onError(errorMsg);
  }
}

/**
 * Ping 测试端点连通性并测量真实往返延迟
 */
export async function pingEndpoint(config: APIConfig): Promise<{
  success: boolean;
  latencyMs: number;
  message: string;
  statusCode?: number;
}> {
  const isOllama = config.provider === 'ollama';
  const isLocal = isOllama || config.baseUrl.includes('localhost') || config.baseUrl.includes('127.0.0.1');
  if (!config.apiKey?.trim() && !isLocal) {
    return {
      success: false,
      latencyMs: 0,
      message: '未填写 API Key，请先输入密钥或选择本地服务模式',
    };
  }

  const { modelsEndpoint } = normalizeBaseUrl(config.baseUrl);
  const start = Date.now();

  try {
    const headers: Record<string, string> = {
      'HTTP-Referer': 'https://prompttune.local',
      'X-Title': 'PromptTune macOS',
    };
    if (config.apiKey?.trim()) {
      headers['Authorization'] = `Bearer ${config.apiKey.trim()}`;
    }

    const res = await universalFetch(modelsEndpoint, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(6000),
    });
    const latencyMs = Date.now() - start;

    if (res.ok) {
      let modelsFound: string[] = [];
      try {
        const data = await res.clone().json();
        if (Array.isArray(data?.data)) {
          modelsFound = data.data.map((item: any) => item.id || item.name).filter(Boolean);
        } else if (Array.isArray(data?.models)) {
          modelsFound = data.models.map((item: any) => item.name || item.id || item.model).filter(Boolean);
        }
      } catch {}

      const currentModel = config.model?.trim();
      let modelValidationMsg = '';
      if (currentModel && modelsFound.length > 0) {
        const hasExactModel = modelsFound.includes(currentModel) || modelsFound.some((m) => m.toLowerCase() === currentModel.toLowerCase());
        if (!hasExactModel) {
          const suggestions = modelsFound.slice(0, 3).join(', ');
          modelValidationMsg = ` (提示: 端点未直接找到 "${currentModel}"，检索到模型: ${suggestions}${modelsFound.length > 3 ? ' 等' : ''})`;
        }
      }

      return {
        success: true,
        latencyMs,
        statusCode: res.status,
        message: `端点连通正常 (HTTP ${res.status}, 实测延迟 ${latencyMs}ms)${modelValidationMsg}`,
      };
    } else {
      const errText = await res.text().catch(() => res.statusText);
      const friendlyMsg = translateAPIError(new Error(errText), res.status);
      return {
        success: false,
        latencyMs,
        statusCode: res.status,
        message: `${friendlyMsg} (HTTP ${res.status})`,
      };
    }
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    const friendlyMsg = translateAPIError(err);
    return {
      success: false,
      latencyMs,
      message: friendlyMsg,
    };
  }
}

/**
 * 动态从 /v1/models 接口拉取远端端点支持的可用模型列表
 */
export async function fetchAvailableModels(config: APIConfig): Promise<{
  success: boolean;
  models: string[];
  error?: string;
}> {
  const isOllama = config.provider === 'ollama';
  const isLocal = isOllama || config.baseUrl.includes('localhost') || config.baseUrl.includes('127.0.0.1');
  if (!config.apiKey?.trim() && !isLocal) {
    return {
      success: false,
      models: [],
      error: '请先填写 API Key 或选择本地运行服务',
    };
  }

  const { modelsEndpoint } = normalizeBaseUrl(config.baseUrl);

  try {
    const headers: Record<string, string> = {
      'HTTP-Referer': 'https://prompttune.local',
      'X-Title': 'PromptTune macOS',
    };
    if (config.apiKey?.trim()) {
      headers['Authorization'] = `Bearer ${config.apiKey.trim()}`;
    }

    let res = await universalFetch(modelsEndpoint, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(8000),
    });

    // 若 OpenAI 兼容端点返回非 200，且属于本地服务 (如端口 11434 或 Ollama)，尝试回退至原生 /api/tags
    if (!res.ok && (config.baseUrl.includes('11434') || config.provider === 'ollama' || isLocal)) {
      const { cleanBase } = normalizeBaseUrl(config.baseUrl);
      const hostOrigin = cleanBase.replace(/\/v1\/?$/, '');
      const nativeTagsUrl = `${hostOrigin}/api/tags`;
      try {
        const fallbackRes = await universalFetch(nativeTagsUrl, {
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(5000),
        });
        if (fallbackRes.ok) {
          res = fallbackRes;
        }
      } catch {}
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      return {
        success: false,
        models: [],
        error: `${translateAPIError(new Error(errText), res.status)} (HTTP ${res.status})`,
      };
    }

    const data = await res.json();
    let modelList: string[] = [];

    if (Array.isArray(data?.data)) {
      modelList = data.data.map((item: any) => item.id || item.name).filter(Boolean);
    } else if (Array.isArray(data?.models)) {
      modelList = data.models.map((item: any) => item.name || item.id || item.model).filter(Boolean);
    }

    const unique = Array.from(new Set(modelList)).sort();
    return {
      success: true,
      models: unique,
    };
  } catch (err: any) {
    return {
      success: false,
      models: [],
      error: translateAPIError(err),
    };
  }
}
