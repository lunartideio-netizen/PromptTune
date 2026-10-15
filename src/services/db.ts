import Dexie, { type Table } from 'dexie';
import { Folder, PromptItem, APIConfig, SkillItem, SkillHunterResult } from '../types';

export class PromptTuneDB extends Dexie {
  folders!: Table<Folder, string>;
  prompts!: Table<PromptItem, string>;
  settings!: Table<{ key: string; value: any }, string>;
  skills!: Table<SkillItem, string>;

  constructor(dbName = 'PromptTuneDB') {
    super(dbName);
    this.version(1).stores({
      folders: 'id, parentId, name, order, createdAt',
      prompts: 'id, folderId, title, framework, createdAt, updatedAt',
      settings: 'key',
    });
    this.version(2).stores({
      folders: 'id, parentId, name, order, createdAt',
      prompts: 'id, folderId, title, framework, createdAt, updatedAt',
      settings: 'key',
      skills: 'id, category, title, framework, createdAt, updatedAt',
    });
    this.version(3).stores({
      folders: 'id, parentId, name, order, createdAt',
      prompts: 'id, folderId, parentPromptId, title, framework, createdAt, updatedAt',
      settings: 'key',
      skills: 'id, category, title, framework, createdAt, updatedAt',
    });
  }
}

export const db = new PromptTuneDB();

export const DEFAULT_API_CONFIG: APIConfig = {
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o',
  temperature: 0.7,
  maxTokens: 3000,
  topP: 0.95,
  useMockFallback: false,
};

export async function initDatabase() {
  // Purge any legacy fake mock data if present from earlier runs
  const legacyFolders = await db.folders.where('id').anyOf(['folder-tech', 'folder-react19', 'folder-business', 'folder-copywriting']).toArray();
  if (legacyFolders.length > 0) {
    await db.folders.bulkDelete(legacyFolders.map((f) => f.id));
  }
  const legacyPrompts = await db.prompts.where('id').anyOf(['prompt-1', 'prompt-2', 'prompt-3']).toArray();
  if (legacyPrompts.length > 0) {
    await db.prompts.bulkDelete(legacyPrompts.map((p) => p.id));
  }
  const legacySkills = await db.skills.where('id').anyOf(['skill-design-1', 'skill-coding-1', 'skill-copywriting-1', 'skill-business-1']).toArray();
  if (legacySkills.length > 0) {
    await db.skills.bulkDelete(legacySkills.map((s) => s.id));
  }

  // Ensure default API configuration exists or upgrade empty config
  const settingsEntry = await db.settings.get('api_config');
  if (!settingsEntry || !settingsEntry.value || !settingsEntry.value.baseUrl) {
    await db.settings.put({ key: 'api_config', value: DEFAULT_API_CONFIG });
  } else if (settingsEntry.value.baseUrl?.includes('10100') && settingsEntry.value.model === 'gemini-3.8') {
    // 自动修正历史遗留的无效简写模型名称
    const upgraded = { ...settingsEntry.value, model: 'google-antigravity/gemini-3.8-flash' };
    await db.settings.put({ key: 'api_config', value: upgraded });
  }

  // Seed default skills ONLY ONCE on first installation
  // Never re-seed if the user intentionally deleted/emptied their skills!
  const skillsSeeded = await db.settings.get('skills_initialized');
  if (!skillsSeeded) {
    await db.settings.put({ key: 'skills_initialized', value: true });
    // On fresh install, if the table is truly uninitialized, seed once
    const skillCount = await db.skills.count();
    if (skillCount === 0) {
      // Clean start: We do NOT force seed these unwanted mock skills anymore
      // or only seed if desired. Let's keep skills clean!
    }
  }
}

/**
 * 获取本地缓存的技能检索结果 (秒级极速命中)
 */
export async function getCachedSkillSearch(
  query: string
): Promise<{ results: SkillHunterResult[]; updatedAt: number } | null> {
  const cleanKey = `skill_cache_${query.trim().toLowerCase()}`;
  try {
    const entry = await db.settings.get(cleanKey);
    if (entry?.value && Array.isArray(entry.value.results) && entry.value.results.length > 0) {
      return {
        results: entry.value.results,
        updatedAt: entry.value.updatedAt || Date.now(),
      };
    }
  } catch (err) {
    console.warn('读取本地技能搜索缓存异常:', err);
  }
  return null;
}

/**
 * 写入本地技能检索结果持久化缓存
 */
export async function setCachedSkillSearch(
  query: string,
  results: SkillHunterResult[]
): Promise<void> {
  const cleanKey = `skill_cache_${query.trim().toLowerCase()}`;
  try {
    await db.settings.put({
      key: cleanKey,
      value: {
        query: query.trim().toLowerCase(),
        results,
        updatedAt: Date.now(),
      },
    });
  } catch (err) {
    console.warn('写入本地技能搜索缓存异常:', err);
  }
}

/**
 * 清除特定关键词或所有技能检索缓存
 */
export async function clearCachedSkillSearch(query?: string): Promise<void> {
  try {
    if (query) {
      const cleanKey = `skill_cache_${query.trim().toLowerCase()}`;
      await db.settings.delete(cleanKey);
    } else {
      const allKeys = await db.settings.toCollection().primaryKeys();
      const cacheKeys = allKeys.filter((k) => typeof k === 'string' && k.startsWith('skill_cache_'));
      await db.settings.bulkDelete(cacheKeys);
    }
  } catch (err) {
    console.warn('清理技能搜索缓存异常:', err);
  }
}

