/**
 * syntaxHighlightUtils.ts
 * 提示词丰富语法分词与着色引擎 (FEAT-7)
 */

export type SyntaxTokenType = 'text' | 'variable' | 'reference' | 'xmlTag' | 'heading';

export interface SyntaxToken {
  type: SyntaxTokenType;
  raw: string;
  payload?: string;
}

/**
 * 分词解析提示词正文
 */
export function tokenizePromptSyntax(text: string): SyntaxToken[] {
  if (!text) return [];

  // 综合匹配正则：
  // 1. {{@ref}}
  // 2. {{var}}
  // 3. <tag> or </tag>
  // 4. 行首 Markdown 标题 (# 一级标题, ## 二级标题)
  const masterRegex = /(\{\{\s*@\s*[a-zA-Z0-9_\u4e00-\u9fa5.:/-]+\s*\}\}|\{\{\s*[a-zA-Z0-9_\u4e00-\u9fa5.:/-]+\s*\}\}|<\/?[a-zA-Z0-9_-]+(?:\s+[^>]*?)?>)/g;

  const parts = text.split(masterRegex);
  const tokens: SyntaxToken[] = [];

  for (const part of parts) {
    if (!part) continue;

    if (/^\{\{\s*@/.test(part) && part.endsWith('}}')) {
      const refName = part.replace(/^\{\{\s*@\s*/, '').replace(/\s*\}\}$/, '');
      tokens.push({ type: 'reference', raw: part, payload: refName });
    } else if (part.startsWith('{{') && part.endsWith('}}')) {
      const varName = part.replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '');
      tokens.push({ type: 'variable', raw: part, payload: varName });
    } else if (/^<\/?[a-zA-Z0-9_-]+(?:\s+[^>]*?)?>$/.test(part)) {
      tokens.push({ type: 'xmlTag', raw: part, payload: part });
    } else {
      tokens.push({ type: 'text', raw: part });
    }
  }

  return tokens;
}

export type PromptBlockType = 'text' | 'codeBlock';

export interface PromptBlock {
  type: PromptBlockType;
  raw: string;
  lang?: string;
  code?: string;
}

/**
 * 将提示词正文拆解为普通文本段落与 Markdown 围栏代码块 (用于独立代码美化与单键复制)
 */
export function splitPromptBlocks(text: string): PromptBlock[] {
  if (!text) return [];

  const codeFenceRegex = /```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g;
  const blocks: PromptBlock[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeFenceRegex.exec(text)) !== null) {
    const matchIndex = match.index;
    if (matchIndex > lastIndex) {
      const textChunk = text.slice(lastIndex, matchIndex);
      if (textChunk) {
        blocks.push({ type: 'text', raw: textChunk });
      }
    }

    const lang = (match[1] || 'text').trim();
    const code = match[2] || '';
    blocks.push({
      type: 'codeBlock',
      raw: match[0],
      lang,
      code,
    });

    lastIndex = codeFenceRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex);
    if (remaining) {
      blocks.push({ type: 'text', raw: remaining });
    }
  }

  return blocks;
}

