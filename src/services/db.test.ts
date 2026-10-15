import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { PromptTuneDB, DEFAULT_API_CONFIG, getCachedSkillSearch, setCachedSkillSearch, clearCachedSkillSearch } from './db';

describe('PromptTuneDB Service & Migrations', () => {
  let testDb: PromptTuneDB;

  beforeEach(async () => {
    testDb = new PromptTuneDB('PromptTuneDB_IsolatedTest');
    await testDb.open();
    await testDb.folders.clear();
    await testDb.prompts.clear();
    await testDb.settings.clear();
    await testDb.skills.clear();
  });

  it('initializes schema and tables correctly', () => {
    expect(testDb.folders).toBeDefined();
    expect(testDb.prompts).toBeDefined();
    expect(testDb.settings).toBeDefined();
    expect(testDb.skills).toBeDefined();
  });

  it('supports folder CRUD operations in IndexedDB', async () => {
    const folder = {
      id: 'f-1',
      parentId: null,
      name: '测试智能体工程',
      order: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      inheritParent: true,
      systemContext: '你是一名资深架构师',
      domainRules: '严格遵循低耦合高内聚',
    };

    await testDb.folders.add(folder);
    const retrieved = await testDb.folders.get('f-1');
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('测试智能体工程');
    expect(retrieved?.systemContext).toBe('你是一名资深架构师');

    // Update
    await testDb.folders.update('f-1', { name: '已重命名工程' });
    const updated = await testDb.folders.get('f-1');
    expect(updated?.name).toBe('已重命名工程');

    // Delete
    await testDb.folders.delete('f-1');
    const deleted = await testDb.folders.get('f-1');
    expect(deleted).toBeUndefined();
  });

  it('supports prompt item CRUD and parentPromptId linkage', async () => {
    const parentPrompt = {
      id: 'p-root',
      folderId: 'f-1',
      title: '主线提示词',
      originalDraft: '请帮我写一段代码',
      currentOptimized: '作为专家，编写优雅代码',
      framework: 'CO-STAR' as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      versions: [],
      turns: [],
      variables: [],
    };

    const childPrompt = {
      id: 'p-child',
      folderId: 'f-1',
      parentPromptId: 'p-root',
      title: '子分支提示词',
      originalDraft: '继续细化',
      currentOptimized: '细化函数签名与类型定义',
      framework: 'CRISPE' as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      versions: [],
      turns: [],
      variables: [],
    };

    await testDb.prompts.bulkAdd([parentPrompt, childPrompt]);

    const retrievedChild = await testDb.prompts.get('p-child');
    expect(retrievedChild?.parentPromptId).toBe('p-root');

    const children = await testDb.prompts.where('parentPromptId').equals('p-root').toArray();
    expect(children.length).toBe(1);
    expect(children[0].id).toBe('p-child');
  });

  it('supports skill search caching, retrieval and deletion', async () => {
    const mockResults = [
      {
        id: 'sk-1',
        title: 'Python 异步高性能框架',
        dimension: 'backend',
        repoName: 'fastapi/fastapi',
        repoUrl: 'https://github.com/fastapi/fastapi',
        description: '用于构建极速 API',
        rawContent: 'from fastapi import FastAPI',
        distilledPrompt: '构建高效 FastAPI 服务架构',
        framework: 'CO-STAR' as const,
        tags: ['python', 'async'],
        systemPersona: 'FastAPI 核心开发者',
        workflow: '定义路由与中间件',
        guardrails: '禁止同步阻塞调用',
        variables: [],
      },
    ];

    await setCachedSkillSearch('fastapi', mockResults);

    const cached = await getCachedSkillSearch('fastapi');
    expect(cached).not.toBeNull();
    expect(cached?.results.length).toBe(1);
    expect(cached?.results[0].title).toBe('Python 异步高性能框架');

    // Case insensitivity
    const cachedUpper = await getCachedSkillSearch('FASTAPI ');
    expect(cachedUpper).not.toBeNull();
    expect(cachedUpper?.results[0].id).toBe('sk-1');

    // Clear specific cache
    await clearCachedSkillSearch('fastapi');
    const emptyCache = await getCachedSkillSearch('fastapi');
    expect(emptyCache).toBeNull();
  });

  it('stores and retrieves default API configurations', async () => {
    await testDb.settings.put({ key: 'api_config', value: DEFAULT_API_CONFIG });
    const configEntry = await testDb.settings.get('api_config');
    expect(configEntry?.value.model).toBe('gpt-4o');
    expect(configEntry?.value.baseUrl).toBe('https://api.openai.com/v1');
  });
});
