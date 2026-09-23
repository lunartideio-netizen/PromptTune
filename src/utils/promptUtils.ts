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
