/**
 * 从用户的初始草稿/问题中智能提炼高凝练文件标题（6~16字符）
 */
export function extractSmartTitleFromDraft(draft: string): string {
  if (!draft || !draft.trim()) return '未命名提示词';
  // 1. 过滤开头的常见客套套话与无意义标点/Markdown 标记
  let clean = draft
    .trim()
    .replace(/^[#\s*>-]+/, '')
    .replace(/^(请帮我|帮我|请为我|请生成|我想让你|我需要一个|我想做一个|编写一个|设计一个|开发一个|优化|写一个)+/i, '')
    .replace(/^["'“”‘’（(【\[]+/, '')
    .trim();
  // 2. 取第一句或第一行非空内容
  const firstLine = clean.split(/[\n\r。？！?!]/)[0].trim();
  const candidate = firstLine || clean;
  // 3. 截取核心长度（上限 16 字），去除末尾残缺符号
  let title = candidate.slice(0, 16).trim();
  title = title.replace(/["'“”‘’）)\]】\s,，.。!！?？:：]+$/, '').trim();
  return title || '未命名提示词';
}

/**
 * 客观评估提示词质量多维评分（结构、完备度、清晰度）
 * 基于真实的文本启发式规则，替代原先无根据的硬编码假数据
 */
export function calculatePromptQuality(
  promptText: string,
  framework?: string
): { clarity: number; completeness: number; structure: number } {
  if (!promptText || !promptText.trim()) {
    return { clarity: 60, completeness: 50, structure: 50 };
  }

  const text = promptText.trim();
  const len = text.length;

  // 1. 结构规范度 (Structure) 60 ~ 99
  let structure = 75;
  const headerCount = (text.match(/^#{1,4}\s+/gm) || []).length;
  const hasMarkdownHeaders = headerCount > 0;
  const hasBracketSections = /【[^】]+】/.test(text) || /\[[^\]]+\]/.test(text);
  const hasLists = /^\s*[-*•\d+.]\s+/m.test(text);
  const hasCodeBlocks = /```[\s\S]*?```/.test(text);
  const hasParagraphs = text.includes('\n\n');

  if (headerCount >= 3) structure += 14;
  else if (hasMarkdownHeaders) structure += 10;
  
  if (hasBracketSections) structure += 6;
  if (hasLists) structure += 5;
  if (hasCodeBlocks) structure += 4;
  if (hasParagraphs) structure += 4;
  if (framework && framework !== 'FREEFORM' && text.toUpperCase().includes(framework.replace(/[-_]/g, ''))) {
    structure += 4;
  }
  structure = Math.min(99, Math.max(60, structure));

  // 2. 完备度与防幻觉护栏 (Completeness) 60 ~ 99
  let completeness = 72;
  const hasNegativeConstraints = /(严禁|禁止|切勿|不要|不得|避免|不准|never|do not|avoid|must not)/i.test(text);
  const hasFormatSpec = /(输出格式|返回格式|输出规范|json|markdown|table|表格|结构化)/i.test(text);
  const hasVariables = /\{\{[^{}]+\}\}/.test(text);
  const hasExamples = /(示例|例子|example|few-shot|case)/i.test(text);

  if (hasNegativeConstraints) completeness += 10;
  if (hasFormatSpec) completeness += 9;
  if (hasVariables) completeness += 5;
  if (hasExamples) completeness += 4;
  completeness = Math.min(99, Math.max(60, completeness));

  // 3. 表达清晰度 (Clarity) 65 ~ 98
  let clarity = 80;
  if (len >= 80 && len <= 2500) clarity += 8;
  else if (len < 50) clarity -= 15;
  else if (len > 4000) clarity -= 5;

  const hasPunctuation = /[。！？.!?\n]/.test(text);
  if (hasPunctuation) clarity += 5;

  // 惩罚过于生硬的未闭合符号
  const openBrackets = (text.match(/\{/g) || []).length;
  const closeBrackets = (text.match(/\}/g) || []).length;
  if (openBrackets !== closeBrackets) clarity -= 8;

  clarity = Math.min(98, Math.max(60, clarity));

  return { clarity, completeness, structure };
}

