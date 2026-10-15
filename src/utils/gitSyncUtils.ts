/**
 * gitSyncUtils.ts
 * 团队级 Prompt as Code (PaC) 规范与本地 Git 双向序列化同步引擎 (FEAT-GIT-SYNC)
 * 将本地 Dexie 数据库中的提示词工程序列化为携带 YAML FrontMatter 的标准 .prompt.md 文件树
 * 支持双向导出与解析合并，完美适配团队 Git PR 评审流与 CI/CD 持续交付
 */

import { PromptItem, FolderItem, PromptVariable } from '../types';

export interface PromptFilePayload {
  path: string; // 相对文件路径，例如 "通用能力/代码重构专家.prompt.md"
  content: string; // Markdown 正文，包含头部 YAML FrontMatter
}

/**
 * 将单个提示词项序列化为合法的 YAML FrontMatter + Markdown 正文
 */
export function serializePromptToMarkdown(
  prompt: PromptItem,
  folderPath = ''
): string {
  const frontMatterObj: Record<string, any> = {
    id: prompt.id,
    title: prompt.title,
    framework: prompt.framework || 'CO-STAR',
    folder: folderPath || undefined,
    parentPromptId: prompt.parentPromptId || undefined,
    updatedAt: new Date(prompt.updatedAt || Date.now()).toISOString(),
  };

  if (prompt.variables && prompt.variables.length > 0) {
    frontMatterObj.variables = prompt.variables.map((v) => ({
      name: v.name,
      description: v.description || '',
      defaultValue: v.defaultValue || '',
    }));
  }

  // 构造简易安全的 YAML 头部
  const yamlLines = ['---'];
  for (const [k, v] of Object.entries(frontMatterObj)) {
    if (v === undefined) continue;
    if (k === 'variables') {
      yamlLines.push('variables:');
      (v as PromptVariable[]).forEach((item) => {
        yamlLines.push(`  - name: "${item.name}"`);
        if (item.description) yamlLines.push(`    description: "${item.description.replace(/"/g, '\\"')}"`);
        if (item.defaultValue) yamlLines.push(`    defaultValue: "${item.defaultValue.replace(/"/g, '\\"')}"`);
      });
    } else {
      yamlLines.push(`${k}: "${String(v).replace(/"/g, '\\"')}"`);
    }
  }
  yamlLines.push('---');

  const bodyParts: string[] = [];
  if (prompt.originalDraft?.trim()) {
    bodyParts.push(`## 原始草稿 / Draft\n\n${prompt.originalDraft.trim()}`);
  }
  if (prompt.currentOptimized?.trim()) {
    bodyParts.push(`## 工业级优化成果 / Optimized Prompt\n\n${prompt.currentOptimized.trim()}`);
  }

  return `${yamlLines.join('\n')}\n\n${bodyParts.join('\n\n')}\n`;
}

/**
 * 解析带有 YAML FrontMatter 的 .prompt.md 文件内容
 */
export function parseMarkdownToPrompt(
  content: string,
  filePath = ''
): Partial<PromptItem> {
  const clean = content.replace(/^\uFEFF/, '').trim();
  const fmMatch = clean.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);

  let meta: Record<string, any> = {};
  let body = clean;

  if (fmMatch) {
    const rawFm = fmMatch[1];
    body = fmMatch[2];

    // 结构化解析 YAML 键值与嵌套变量
    const lines = rawFm.split('\n');
    let inVariables = false;
    let currentVarObj: any = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      if (trimmed === 'variables:' || trimmed.startsWith('variables:')) {
        inVariables = true;
        if (!meta.variables) meta.variables = [];
        continue;
      }

      if (inVariables) {
        // 识别新的变量项
        if (trimmed.startsWith('- name:')) {
          const varName = trimmed.replace(/^- name:\s*"?/, '').replace(/"?$/, '');
          currentVarObj = { name: varName, description: '', defaultValue: '', currentValue: '' };
          meta.variables.push(currentVarObj);
          continue;
        } else if (trimmed.startsWith('description:') && currentVarObj) {
          currentVarObj.description = trimmed.replace(/^description:\s*"?/, '').replace(/"?$/, '');
          continue;
        } else if (trimmed.startsWith('defaultValue:') && currentVarObj) {
          currentVarObj.defaultValue = trimmed.replace(/^defaultValue:\s*"?/, '').replace(/"?$/, '');
          continue;
        } else if (!line.startsWith(' ') && !line.startsWith('\t')) {
          // 遇到非缩进行，说明已离开 variables 块
          inVariables = false;
          currentVarObj = null;
        }
      }

      const colonIdx = trimmed.indexOf(':');
      if (colonIdx !== -1) {
        const key = trimmed.slice(0, colonIdx).trim();
        const rawVal = trimmed.slice(colonIdx + 1).trim().replace(/^"|"$/g, '');
        if (rawVal) {
          meta[key] = rawVal;
        }
      }
    }
  }

  // 提取正文中的 Optimized Prompt 与 Draft
  let draft = '';
  let optimized = '';

  const draftMatch = body.match(/## 原始草稿[^\n]*\r?\n([\s\S]*?)(?=(## [^\n]*|$))/);
  const optMatch = body.match(/## 工业级优化成果[^\n]*\r?\n([\s\S]*?)(?=(## [^\n]*|$))/);

  if (optMatch) {
    optimized = optMatch[1].trim();
  }
  if (draftMatch) {
    draft = draftMatch[1].trim();
  }

  // 若无分节标题，整篇默认为 optimized
  if (!draft && !optimized) {
    optimized = body.trim();
  }

  // 从文件名推导标题兜底
  const titleFromPath = filePath.split(/[/\\]/).pop()?.replace(/\.prompt\.md$/i, '').replace(/\.md$/i, '') || '';

  return {
    id: meta.id || `pac-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: meta.title || titleFromPath || '导入提示词',
    framework: meta.framework || 'CO-STAR',
    parentPromptId: meta.parentPromptId || undefined,
    originalDraft: draft,
    currentOptimized: optimized,
    variables: meta.variables || [],
  };
}

/**
 * 将整个工程的所有提示词按目录层级批量打包为标准文件列表
 */
export function exportProjectToPromptFiles(
  prompts: PromptItem[],
  folders: FolderItem[]
): PromptFilePayload[] {
  const folderMap = new Map<string, string>(); // folderId -> fullPath
  
  // 建立目录路径字典
  const getFolderPath = (folderId: string | null): string => {
    if (!folderId) return '';
    if (folderMap.has(folderId)) return folderMap.get(folderId)!;

    const folder = folders.find((f) => f.id === folderId);
    if (!folder) return '';

    const parentPath = getFolderPath(folder.parentId);
    const full = parentPath ? `${parentPath}/${folder.name}` : folder.name;
    folderMap.set(folderId, full);
    return full;
  };

  return prompts.map((p) => {
    const dir = getFolderPath(p.folderId);
    const safeTitle = (p.title || '未命名提示词').replace(/[/\\?%*:|"<>]/g, '_');
    const path = dir ? `${dir}/${safeTitle}.prompt.md` : `${safeTitle}.prompt.md`;
    const content = serializePromptToMarkdown(p, dir);
    return { path, content };
  });
}
