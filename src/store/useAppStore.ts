import { create } from 'zustand';
import { 
  Folder, 
  PromptItem, 
  APIConfig, 
  FrameworkType, 
  FolderContextAncestor, 
  PromptVersion, 
  OptimizationTurn,
  PromptVariable,
  SkillItem,
  SkillCategory,
  CustomFramework 
} from '../types';
import { db, DEFAULT_API_CONFIG, initDatabase } from '../services/db';
import { extractVariablesFromText, syncVariables, extractPromptReferences, extractSmartTitleFromDraft } from '../services/llmService';

interface AppStoreState {
  folders: Folder[];
  prompts: PromptItem[];
  activePromptId: string | null;
  activeFolderId: string | null;
  activeTab: 'optimize' | 'ab_test' | 'variables' | 'versions';
  apiConfig: APIConfig;
  searchQuery: string;
  expandedFolderIds: Set<string>;
  
  // Resizable & Collapsible Sidebar
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;

  // Theme (Dark / Light / System)
  theme: 'system' | 'light' | 'dark';
  setTheme: (theme: 'system' | 'light' | 'dark') => void;
  toggleTheme: () => void;

  // Modals
  isSettingsOpen: boolean;
  contextModalFolderId: string | null;
  isSkillHunterOpen: boolean;
  setIsSkillHunterOpen: (open: boolean) => void;

  // Global Toast
  toast: { message: string; type?: 'info' | 'error' | 'success' } | null;
  showToast: (message: string, type?: 'info' | 'error' | 'success') => void;

  // Custom Frameworks (FEAT-5)
  customFrameworks: CustomFramework[];
  addCustomFramework: (fw: Omit<CustomFramework, 'isCustom'>) => Promise<void>;
  deleteCustomFramework: (id: string) => Promise<void>;

  // Quick Scratchpad (独立单次优化台 / 单独问)
  isScratchpadActive: boolean;
  scratchpadDraft: string;
  scratchpadOptimized: string;
  scratchpadFramework: FrameworkType;
  scratchpadTurns: OptimizationTurn[];
  scratchpadVariables: PromptVariable[];
  scratchpadVersions: PromptVersion[];
  setIsScratchpadActive: (active: boolean) => void;
  setScratchpadDraft: (draft: string) => void;
  setScratchpadOptimized: (opt: string) => void;
  setScratchpadFramework: (fw: FrameworkType) => void;
  addScratchpadTurn: (turn: OptimizationTurn) => void;
  setScratchpadVariables: (vars: PromptVariable[]) => void;
  addScratchpadVersion: (version: PromptVersion) => void;
  syncScratchpadVariables: () => void;
  clearScratchpad: () => void;
  archiveScratchpadToFolder: (folderId: string | null, title?: string) => Promise<string>;

  // Actions
  initialize: () => Promise<void>;
  setActivePromptId: (id: string | null) => void;
  setActiveFolderId: (id: string | null) => void;
  setActiveTab: (tab: 'optimize' | 'ab_test' | 'variables' | 'versions') => void;
  setSearchQuery: (query: string) => void;
  toggleFolderExpand: (folderId: string) => void;
  setIsSettingsOpen: (open: boolean) => void;
  setContextModalFolderId: (folderId: string | null) => void;

