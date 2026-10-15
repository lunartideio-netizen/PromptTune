import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { 
  Sparkles, 
  ArrowLeftRight, 
  Code2, 
  History, 
  Share2, 
  Copy, 
  Check, 
  Layers,
  ChevronRight,
  Folder,
  PanelLeftClose,
  PanelLeftOpen,
  FileCode,
  GitFork,
  Network,
  GitBranch
} from 'lucide-react';
import { ExportCodeModal } from './ExportCodeModal';
import { TokenCostPopover } from './TokenCostPopover';
import { exportProjectToPromptFiles } from '../../utils/gitSyncUtils';

export const WorkspaceHeader: React.FC = () => {
  const { 
    activePromptId, 
    setActivePromptId,
    prompts, 
    folders, 
    activeTab, 
    setActiveTab, 
    updatePrompt,
    getFolderAncestors,
    setContextModalFolderId,
    isScratchpadActive,
    scratchpadDraft,
    scratchpadOptimized,
    scratchpadVariables,
    scratchpadVersions,
    scratchpadTurns,
    isSidebarCollapsed,
    toggleSidebarCollapsed,
    showToast,
  } = useAppStore();

  const currentPrompt = prompts.find((p) => p.id === activePromptId);
  const isScratchpadMode = isScratchpadActive || !currentPrompt;

  // 递归回溯提示词全链路祖先 (从根到直接上游)
  const promptChainAncestors = React.useMemo(() => {
    if (!currentPrompt || isScratchpadMode) return [];
    const chain: typeof prompts = [];
    const visited = new Set<string>();
    let pId = currentPrompt.parentPromptId;
    while (pId && !visited.has(pId)) {
      visited.add(pId);
      const parent = prompts.find((p) => p.id === pId);
      if (!parent) break;
      chain.unshift(parent);
      pId = parent.parentPromptId;
    }
    return chain;
  }, [currentPrompt, prompts, isScratchpadMode]);

  const [title, setTitle] = useState('');
  const [copied, setCopied] = useState(false);
  const [isExportCodeOpen, setIsExportCodeOpen] = useState(false);

  // 监听 Command Palette 等全局快捷动作
  useEffect(() => {
    const handleGlobalAction = (e: Event) => {
      const customEvent = e as CustomEvent<{ action: string }>;
      if (customEvent.detail?.action === 'open-export-code') {
        setIsExportCodeOpen(true);
      } else if (customEvent.detail?.action === 'export-git-tree') {
        handleExportGitTree();
      }
    };

    window.addEventListener('prompttune:action', handleGlobalAction);
    return () => window.removeEventListener('prompttune:action', handleGlobalAction);
  }, []);

  useEffect(() => {
    if (currentPrompt) {
      setTitle(currentPrompt.title);
    }
  }, [currentPrompt]);

  const currentFolder = currentPrompt ? folders.find((f) => f.id === currentPrompt.folderId) : null;
  const ancestors = currentPrompt ? getFolderAncestors(currentPrompt.folderId) : [];

  const handleTitleBlur = () => {
    if (currentPrompt && title.trim() && title !== currentPrompt.title) {
      updatePrompt(currentPrompt.id, { title: title.trim() });
    }
  };

  const handleCopy = () => {
    const textToCopy = isScratchpadMode
      ? (scratchpadOptimized || scratchpadDraft)
      : (currentPrompt?.currentOptimized || currentPrompt?.originalDraft || '');
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleExport = () => {
    const exportData = isScratchpadMode
      ? {
          title: '单次独立优化提示词',
          draft: scratchpadDraft,
          optimized: scratchpadOptimized,
          variables: scratchpadVariables,
          versions: scratchpadVersions,
          turns: scratchpadTurns,
          exportedAt: new Date().toISOString(),
        }
      : currentPrompt;
    if (!exportData) return;
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", url);
    downloadAnchor.setAttribute("download", `${isScratchpadMode ? 'scratchpad-prompt' : (currentPrompt?.title || 'prompt')}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportGitTree = () => {
    const files = exportProjectToPromptFiles(prompts, folders);
    if (files.length === 0) {
      showToast('当前项目暂无可导出的提示词', 'error');
      return;
    }
    const bundle = {
      format: 'PromptTune-PromptAsCode-v1',
      exportedAt: new Date().toISOString(),
      totalFiles: files.length,
      files,
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", url);
    downloadAnchor.setAttribute("download", `prompttune_git_sync_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    URL.revokeObjectURL(url);
    showToast(`已成功打包导出 ${files.length} 个规范提示词工程文件`, 'success');
  };

  /**
   * 原生桌面端窗口拖拽：双轨策略保障
   * 仅在点击非交互空白区域（左键）时启动原生窗口拖动，绝不干扰输入框、按钮与 Tab 交互
   */
  const handleDragRegionMouseDown = async (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, input, textarea, a, select, [data-tauri-drag-region="false"], [role="button"], [role="tab"]')) {
      return;
    }
    if (isTauri()) {
      try {
        await getCurrentWindow().startDragging();
      } catch {
        // ignore non-tauri or detached window
      }
    }
  };

  return (
    <div 
      className="relative z-20 border-b border-mac-border/60 bg-mac-surface/60 backdrop-blur-xl px-5 py-3 flex flex-col gap-2.5 select-none"
      data-tauri-drag-region="true"
      style={{ WebkitAppRegion: 'drag' } as any}
      onMouseDown={handleDragRegionMouseDown}
    >
      {/* Top line: Breadcrumbs and actions */}
      <div 
        className="flex items-center justify-between"
        data-tauri-drag-region="true"
        onMouseDown={handleDragRegionMouseDown}
      >
        {/* Left: Sidebar Toggle + Breadcrumbs */}
        <div 
          className="flex items-center gap-1.5 text-xs text-mac-textSecondary overflow-hidden pr-2"
          data-tauri-drag-region="true"
        >
          {/* Sidebar Toggle Button */}
          <button
            type="button"
            onClick={toggleSidebarCollapsed}
            data-tauri-drag-region="false"
            style={{ WebkitAppRegion: 'no-drag' } as any}
            onMouseDown={(e) => e.stopPropagation()}
            className="p-1 rounded-lg text-mac-textSecondary hover:text-mac-textPrimary hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex-shrink-0"
            title={isSidebarCollapsed ? "展开侧边栏" : "折叠侧边栏"}
          >
            {isSidebarCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>

          {isScratchpadMode ? (
            <span className="text-mac-textMuted text-[11px] font-mono pointer-events-none">
              草稿工作空间
            </span>
          ) : (
            <div className="flex items-center gap-1.5 truncate">
              <Folder size={14} strokeWidth={1.75} className="text-mac-accentAmber flex-shrink-0" />
              <span>根目录</span>
              {ancestors.map((anc) => (
                <React.Fragment key={anc.folderId}>
                  <ChevronRight size={11} strokeWidth={2} className="text-mac-textMuted flex-shrink-0" />
                  <button
                    type="button"
                    onClick={() => setContextModalFolderId(anc.folderId)}
                    data-tauri-drag-region="false"
                    style={{ WebkitAppRegion: 'no-drag' } as any}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="hover:text-mac-accentBlue underline decoration-dotted transition-colors truncate max-w-[120px]"
                    title="点击配置该级文件夹上下文"
                  >
                    {anc.folderName}
                  </button>
                </React.Fragment>
              ))}
              <ChevronRight size={11} strokeWidth={2} className="text-mac-textMuted flex-shrink-0" />
              {promptChainAncestors.map((ancestor, idx) => (
                <React.Fragment key={ancestor.id}>
                  <button
                    type="button"
                    onClick={() => setActivePromptId(ancestor.id)}
                    data-tauri-drag-region="false"
                    style={{ WebkitAppRegion: 'no-drag' } as any}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="hover:text-purple-600 dark:hover:text-purple-400 underline decoration-dotted transition-colors truncate max-w-[120px] text-purple-700/80 dark:text-purple-300 font-medium"
                    title={`链路第 ${idx + 1} 步前置提示词，点击切回查看`}
                  >
                    {ancestor.title}
                  </button>
                  <ChevronRight size={11} strokeWidth={2} className="text-mac-textMuted flex-shrink-0" />
                </React.Fragment>
              ))}
              <span className="text-mac-textPrimary font-medium truncate max-w-[180px]">
                {currentPrompt?.title || '未命名提示词'}
              </span>

              {promptChainAncestors.length > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-400/30 flex-shrink-0">
                  <GitFork size={11} strokeWidth={2} className="text-purple-600 dark:text-purple-400" />
                  <span>链路第 {promptChainAncestors.length + 1} 级</span>
                </span>
              )}

              {ancestors.length > 0 ? (
                <button
                  type="button"
                  onClick={() => currentFolder && setContextModalFolderId(currentFolder.id)}
                  data-tauri-drag-region="false"
                  style={{ WebkitAppRegion: 'no-drag' } as any}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="ml-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-mac-accentPurple/15 text-mac-accentPurple border border-mac-accentPurple/30 hover:bg-mac-accentPurple/25 transition-all shadow-2xs group flex-shrink-0"
                  title={`当前提示词受 ${ancestors.length} 层上层项目背景与行业规则制约。点击查看/编辑注入规则`}
                >
                  <Layers size={12} strokeWidth={2} className="text-mac-accentPurple group-hover:scale-110 transition-transform" />
                  <span className="font-semibold">继承 {ancestors.length} 层项目上下文</span>
                  <span className="opacity-70 text-[9px] font-mono hidden md:inline">({ancestors.map((a) => a.folderName).join(' › ')})</span>
                </button>
              ) : currentFolder ? (
                <button
                  type="button"
                  onClick={() => setContextModalFolderId(currentFolder.id)}
                  data-tauri-drag-region="false"
                  style={{ WebkitAppRegion: 'no-drag' } as any}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] text-mac-textMuted hover:text-mac-accentBlue bg-black/[0.03] dark:bg-white/[0.05] hover:bg-mac-accentBlue/10 transition-colors border border-dashed border-mac-border dark:border-white/10 flex-shrink-0"
                  title="点击为当前所属项目注入全局背景与行业约束规则"
                >
                  <span>+ 注入项目级上下文</span>
                </button>
              ) : null}
            </div>
          )}
        </div>

        {/* Action icons */}
        <div 
          className="flex items-center gap-1.5 flex-shrink-0"
          data-tauri-drag-region="false"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          {/* Token & Cost看板 (FEAT-4) */}
          <TokenCostPopover
            systemText={ancestors.map((a) => [a.systemContext, a.domainRules].filter(Boolean).join('\n')).filter(Boolean).join('\n\n')}
            templateText={isScratchpadMode ? (scratchpadOptimized || scratchpadDraft) : (currentPrompt?.currentOptimized || currentPrompt?.originalDraft || '')}
            variableText={(isScratchpadMode ? scratchpadVariables : (currentPrompt?.variables || [])).map((v) => `${v.name}: ${v.currentValue || v.defaultValue || ''}`).join('\n')}
          />

          <button
            type="button"
            onClick={handleCopy}
            data-tauri-drag-region="false"
            style={{ WebkitAppRegion: 'no-drag' } as any}
            onMouseDown={(e) => e.stopPropagation()}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-mac-border dark:border-white/10 bg-mac-surface dark:bg-white/[0.05] hover:bg-black/5 dark:hover:bg-white/10 text-mac-textPrimary transition-all shadow-sm cursor-pointer"
          >
            {copied ? (
              <>
                <Check size={13} strokeWidth={2} className="text-mac-accentGreen" />
                <span className="text-mac-accentGreen font-medium">已复制</span>
              </>
            ) : (
              <>
                <Copy size={13} strokeWidth={1.75} className="text-mac-textSecondary" />
                <span>复制当前</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsExportCodeOpen(true)}
            data-tauri-drag-region="false"
            style={{ WebkitAppRegion: 'no-drag' } as any}
            onMouseDown={(e) => e.stopPropagation()}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-mac-border dark:border-white/10 bg-mac-surface dark:bg-white/[0.05] hover:bg-black/5 dark:hover:bg-white/10 text-mac-textPrimary transition-all shadow-sm cursor-pointer"
            title="导出为 Python / TypeScript / LangChain / cURL 工程调用代码"
          >
            <FileCode size={13} strokeWidth={1.75} className="text-mac-accentBlue" />
            <span>代码导出</span>
          </button>

          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('prompttune:action', { detail: { action: 'open-dag' } }))}
            data-tauri-drag-region="false"
            style={{ WebkitAppRegion: 'no-drag' } as any}
            onMouseDown={(e) => e.stopPropagation()}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-indigo-500/30 bg-indigo-50/50 dark:bg-indigo-950/30 hover:bg-indigo-100/50 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 transition-all shadow-sm cursor-pointer active:scale-98"
            title="查看全局工程模块依赖拓扑图谱 (DAG)"
          >
            <Network size={13} strokeWidth={1.75} className="text-indigo-600 dark:text-indigo-400" />
            <span>架构拓扑</span>
          </button>

          <button
            type="button"
            onClick={handleExportGitTree}
            data-tauri-drag-region="false"
            style={{ WebkitAppRegion: 'no-drag' } as any}
            onMouseDown={(e) => e.stopPropagation()}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-purple-500/30 bg-purple-50/50 dark:bg-purple-950/30 hover:bg-purple-100/50 dark:hover:bg-purple-900/40 text-purple-700 dark:text-purple-300 transition-all shadow-sm cursor-pointer active:scale-98"
            title="打包导出当前工程所有提示词为 Prompt as Code (PaC) 规范文件树"
          >
            <GitBranch size={13} strokeWidth={1.75} className="text-purple-600 dark:text-purple-400" />
            <span>Git 同步包</span>
          </button>

          <button
            type="button"
            onClick={handleExport}
            data-tauri-drag-region="false"
            style={{ WebkitAppRegion: 'no-drag' } as any}
            onMouseDown={(e) => e.stopPropagation()}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-mac-border dark:border-white/10 bg-mac-surface dark:bg-white/[0.05] hover:bg-black/5 dark:hover:bg-white/10 text-mac-textPrimary transition-all shadow-sm cursor-pointer"
            title="导出为 JSON 备份"
          >
            <Share2 size={13} strokeWidth={1.75} className="text-mac-textSecondary" />
            <span>导出</span>
          </button>
        </div>
      </div>

      {/* Middle line: Editable Title and Tab Bar */}
      <div 
        className="flex items-center justify-between flex-wrap gap-2"
        data-tauri-drag-region="true"
        onMouseDown={handleDragRegionMouseDown}
      >
        {isScratchpadMode ? (
          <div className="flex items-center gap-2" data-tauri-drag-region="true">
            <span className="text-base font-bold text-mac-textPrimary px-1.5 py-0.5 pointer-events-none">
              单次独立优化台
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-mac-accentBlue/10 text-mac-accentBlue font-medium pointer-events-none">
              草稿模式
            </span>
          </div>
        ) : (
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            data-tauri-drag-region="false"
            style={{ WebkitAppRegion: 'no-drag' } as any}
            onMouseDown={(e) => e.stopPropagation()}
            className="text-base font-bold text-mac-textPrimary bg-transparent hover:bg-black/[0.03] dark:hover:bg-white/[0.05] focus:bg-white dark:focus:bg-zinc-800 focus:ring-1 focus:ring-mac-accentBlue rounded-lg px-1.5 py-0.5 focus:outline-none transition-all"
            placeholder="提示词标题..."
          />
        )}

        {/* Navigation Tabs */}
        <div 
          className="flex items-center p-1 bg-black/[0.04] dark:bg-black/40 rounded-xl border border-mac-border/60 dark:border-white/10 overflow-x-auto scrollbar-none flex-shrink-0"
          data-tauri-drag-region="false"
          style={{ WebkitAppRegion: 'no-drag' } as any}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setActiveTab('optimize')}
            data-tauri-drag-region="false"
            style={{ WebkitAppRegion: 'no-drag' } as any}
            onMouseDown={(e) => e.stopPropagation()}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex-shrink-0 ${
              activeTab === 'optimize'
                ? 'bg-white dark:bg-white/15 text-mac-accentBlue dark:text-blue-300 shadow-sm font-semibold'
                : 'text-mac-textSecondary hover:text-mac-textPrimary'
            }`}
          >
            <Sparkles size={13} strokeWidth={1.75} className="text-mac-accentBlue" />
            结构优化
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ab_test')}
            data-tauri-drag-region="false"
            style={{ WebkitAppRegion: 'no-drag' } as any}
            onMouseDown={(e) => e.stopPropagation()}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex-shrink-0 ${
              activeTab === 'ab_test'
                ? 'bg-white dark:bg-white/15 text-mac-accentGreen dark:text-emerald-300 shadow-sm font-semibold'
                : 'text-mac-textSecondary hover:text-mac-textPrimary'
            }`}
          >
            <ArrowLeftRight size={13} strokeWidth={1.75} className="text-mac-accentGreen" />
            双轨 A/B 对比
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('variables')}
            data-tauri-drag-region="false"
            style={{ WebkitAppRegion: 'no-drag' } as any}
            onMouseDown={(e) => e.stopPropagation()}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex-shrink-0 ${
              activeTab === 'variables'
                ? 'bg-white dark:bg-white/15 text-mac-accentPurple dark:text-purple-300 shadow-sm font-semibold'
                : 'text-mac-textSecondary hover:text-mac-textPrimary'
            }`}
          >
            <Code2 size={13} strokeWidth={1.75} className="text-mac-accentPurple" />
            模板变量
            {((isScratchpadMode ? scratchpadVariables.length : currentPrompt?.variables?.length) || 0) > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-mac-accentPurple/10 text-mac-accentPurple font-mono">
                {isScratchpadMode ? scratchpadVariables.length : currentPrompt?.variables.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('versions')}
            data-tauri-drag-region="false"
            style={{ WebkitAppRegion: 'no-drag' } as any}
            onMouseDown={(e) => e.stopPropagation()}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex-shrink-0 ${
              activeTab === 'versions'
                ? 'bg-white dark:bg-white/15 text-mac-accentAmber dark:text-amber-300 shadow-sm font-semibold'
                : 'text-mac-textSecondary hover:text-mac-textPrimary'
            }`}
          >
            <History size={13} strokeWidth={1.75} className="text-mac-accentAmber" />
            版本历史 (v{(isScratchpadMode ? scratchpadVersions.length : currentPrompt?.versions?.length) || 1})
          </button>
        </div>
      </div>

      <ExportCodeModal
        isOpen={isExportCodeOpen}
        onClose={() => setIsExportCodeOpen(false)}
        title={isScratchpadMode ? '单次独立优化提示词' : (currentPrompt?.title || 'Prompt')}
        promptText={isScratchpadMode ? (scratchpadOptimized || scratchpadDraft) : (currentPrompt?.currentOptimized || currentPrompt?.originalDraft || '')}
        variables={isScratchpadMode ? scratchpadVariables : (currentPrompt?.variables || [])}
        systemContext={ancestors.map((a) => [a.systemContext, a.domainRules].filter(Boolean).join('\n')).filter(Boolean).join('\n\n')}
      />
    </div>
  );
};

