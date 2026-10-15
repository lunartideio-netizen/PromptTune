import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';

// Node localStorage polyfill
if (typeof window === 'undefined' || !window.localStorage) {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => store.set(key, String(val)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
}

import { useAppStore } from './useAppStore';
import { db } from '../services/db';
import { syncVariables } from '../services/llmService';

describe('useAppStore Comprehensive Integration Suite', () => {
  beforeEach(async () => {
    localStorage.clear();
    await db.open();
    await db.folders.clear();
    await db.prompts.clear();
    await db.settings.clear();
    await db.skills.clear();

    // Reset store state
    useAppStore.setState({
      folders: [],
      prompts: [],
      skills: [],
      activePromptId: null,
      activeFolderId: null,
      activeTab: 'optimize',
      isScratchpadActive: true,
      customFrameworks: [],
      sidebarWidth: 260,
      theme: 'system',
    });
  });

  describe('Initialization', () => {
    it('initializes store from database', async () => {
      const store = useAppStore.getState();
      await store.initialize();
      expect(useAppStore.getState().apiConfig).toBeDefined();
    });
  });

  describe('Folder CRUD & Context Hierarchy', () => {
    it('creates root folder, subfolder, and renames folder', async () => {
      const store = useAppStore.getState();
      const rootFolderId = await store.createFolder(null, '全栈工程');
      expect(rootFolderId).toBeDefined();

      const subFolderId = await store.createFolder(rootFolderId, '前端微服务');
      expect(subFolderId).toBeDefined();

      const currentFolders = useAppStore.getState().folders;
      expect(currentFolders.length).toBe(2);
      expect(currentFolders.find((f) => f.id === subFolderId)?.parentId).toBe(rootFolderId);

      // Rename
      await store.renameFolder(subFolderId, 'Next.js微服务');
      const renamed = useAppStore.getState().folders.find((f) => f.id === subFolderId);
      expect(renamed?.name).toBe('Next.js微服务');

      // Delete subfolder
      await store.deleteFolder(subFolderId);
      expect(useAppStore.getState().folders.length).toBe(1);
    });

    it('correctly aggregates multi-level inherited contexts and domain rules', async () => {
      const store = useAppStore.getState();
      const parentId = await store.createFolder(null, '顶层架构');
      await store.updateFolder(parentId, {
        systemContext: '你是一名资深架构师',
        domainRules: '严格遵循云原生十二要素',
      });

      const childId = await store.createFolder(parentId, '子模块');
      await store.updateFolder(childId, {
        systemContext: '专注性能分析与调优',
        domainRules: '首字延迟低于200ms',
        inheritParent: true,
      });

      const promptId = await store.createPrompt(childId, 'API性能优化专家');

      const inheritance = useAppStore.getState().getInheritedContextForPrompt(promptId);
      expect(inheritance.ancestors.length).toBe(2);
      expect(inheritance.combinedSystemContext).toContain('你是一名资深架构师');
      expect(inheritance.combinedSystemContext).toContain('专注性能分析与调优');
      expect(inheritance.combinedDomainRules).toContain('严格遵循云原生十二要素');
      expect(inheritance.combinedDomainRules).toContain('首字延迟低于200ms');

      // Test boundary when inheritParent is false
      await store.updateFolder(childId, { inheritParent: false });
      const isolatedInheritance = useAppStore.getState().getInheritedContextForPrompt(promptId);
      expect(isolatedInheritance.ancestors.length).toBe(1);
      expect(isolatedInheritance.combinedSystemContext).not.toContain('你是一名资深架构师');
      expect(isolatedInheritance.combinedSystemContext).toContain('专注性能分析与调优');
    });
  });

  describe('Prompt Lifecycle & Variable Auto-Detection', () => {
    it('creates prompt, updates variables, and duplicates prompt', async () => {
      const store = useAppStore.getState();
      const folderId = await store.createFolder(null, '营销中心');
      const promptId = await store.createPrompt(folderId, '小红书文案爆款生成器');

      expect(useAppStore.getState().prompts.length).toBe(1);
      expect(useAppStore.getState().activePromptId).toBe(promptId);

      // Update prompt content with variables
      const draft = '请为 {{productName}} 撰写一篇针对 {{targetAudience}} 的爆款种草文案';
      const vars = syncVariables([], draft);
      await store.updatePrompt(promptId, {
        originalDraft: draft,
        variables: vars,
      });

      const updated = useAppStore.getState().prompts.find((p) => p.id === promptId);
      expect(updated?.variables.length).toBe(2);
      expect(updated?.variables.map((v) => v.name)).toEqual(['productName', 'targetAudience']);

      // Duplicate prompt
      const copyId = await store.duplicatePrompt(promptId);
      const copied = useAppStore.getState().prompts.find((p) => p.id === copyId);
      expect(copied).toBeDefined();
      expect(copied?.title).toContain('副本');
      expect(copied?.variables.length).toBe(2);

      // Delete prompt
      await store.deletePrompt(copyId);
      expect(useAppStore.getState().prompts.length).toBe(1);
    });

    it('creates child prompt linked to parentPromptId for pipeline branch', async () => {
      const store = useAppStore.getState();
      const parentId = await store.createPrompt(null, '主线工作流');
      const childId = await store.createChildPrompt(parentId, '下游派生测试');

      const child = useAppStore.getState().prompts.find((p) => p.id === childId);
      expect(child?.parentPromptId).toBe(parentId);
      expect(child?.title).toBe('下游派生测试');
    });

    it('records version snapshots with instruction and framework metadata', async () => {
      const store = useAppStore.getState();
      const promptId = await store.createPrompt(null, '版本测试提示词');

      await store.addPromptVersion(promptId, {
        version: 1,
        timestamp: Date.now(),
        instruction: '初始结构重塑',
        promptText: '重塑后内容',
        framework: 'CO-STAR',
        tokenCount: 42,
      });

      const prompt = useAppStore.getState().prompts.find((p) => p.id === promptId);
      expect(prompt?.versions.length).toBe(1);
      expect(prompt?.versions[0].version).toBe(1);
      expect(prompt?.versions[0].instruction).toBe('初始结构重塑');
      expect(prompt?.currentOptimized).toBe('重塑后内容');
    });

    it('records multi-turn dialogue optimization history', async () => {
      const store = useAppStore.getState();
      const promptId = await store.createPrompt(null, '多轮对话测试');

      await store.addOptimizationTurn(promptId, {
        id: 'turn-1',
        role: 'user',
        content: '增加负向提示词红线',
        refinedPrompt: '更新后的提示词',
        rationale: '约束输出行为',
        timestamp: Date.now(),
      });

      const prompt = useAppStore.getState().prompts.find((p) => p.id === promptId);
      expect(prompt?.turns.length).toBe(1);
      expect(prompt?.turns[0].content).toBe('增加负向提示词红线');
    });
  });

  describe('Quick Scratchpad & Archiving', () => {
    it('manages ephemeral scratchpad and archives it to a persistent prompt', async () => {
      const store = useAppStore.getState();
      store.setIsScratchpadActive(true);
      store.setScratchpadDraft('快速临时实验草稿：{{topic}}');
      store.syncScratchpadVariables();

      expect(useAppStore.getState().scratchpadVariables.length).toBe(1);
      expect(useAppStore.getState().scratchpadVariables[0].name).toBe('topic');

      store.setScratchpadOptimized('深度优化版临时提示词');

      // Archive to folder
      const folderId = await store.createFolder(null, '归档目录');
      const archivedPromptId = await store.archiveScratchpadToFolder(folderId, '从便签归档的提示词');

      expect(archivedPromptId).toBeDefined();
      const archived = useAppStore.getState().prompts.find((p) => p.id === archivedPromptId);
      expect(archived?.title).toBe('从便签归档的提示词');
      expect(archived?.currentOptimized).toBe('深度优化版临时提示词');
      expect(archived?.folderId).toBe(folderId);

      // Clear scratchpad
      store.clearScratchpad();
      expect(useAppStore.getState().scratchpadDraft).toBe('');
      expect(useAppStore.getState().scratchpadOptimized).toBe('');
    });
  });

  describe('Custom Frameworks & UI State', () => {
    it('adds and deletes custom engineering frameworks', async () => {
      const store = useAppStore.getState();
      await store.addCustomFramework({
        id: 'REACT_AGENT',
        name: 'ReAct Agent 架构',
        badge: '智能体',
        desc: 'Thought, Action, Observation, Reflection',
      });

      expect(useAppStore.getState().customFrameworks.length).toBe(1);
      expect(useAppStore.getState().customFrameworks[0].id).toBe('REACT_AGENT');

      await store.deleteCustomFramework('REACT_AGENT');
      expect(useAppStore.getState().customFrameworks.length).toBe(0);
    });

    it('toggles themes in system -> dark -> light -> system cycle', () => {
      const store = useAppStore.getState();
      expect(store.theme).toBe('system');

      store.toggleTheme();
      expect(useAppStore.getState().theme).toBe('dark');

      store.toggleTheme();
      expect(useAppStore.getState().theme).toBe('light');

      store.toggleTheme();
      expect(useAppStore.getState().theme).toBe('system');
    });

    it('clamps sidebar width within [180, 520] boundaries', () => {
      const store = useAppStore.getState();
      store.setSidebarWidth(100);
      expect(useAppStore.getState().sidebarWidth).toBe(180);

      store.setSidebarWidth(800);
      expect(useAppStore.getState().sidebarWidth).toBe(520);

      store.setSidebarWidth(320);
      expect(useAppStore.getState().sidebarWidth).toBe(320);
    });
  });
});