  // CRUD Folders
  createFolder: (parentId: string | null, name: string) => Promise<string>;
  updateFolder: (id: string, updates: Partial<Folder>) => Promise<void>;
  renameFolder: (folderId: string, newName: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;

  // CRUD Prompts
  createPrompt: (folderId: string | null, title?: string) => Promise<string>;
  updatePrompt: (id: string, updates: Partial<PromptItem>) => Promise<void>;
  /** 基于父提示词创建链路子节点 */
  createChildPrompt: (parentPromptId: string, title?: string) => Promise<string>;
  renamePrompt: (promptId: string, newTitle: string) => Promise<void>;
  duplicatePrompt: (promptId: string) => Promise<string>;
  movePromptToFolder: (promptId: string, targetFolderId: string | null) => Promise<void>;
  deletePrompt: (id: string) => Promise<void>;
  addPromptVersion: (promptId: string, version: PromptVersion) => Promise<void>;
  addOptimizationTurn: (promptId: string, turn: OptimizationTurn) => Promise<void>;
  updateVariables: (promptId: string, variables: PromptVariable[]) => Promise<void>;

  // Settings
  updateAPIConfig: (config: APIConfig) => Promise<void>;

  // Backup & Restore
  exportFullDatabaseBackup: () => Promise<string>;
  importFullDatabaseBackup: (jsonString: string) => Promise<{ success: boolean; count: { folders: number; prompts: number }; error?: string }>;

  // Project Master Bundle Export
  exportFolderMasterBundle: (folderId: string, format: 'markdown' | 'json') => Promise<{ filename: string; content: string }>;

  // Skills Hub & Manager
  skills: SkillItem[];
  activeSkillCategory: SkillCategory;
  setActiveSkillCategory: (cat: SkillCategory) => void;
  saveSkill: (skill: SkillItem) => Promise<void>;
  deleteSkill: (id: string) => Promise<void>;
  applySkillToCurrent: (skill: SkillItem) => void;
  assembleSkillToCurrent: (skill: SkillItem) => void;
  cleanLegacySkillFolders: () => Promise<void>;

  // Context inheritance logic
  getFolderAncestors: (folderId: string | null) => FolderContextAncestor[];
  getInheritedContextForPrompt: (promptId: string | null) => {
    combinedSystemContext: string;
    combinedDomainRules: string;
    ancestors: FolderContextAncestor[];
  };
}

const SCRATCHPAD_STORAGE_KEY = 'prompttune_scratchpad_snapshot_v1';

function saveScratchpadSnapshot(state: {
  scratchpadDraft: string;
  scratchpadOptimized: string;
  scratchpadFramework: FrameworkType;
  scratchpadTurns: any[];
  scratchpadVariables: any[];
  scratchpadVersions: any[];
}) {
  try {
    const hasContent = Boolean(
      state.scratchpadDraft?.trim() ||
      state.scratchpadOptimized?.trim() ||
      (state.scratchpadTurns && state.scratchpadTurns.length > 0) ||
      (state.scratchpadVersions && state.scratchpadVersions.length > 0)
    );
    if (hasContent) {
      localStorage.setItem(SCRATCHPAD_STORAGE_KEY, JSON.stringify({
        scratchpadDraft: state.scratchpadDraft,
        scratchpadOptimized: state.scratchpadOptimized,
        scratchpadFramework: state.scratchpadFramework,
        scratchpadTurns: state.scratchpadTurns,
        scratchpadVariables: state.scratchpadVariables,
        scratchpadVersions: state.scratchpadVersions,
        updatedAt: Date.now(),
      }));
    } else {
      localStorage.removeItem(SCRATCHPAD_STORAGE_KEY);
    }
  } catch (err) {
    console.warn('[PromptTune] 暂存便签草稿失败:', err);
  }
}

function loadScratchpadSnapshot() {
  try {
    const raw = localStorage.getItem(SCRATCHPAD_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearScratchpadSnapshot() {
  try {
    localStorage.removeItem(SCRATCHPAD_STORAGE_KEY);
  } catch {}
}

export const useAppStore = create<AppStoreState>((set, get) => ({
  folders: [],
  prompts: [],
  skills: [],
  activeSkillCategory: 'all',
  activePromptId: null,
  activeFolderId: null,
  activeTab: 'optimize',
  apiConfig: DEFAULT_API_CONFIG,
  searchQuery: '',
  expandedFolderIds: new Set<string>(),

  // Resizable & Collapsible Sidebar
  sidebarWidth: (() => {
    try {
      const stored = localStorage.getItem('prompttune_sidebar_width_v1');
      if (stored) {
        const val = parseInt(stored, 10);
        if (!isNaN(val) && val >= 180 && val <= 520) return val;
      }
    } catch {}
    return 260;
  })(),
  setSidebarWidth: (width: number) => {
    const clamped = Math.min(Math.max(width, 180), 520);
    try {
      localStorage.setItem('prompttune_sidebar_width_v1', clamped.toString());
    } catch {}
    set({ sidebarWidth: clamped });
  },
  isSidebarCollapsed: (() => {
    try {
      return localStorage.getItem('prompttune_sidebar_collapsed_v1') === 'true';
    } catch {
      return false;
    }
  })(),
  setIsSidebarCollapsed: (isSidebarCollapsed: boolean) => {
    try {
      localStorage.setItem('prompttune_sidebar_collapsed_v1', isSidebarCollapsed.toString());
    } catch {}
    set({ isSidebarCollapsed });
  },
  toggleSidebarCollapsed: () => {
    const next = !get().isSidebarCollapsed;
    try {
      localStorage.setItem('prompttune_sidebar_collapsed_v1', next.toString());
    } catch {}
    set({ isSidebarCollapsed: next });
  },

  theme: (() => {
    try {
      const stored = localStorage.getItem('prompttune_theme_mode');
      if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    } catch {}
    return 'system';
  })(),
  setTheme: (theme: 'system' | 'light' | 'dark') => {
    try {
      localStorage.setItem('prompttune_theme_mode', theme);
    } catch {}
    set({ theme });
  },
  toggleTheme: () => {
    const current = get().theme;
    const next = current === 'dark' ? 'light' : current === 'light' ? 'system' : 'dark';
    get().setTheme(next);
  },

  isSettingsOpen: false,
  contextModalFolderId: null,
  isSkillHunterOpen: false,
  setIsSkillHunterOpen: (isSkillHunterOpen) => set({ isSkillHunterOpen }),
  setActiveSkillCategory: (activeSkillCategory) => set({ activeSkillCategory }),

  toast: null,
  showToast: (message, type = 'info') => {
    set({ toast: { message, type } });
    setTimeout(() => {
      set((state) => (state.toast?.message === message ? { toast: null } : {}));
    }, 3800);
  },

  customFrameworks: [],
  addCustomFramework: async (fw) => {
    const next = [...get().customFrameworks.filter((f) => f.id !== fw.id), { ...fw, isCustom: true }];
    await db.settings.put({ key: 'custom_frameworks', value: next });
    set({ customFrameworks: next });
    get().showToast(`已成功添加框架「${fw.name}」`, 'success');
  },
  deleteCustomFramework: async (id) => {
    const next = get().customFrameworks.filter((f) => f.id !== id);
    await db.settings.put({ key: 'custom_frameworks', value: next });
    set({ customFrameworks: next });
    get().showToast('已删除自定义框架', 'info');
  },

  saveSkill: async (skill) => {
    await db.skills.put(skill);
    set((state) => {
      const idx = state.skills.findIndex((s) => s.id === skill.id);
      if (idx >= 0) {
        const next = [...state.skills];
        next[idx] = skill;
        return { skills: next };
      }
      return { skills: [skill, ...state.skills] };
    });
  },

  deleteSkill: async (id) => {
    await db.skills.delete(id);
    set((state) => ({
      skills: state.skills.filter((s) => s.id !== id),
    }));
  },

  applySkillToCurrent: (skill) => {
    const { isScratchpadActive, activePromptId, prompts, updatePrompt } = get();
    if (isScratchpadActive || !activePromptId) {
      get().setScratchpadDraft(skill.distilledPrompt);
      get().setScratchpadFramework(skill.framework);
    } else {
      const p = prompts.find((x) => x.id === activePromptId);
      const syncedVars = syncVariables(p?.variables || [], skill.distilledPrompt + '\n' + (p?.currentOptimized || ''));
      updatePrompt(activePromptId, {
        originalDraft: skill.distilledPrompt,
        framework: skill.framework,
        variables: syncedVars,
      });
    }
  },

  assembleSkillToCurrent: (skill) => {
    const { isScratchpadActive, activePromptId, prompts, scratchpadDraft, updatePrompt } = get();
    const assembledHeader = `【装配专家技能：${skill.title}】\n【角色定位】：${skill.systemPersona}\n【执行工作流】：\n${skill.workflow}\n【负向红线与约束】：\n${skill.guardrails}\n\n`;

    if (isScratchpadActive || !activePromptId) {
      const nextDraft = assembledHeader + (scratchpadDraft ? `【当前业务输入需求】：\n${scratchpadDraft}` : '');
      get().setScratchpadDraft(nextDraft);
      get().setScratchpadFramework(skill.framework);
    } else {
      const p = prompts.find((x) => x.id === activePromptId);
      const prevDraft = p?.originalDraft || '';
      const nextDraft = assembledHeader + (prevDraft ? `【当前业务输入需求】：\n${prevDraft}` : '');
      const syncedVars = syncVariables(p?.variables || [], nextDraft + '\n' + (p?.currentOptimized || ''));
      updatePrompt(activePromptId, {
        originalDraft: nextDraft,
        framework: skill.framework,
        variables: syncedVars,
      });
    }
  },

  cleanLegacySkillFolders: async () => {
    const folders = await db.folders.toArray();
    const legacyFolders = folders.filter((f) => 
      f.name.startsWith('Skill - ') || 
      f.name.startsWith('🎯 Skill - ') ||
      f.name.startsWith('📦 Skill - ')
    );
    if (legacyFolders.length === 0) return;

    const legacyFolderIds = new Set(legacyFolders.map((f) => f.id));
    const prompts = await db.prompts.toArray();
    const legacyPrompts = prompts.filter((p) => p.folderId && legacyFolderIds.has(p.folderId));

    if (legacyPrompts.length > 0) {
      await db.prompts.bulkDelete(legacyPrompts.map((p) => p.id));
    }
    await db.folders.bulkDelete(Array.from(legacyFolderIds));

    set((state) => {
      const remainingFolders = state.folders.filter((f) => !legacyFolderIds.has(f.id));
      const remainingPrompts = state.prompts.filter((p) => !p.folderId || !legacyFolderIds.has(p.folderId));
      return {
        folders: remainingFolders,
        prompts: remainingPrompts,
        activeFolderId: state.activeFolderId && legacyFolderIds.has(state.activeFolderId) ? null : state.activeFolderId,
        activePromptId: state.activePromptId && legacyPrompts.some((p) => p.id === state.activePromptId)
          ? (remainingPrompts[0]?.id || null)
          : state.activePromptId,
      };
    });
  },

  // Quick Scratchpad default state
  isScratchpadActive: true, // Default to Scratchpad for instant out-of-the-box usage!
  scratchpadDraft: '',
  scratchpadOptimized: '',
  scratchpadFramework: 'CO-STAR',
  scratchpadTurns: [],
  scratchpadVariables: [],
  scratchpadVersions: [],

  setIsScratchpadActive: (active) => set({ isScratchpadActive: active }),
  setScratchpadDraft: (draft) => {
    const { scratchpadOptimized, scratchpadVariables } = get();
    const synced = syncVariables(scratchpadVariables, draft + '\n' + (scratchpadOptimized || ''));
    set({ scratchpadDraft: draft, scratchpadVariables: synced });
    saveScratchpadSnapshot(get());
  },
  setScratchpadOptimized: (opt) => {
    set({ scratchpadOptimized: opt });
    const { scratchpadDraft, scratchpadVariables } = get();
    const synced = syncVariables(scratchpadVariables, (scratchpadDraft || '') + '\n' + opt);
    set({ scratchpadVariables: synced });
    saveScratchpadSnapshot(get());
  },
  setScratchpadFramework: (fw) => {
    set({ scratchpadFramework: fw });
    saveScratchpadSnapshot(get());
  },
  addScratchpadTurn: (turn) => {
    set((s) => ({ scratchpadTurns: [...s.scratchpadTurns, turn] }));
    saveScratchpadSnapshot(get());
  },
  setScratchpadVariables: (vars) => {
    set({ scratchpadVariables: vars });
    saveScratchpadSnapshot(get());
  },
  addScratchpadVersion: (version) => {
    set((s) => ({
      scratchpadVersions: [...s.scratchpadVersions, version],
      scratchpadOptimized: version.promptText,
    }));
    saveScratchpadSnapshot(get());
  },
  syncScratchpadVariables: () => {
    const { scratchpadDraft, scratchpadOptimized, scratchpadVariables } = get();
    const synced = syncVariables(scratchpadVariables, (scratchpadDraft || '') + '\n' + (scratchpadOptimized || ''));
    set({ scratchpadVariables: synced });
    saveScratchpadSnapshot(get());
  },
  clearScratchpad: () => {
    set({
      scratchpadDraft: '',
      scratchpadOptimized: '',
      scratchpadTurns: [],
      scratchpadVariables: [],
      scratchpadVersions: [],
    });
    clearScratchpadSnapshot();
  },

  archiveScratchpadToFolder: async (folderId, title) => {
    const { 
      scratchpadDraft, 
      scratchpadOptimized, 
      scratchpadFramework, 
      scratchpadTurns, 
      scratchpadVariables, 
      scratchpadVersions 
    } = get();
    const finalTitle = (title && title.trim() && title !== '快速优化提示词')
      ? title.trim()
      : (extractSmartTitleFromDraft(scratchpadDraft) || '快速优化提示词');
    const variables = syncVariables(scratchpadVariables, scratchpadDraft + '\n' + scratchpadOptimized);
    const versions: PromptVersion[] = scratchpadVersions.length > 0 
      ? scratchpadVersions 
      : (scratchpadOptimized ? [{
          version: 1,
          promptText: scratchpadOptimized,
          instruction: '从单次独立优化台归档',
          framework: scratchpadFramework,
          timestamp: Date.now(),
          tokenCount: Math.ceil(scratchpadOptimized.length / 3),
          qualityScore: { clarity: 95, completeness: 92, structure: 96 },
        }] : []);

    const newPrompt: PromptItem = {
      id: `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      folderId,
      title: finalTitle,
      originalDraft: scratchpadDraft,
      currentOptimized: scratchpadOptimized,
      framework: scratchpadFramework,
      variables,
      versions,
      turns: scratchpadTurns,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.prompts.add(newPrompt);
    clearScratchpadSnapshot();

    set((state) => ({
      prompts: [newPrompt, ...state.prompts],
      activePromptId: newPrompt.id,
      activeFolderId: folderId,
      isScratchpadActive: false,
      activeTab: 'optimize',
    }));
    return newPrompt.id;
  },

  initialize: async () => {
    await initDatabase();
    const [folders, prompts, settingsRow, skills, customFwRow] = await Promise.all([
      db.folders.orderBy('order').toArray(),
      db.prompts.toArray(),
      db.settings.get('api_config'),
      db.skills.toArray(),
      db.settings.get('custom_frameworks'),
    ]);

    const apiConfig = settingsRow?.value || DEFAULT_API_CONFIG;
    const customFrameworks = (customFwRow?.value as CustomFramework[]) || [];
    const hasPrompts = prompts.length > 0;
    const savedScratchpad = loadScratchpadSnapshot();
    const hasScratchpadContent = savedScratchpad && Boolean(
      savedScratchpad.scratchpadDraft?.trim() ||
      savedScratchpad.scratchpadOptimized?.trim() ||
      (savedScratchpad.scratchpadTurns && savedScratchpad.scratchpadTurns.length > 0)
    );

    set({
      folders,
      prompts,
      skills,
      apiConfig,
      customFrameworks,
      activePromptId: hasPrompts ? (hasScratchpadContent ? null : prompts[0].id) : null,
      isScratchpadActive: !hasPrompts || Boolean(hasScratchpadContent),
      ...(savedScratchpad ? {
        scratchpadDraft: savedScratchpad.scratchpadDraft || '',
        scratchpadOptimized: savedScratchpad.scratchpadOptimized || '',
        scratchpadFramework: savedScratchpad.scratchpadFramework || 'CO-STAR',
        scratchpadTurns: savedScratchpad.scratchpadTurns || [],
        scratchpadVariables: savedScratchpad.scratchpadVariables || [],
        scratchpadVersions: savedScratchpad.scratchpadVersions || [],
      } : {}),
    });

    // Clean up any historical skill folders created before decoupling
    await get().cleanLegacySkillFolders();
  },

  setActivePromptId: (activePromptId) => set({ activePromptId, isScratchpadActive: false }),
  setActiveFolderId: (activeFolderId) => set({ activeFolderId }),
  setActiveTab: (activeTab) => {
    const { isScratchpadActive, activePromptId, prompts, scratchpadDraft, scratchpadOptimized, scratchpadVariables, updateVariables } = get();
    if (activeTab === 'ab_test') {
      if (isScratchpadActive || !activePromptId) {
        const synced = syncVariables(scratchpadVariables, (scratchpadDraft || '') + '\n' + (scratchpadOptimized || ''));
        set({ scratchpadVariables: synced, activeTab });
        return;
      }
      const prompt = prompts.find((p) => p.id === activePromptId);
      if (prompt) {
        const synced = syncVariables(prompt.variables, (prompt.originalDraft || '') + '\n' + (prompt.currentOptimized || ''));
        updateVariables(prompt.id, synced);
      }
    }
    set({ activeTab });
  },
  setSearchQuery: (searchQuery) => set({ searchQuery }),

  toggleFolderExpand: (folderId) => {
    set((state) => {
      const next = new Set(state.expandedFolderIds);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return { expandedFolderIds: next };
    });
  },

  setIsSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),
  setContextModalFolderId: (contextModalFolderId) => set({ contextModalFolderId }),

  createFolder: async (parentId, name) => {
    const newFolder: Folder = {
      id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      parentId,
      name,
      icon: 'Folder',
      systemContext: '',
      domainRules: '',
      inheritParent: true,
      order: get().folders.length,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.folders.add(newFolder);
    set((state) => ({
      folders: [...state.folders, newFolder],
      expandedFolderIds: parentId ? new Set([...state.expandedFolderIds, parentId]) : state.expandedFolderIds,
    }));
    return newFolder.id;
  },

  updateFolder: async (id, updates) => {
    const updated = { ...updates, updatedAt: Date.now() };
    await db.folders.update(id, updated);
    set((state) => ({
      folders: state.folders.map((f) => (f.id === id ? { ...f, ...updated } : f)),
    }));
  },

  renameFolder: async (folderId, newName) => {
    const clean = (newName || '').trim();
    if (!clean) return;
    await get().updateFolder(folderId, { name: clean });
  },

  deleteFolder: async (id) => {
    const allFolders = get().folders;
    const toDeleteFolderIds = new Set<string>([id]);

    let changed = true;
    while (changed) {
      changed = false;
      for (const f of allFolders) {
        if (f.parentId && toDeleteFolderIds.has(f.parentId) && !toDeleteFolderIds.has(f.id)) {
          toDeleteFolderIds.add(f.id);
          changed = true;
        }
      }
    }

    const allPrompts = get().prompts;
    const toDeletePromptIds = allPrompts
      .filter((p) => p.folderId && toDeleteFolderIds.has(p.folderId))
      .map((p) => p.id);
    const toDeletePromptIdSet = new Set(toDeletePromptIds);

    // 彻底物理级联删除当前文件夹及其所有子文件夹、以及内部的所有提示词
    await Promise.all([
      db.folders.bulkDelete(Array.from(toDeleteFolderIds)),
      toDeletePromptIds.length > 0 ? db.prompts.bulkDelete(toDeletePromptIds) : Promise.resolve(),
    ]);

    const remainingFolders = allFolders.filter((f) => !toDeleteFolderIds.has(f.id));
    const remainingPrompts = allPrompts.filter((p) => !toDeletePromptIdSet.has(p.id));

    // 检查并重置当前活跃文件夹指针（防止指向已删除目录）
    const isCurrentActiveFolderDeleted = Boolean(get().activeFolderId && toDeleteFolderIds.has(get().activeFolderId!));
    const nextActiveFolderId = isCurrentActiveFolderDeleted ? null : get().activeFolderId;

    // 检查并重置当前活跃提示词指针（防止指向已删除文件）
    const isCurrentActivePromptDeleted = Boolean(get().activePromptId && toDeletePromptIdSet.has(get().activePromptId!));
    const nextActivePromptId = isCurrentActivePromptDeleted
      ? (remainingPrompts[0]?.id ?? null)
      : get().activePromptId;

    set({
      folders: remainingFolders,
      prompts: remainingPrompts,
      activeFolderId: nextActiveFolderId,
      activePromptId: nextActivePromptId,
      isScratchpadActive: remainingPrompts.length === 0 ? true : (isCurrentActivePromptDeleted ? false : get().isScratchpadActive),
    });
  },

  createPrompt: async (folderId, title = '未命名提示词') => {
    const newPrompt: PromptItem = {
      id: `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      folderId,
      title,
      originalDraft: '',
      currentOptimized: '',
      framework: 'CO-STAR',
      variables: [],
      versions: [],
      turns: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.prompts.add(newPrompt);
    set((state) => ({
      prompts: [newPrompt, ...state.prompts],
      activePromptId: newPrompt.id,
      isScratchpadActive: false,
      activeTab: 'optimize',
    }));
    return newPrompt.id;
  },

  createChildPrompt: async (parentPromptId, title) => {
    const parent = get().prompts.find((p) => p.id === parentPromptId);
    if (!parent) throw new Error('父提示词不存在');
    
    // 计算当前处于链路的第几级
    let level = 2;
    let curr = parent;
    const visited = new Set<string>();
    while (curr.parentPromptId && !visited.has(curr.parentPromptId)) {
      visited.add(curr.parentPromptId);
      const ancestor = get().prompts.find((p) => p.id === curr.parentPromptId);
      if (!ancestor) break;
      level++;
      curr = ancestor;
    }

    const baseTitle = parent.title.replace(/ · (步骤\d+|续.*)$/, '');
    const childTitle = title || `${baseTitle} · 步骤${level}`;
    const inheritedDraft = '{{@' + parent.title + '}}\n\n';
    const newPrompt = {
      id: `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-c`,
      folderId: parent.folderId,
      parentPromptId,
      title: childTitle,
      originalDraft: inheritedDraft,
      currentOptimized: '',
      framework: parent.framework,
      variables: [],
      versions: [],
      turns: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.prompts.add(newPrompt);
    set((state) => ({
      prompts: [newPrompt, ...state.prompts],
      activePromptId: newPrompt.id,
      isScratchpadActive: false,
      activeTab: 'optimize',
    }));
    return newPrompt.id;
  },

  updatePrompt: async (id, updates) => {
    const updated = { ...updates, updatedAt: Date.now() };
    set((state) => ({
      prompts: state.prompts.map((p) => (p.id === id ? { ...p, ...updated } : p)),
    }));
    try {
      await db.prompts.update(id, updated);
    } catch (err) {
      console.error('[PromptTune] 数据库更新失败:', err);
    }
  },

  renamePrompt: async (promptId, newTitle) => {
    const clean = (newTitle || '').trim();
    if (!clean) return;
    await get().updatePrompt(promptId, { title: clean });
  },

  duplicatePrompt: async (promptId) => {
    const source = get().prompts.find((p) => p.id === promptId);
    if (!source) throw new Error('提示词不存在');

    const newPrompt: PromptItem = {
      ...source,
      id: `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: `${source.title} (副本)`,
      variables: source.variables ? JSON.parse(JSON.stringify(source.variables)) : [],
      versions: source.versions ? JSON.parse(JSON.stringify(source.versions)) : [],
      turns: source.turns ? JSON.parse(JSON.stringify(source.turns)) : [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.prompts.add(newPrompt);
    set((state) => ({
      prompts: [newPrompt, ...state.prompts],
      activePromptId: newPrompt.id,
      isScratchpadActive: false,
      activeTab: 'optimize',
    }));
    return newPrompt.id;
  },

  movePromptToFolder: async (promptId, targetFolderId) => {
    await get().updatePrompt(promptId, { folderId: targetFolderId });
  },

  deletePrompt: async (id) => {
    // 级联删除：递归收集目标提示词及其所有下游子链路与后续分支节点
    const allPrompts = get().prompts;
    const toDeleteIds = new Set<string>([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of allPrompts) {
        if (p.parentPromptId && toDeleteIds.has(p.parentPromptId) && !toDeleteIds.has(p.id)) {
          toDeleteIds.add(p.id);
          changed = true;
        }
      }
    }

    const toDeleteArray = Array.from(toDeleteIds);
    await db.prompts.bulkDelete(toDeleteArray);

    set((state) => {
      const remaining = state.prompts.filter((p) => !toDeleteIds.has(p.id));
      const isCurrentActiveDeleted = state.activePromptId ? toDeleteIds.has(state.activePromptId) : false;
      const nextActiveId = isCurrentActiveDeleted ? (remaining[0]?.id ?? null) : state.activePromptId;
      return {
        prompts: remaining,
        activePromptId: nextActiveId,
        isScratchpadActive: remaining.length === 0 ? true : (isCurrentActiveDeleted ? false : state.isScratchpadActive),
      };
    });
  },

  addPromptVersion: async (promptId, version) => {
    const prompt = get().prompts.find((p) => p.id === promptId);
    if (!prompt) return;

    const nextVersions = [...prompt.versions, version];
    await get().updatePrompt(promptId, {
      versions: nextVersions,
      currentOptimized: version.promptText,
    });
  },

  addOptimizationTurn: async (promptId, turn) => {
    const prompt = get().prompts.find((p) => p.id === promptId);
    if (!prompt) return;

    const nextTurns = [...prompt.turns, turn];
    await get().updatePrompt(promptId, { turns: nextTurns });
  },

  updateVariables: async (promptId, variables) => {
    await get().updatePrompt(promptId, { variables });
  },

  updateAPIConfig: async (config) => {
    await db.settings.put({ key: 'api_config', value: config });
    set({ apiConfig: config });
  },

  getFolderAncestors: (folderId) => {
    if (!folderId) return [];
    const { folders } = get();
    const map = new Map(folders.map((f) => [f.id, f]));
    const chain: FolderContextAncestor[] = [];

    const visited = new Set<string>();
    const MAX_DEPTH = 30;
    let depth = 0;
    let currentId: string | null = folderId;

    while (currentId && depth < MAX_DEPTH) {
      if (visited.has(currentId)) {
        console.warn(`[PromptTune] 检测到文件夹继承死循环: ${currentId}`);
        break;
      }
      visited.add(currentId);
      depth++;

      const current = map.get(currentId);
      if (!current) break;

      if (current.systemContext?.trim() || current.domainRules?.trim()) {
        chain.unshift({
          folderId: current.id,
          folderName: current.name,
          systemContext: current.systemContext || '',
          domainRules: current.domainRules || '',
        });
      }

      if (!current.inheritParent) {
        break;
      }
      currentId = current.parentId;
    }

    return chain;
  },

  getInheritedContextForPrompt: (promptId) => {
    const prompt = get().prompts.find((p) => p.id === promptId);
    if (!prompt || !prompt.folderId) {
      return { combinedSystemContext: '', combinedDomainRules: '', ancestors: [] };
    }

    const ancestors = get().getFolderAncestors(prompt.folderId);
    const combinedSystemContext = ancestors
      .map((a) => `【${a.folderName} 上下文设定】\n${a.systemContext}`)
      .filter((s) => s.trim())
      .join('\n\n');

    const combinedDomainRules = ancestors
      .map((a) => `【${a.folderName} 行业规则与约束】\n${a.domainRules}`)
      .filter((s) => s.trim())
      .join('\n\n');

    return { combinedSystemContext, combinedDomainRules, ancestors };
  },

  // 1. 全量数据备份导出 (JSON 格式，涵盖技能库，默认脱敏 API Key 防止明文泄漏)
  exportFullDatabaseBackup: async () => {
    const [folders, prompts, settingsRow, skills] = await Promise.all([
      db.folders.toArray(),
      db.prompts.toArray(),
      db.settings.get('api_config'),
      db.skills.toArray(),
    ]);
    const rawConfig = settingsRow?.value || DEFAULT_API_CONFIG;
    // 敏感凭证安全脱敏置空，防止通过备份文件外泄
    const sanitizedConfig = {
      ...rawConfig,
      apiKey: '',
    };
    const payload = {
      app: 'PromptTune',
      version: 2,
      exportedAt: new Date().toISOString(),
      timestamp: Date.now(),
      apiConfig: sanitizedConfig,
      folders,
      prompts,
      skills,
    };
    return JSON.stringify(payload, null, 2);
  },

  // 2. 全量数据恢复导入 (无损写回 Dexie 并刷新状态)
  importFullDatabaseBackup: async (jsonString: string) => {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed || (!Array.isArray(parsed.folders) && !Array.isArray(parsed.prompts))) {
        return { success: false, count: { folders: 0, prompts: 0 }, error: '数据格式无效，未找到 folders 或 prompts 数据' };
      }

      const importedFolders: Folder[] = Array.isArray(parsed.folders) ? parsed.folders : [];
      const importedPrompts: PromptItem[] = Array.isArray(parsed.prompts) ? parsed.prompts : [];
      const importedSkills: SkillItem[] = Array.isArray(parsed.skills) ? parsed.skills : [];

      if (importedFolders.length > 0) {
        await db.folders.bulkPut(importedFolders);
      }
      if (importedPrompts.length > 0) {
        await db.prompts.bulkPut(importedPrompts);
      }
      if (importedSkills.length > 0) {
        await db.skills.bulkPut(importedSkills);
      }
      if (parsed.apiConfig) {
        await db.settings.put({ key: 'api_config', value: parsed.apiConfig });
      }

      // 重新读取本地 IndexedDB
      const [folders, prompts, settingsRow, skills] = await Promise.all([
        db.folders.orderBy('order').toArray(),
        db.prompts.toArray(),
        db.settings.get('api_config'),
        db.skills.toArray(),
      ]);

      set({
        folders,
        prompts,
        skills,
        apiConfig: settingsRow?.value || get().apiConfig,
        activePromptId: prompts[0]?.id || null,
        isScratchpadActive: prompts.length === 0,
      });

      return {
        success: true,
        count: { folders: importedFolders.length, prompts: importedPrompts.length },
      };
    } catch (err: any) {
      return {
        success: false,
        count: { folders: 0, prompts: 0 },
        error: err.message || '导入文件解析失败',
      };
    }
  },

  // 3. 项目合辑一键导出 (Project Master Bundle Export)
  exportFolderMasterBundle: async (folderId: string, format: 'markdown' | 'json') => {
    const { folders, prompts } = get();
    const folder = folders.find((f) => f.id === folderId);
    if (!folder) {
      throw new Error(`找不到文件夹 ${folderId}`);
    }

    // 递归收集该文件夹及所有子文件夹 ID
    const targetFolderIds = new Set<string>([folderId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const f of folders) {
        if (f.parentId && targetFolderIds.has(f.parentId) && !targetFolderIds.has(f.id)) {
          targetFolderIds.add(f.id);
          changed = true;
        }
      }
    }

    const involvedFolders = folders.filter((f) => targetFolderIds.has(f.id));
    const involvedPrompts = prompts.filter((p) => p.folderId && targetFolderIds.has(p.folderId));

    if (format === 'json') {
      const bundle = {
        exportType: 'PromptTune_Project_Master_Bundle',
        exportedAt: new Date().toISOString(),
        rootFolder: folder,
        subFolders: involvedFolders.filter((f) => f.id !== folderId),
        prompts: involvedPrompts,
      };
      return {
        filename: `${folder.name}-master-bundle.json`,
        content: JSON.stringify(bundle, null, 2),
      };
    }

    // 构建 Markdown 《项目级 Master Prompt 工程手册》
    const lines: string[] = [];
    lines.push(`# 《${folder.name}》项目级 Master Prompt 工程手册`);
    lines.push(`> **项目根目录**：\`${folder.name}\``);
    lines.push(`> **导出时间**：${new Date().toLocaleString()}`);
    lines.push(`> **包含提示词**：${involvedPrompts.length} 个 | **包含子模块**：${involvedFolders.length} 个`);
    lines.push(`> **交付建议**：可直接整本提供给 Cursor、Claude Code 等 AI 编程助手，或作为团队工程资产归档。\n`);

    lines.push(`---`);
    lines.push(`## 一、 项目全局系统背景 (System Context)`);
    lines.push(folder.systemContext?.trim() || '_（当前项目未设定独立全局背景，继承系统通用背景）_');
    lines.push(``);

    lines.push(`## 二、 行业规范与约束红线 (Domain Rules & Constraints)`);
    lines.push(folder.domainRules?.trim() || '_（当前项目未设定特定行业红线）_');
    lines.push(``);

    lines.push(`---`);
    lines.push(`## 三、 提示词编排矩阵与依赖链路 (Prompt Pipeline & Dependencies)`);
    if (involvedPrompts.length === 0) {
      lines.push(`_当前文件夹下暂无提示词_`);
    } else {
      lines.push(`| 序号 | 提示词标题 | 提示词框架 | 动态变量数 | 依赖的跨提示词引用 ({{@...}}) |`);
      lines.push(`| :--- | :--- | :--- | :--- | :--- |`);
      involvedPrompts.forEach((p, idx) => {
        const text = (p.currentOptimized || p.originalDraft || '');
        const refs = extractPromptReferences(text);
        const refStr = refs.length > 0 ? refs.map((r) => `\`{{@${r}}}\``).join(', ') : '无依赖 (独立)';
        const varCount = p.variables?.length || 0;
        lines.push(`| ${idx + 1} | **${p.title}** | \`${p.framework}\` | ${varCount} | ${refStr} |`);
      });
    }
    lines.push(``);

    lines.push(`---`);
    lines.push(`## 四、 核心提示词工程规范与正文清单 (Prompt Specifications)`);
    involvedPrompts.forEach((p, idx) => {
      const content = p.currentOptimized?.trim() || p.originalDraft?.trim() || '（空草稿）';
      lines.push(`### 4.${idx + 1} 【${p.title}】`);
      lines.push(`- **框架体系**：\`${p.framework}\``);
      lines.push(`- **版本历史**：v${p.versions?.length || 1}`);
      lines.push(`- **入参变量表**：${p.variables && p.variables.length > 0 ? p.variables.map(v => `\`{{${v.name}}}\`` + (v.description ? ` (${v.description})` : '')).join(', ') : '无动态变量'}`);
      lines.push(``);
      lines.push(`**最新优化提示词正文**：`);
      lines.push('```markdown');
      lines.push(content);
      lines.push('```');
      lines.push(``);
    });

    return {
      filename: `${folder.name}-master-prompt-bundle.md`,
      content: lines.join('\n'),
    };
  },
}));
