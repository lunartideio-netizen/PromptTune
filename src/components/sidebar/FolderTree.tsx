import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Folder as FolderType, PromptItem } from '../../types';
import { 
  ChevronRight, 
  ChevronDown, 
  Folder, 
  FolderOpen, 
  FileText, 
  Plus, 
  SlidersHorizontal, 
  Trash2, 
  Sparkles, 
  Search, 
  FolderPlus, 
  Pencil, 
  Box, 
  Download,
  Copy,
  FolderInput,
  X,
  GitFork,
} from 'lucide-react';

import { confirmAction } from '../../utils/dialog';

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  type: 'folder' | 'prompt';
  targetId: string;
}

export const FolderTree: React.FC = () => {
  const {
    folders,
    prompts,
    activePromptId,
    activeFolderId,
    expandedFolderIds,
    searchQuery,
    isScratchpadActive,
    setIsScratchpadActive,
    setActivePromptId,
    setActiveFolderId,
    toggleFolderExpand,
    setContextModalFolderId,
    createFolder,
    createPrompt,
    renameFolder,
    renamePrompt,
    duplicatePrompt,
    movePromptToFolder,
    deleteFolder,
    deletePrompt,
    setSearchQuery,
    exportFolderMasterBundle,
    createChildPrompt,
  } = useAppStore();

  const [creatingInFolder, setCreatingInFolder] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingRootFolder, setIsCreatingRootFolder] = useState(false);
  const [exportMenuFolderId, setExportMenuFolderId] = useState<string | null>(null);
  const [exportMenuPlacement, setExportMenuPlacement] = useState<'top' | 'bottom'>('bottom');

  // 内联重命名状态
  const [editingItem, setEditingItem] = useState<{
    id: string;
    type: 'folder' | 'prompt';
    text: string;
  } | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // 右键上下文菜单状态
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // 跨目录移动弹窗状态
  const [movingPromptId, setMovingPromptId] = useState<string | null>(null);

  // 提示词子链路折叠状态 (支持收起长链路)
  const [collapsedPromptChainIds, setCollapsedPromptChainIds] = useState<Set<string>>(new Set());

  const togglePromptChainCollapse = (promptId: string) => {
    setCollapsedPromptChainIds((prev) => {
      const next = new Set(prev);
      if (next.has(promptId)) next.delete(promptId);
      else next.add(promptId);
      return next;
    });
  };

  // 计算某个提示词下游挂载的所有子孙节点数量
  const getDescendantCount = (promptId: string) => {
    const toDelete = new Set<string>([promptId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of prompts) {
        if (p.parentPromptId && toDelete.has(p.parentPromptId) && !toDelete.has(p.id)) {
          toDelete.add(p.id);
          changed = true;
        }
      }
    }
    return toDelete.size - 1;
  };

  // 自动聚焦并全选重命名输入框
  useEffect(() => {
    if (editingItem && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [editingItem?.id]);

  // 全局关闭右键菜单与项目包导出菜单监听 (点击外部 / 按 Esc / 滚动 / 调整尺寸)
  useEffect(() => {
    const handleClose = () => {
      if (contextMenu) setContextMenu(null);
      if (exportMenuFolderId) setExportMenuFolderId(null);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (contextMenu) setContextMenu(null);
        if (exportMenuFolderId) setExportMenuFolderId(null);
      }
    };

    if (contextMenu || exportMenuFolderId) {
      window.addEventListener('click', handleClose);
      window.addEventListener('contextmenu', handleClose);
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('scroll', handleClose, true);
      window.addEventListener('resize', handleClose);
    }
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('contextmenu', handleClose);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleClose, true);
      window.removeEventListener('resize', handleClose);
    };
  }, [contextMenu, exportMenuFolderId]);

  // 过滤搜索内容
  const matchesSearch = (text?: string | null) => {
    if (!searchQuery.trim()) return true;
    return Boolean(text && text.toLowerCase().includes(searchQuery.toLowerCase()));
  };

  const filteredPrompts = prompts.filter(
    (p) => matchesSearch(p.title) || matchesSearch(p.originalDraft) || matchesSearch(p.currentOptimized)
  );

  const handleCreateRootFolder = async () => {
    if (!newFolderName.trim()) return;
    await createFolder(null, newFolderName.trim());
    setNewFolderName('');
    setIsCreatingRootFolder(false);
  };

  const handleCreateSubFolder = async (parentId: string) => {
    if (!newFolderName.trim()) return;
    await createFolder(parentId, newFolderName.trim());
    setNewFolderName('');
    setCreatingInFolder(null);
  };

  const handleRenameSubmit = async () => {
    if (!editingItem) return;
    const clean = editingItem.text.trim();
    if (editingItem.type === 'folder') {
      if (clean) await renameFolder(editingItem.id, clean);
    } else {
      if (clean) await renamePrompt(editingItem.id, clean);
    }
    setEditingItem(null);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditingItem(null);
    }
  };

  const handleContextMenu = (
    e: React.MouseEvent,
    type: 'folder' | 'prompt',
    targetId: string
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const menuWidth = 210;
    const menuHeight = 260;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 10);
    // 视窗底部时向上弹出（window.innerHeight - e.clientY < 260 时 top = e.clientY - menuHeight）
    const isNearBottom = window.innerHeight - e.clientY < menuHeight + 10;
    const y = isNearBottom
      ? Math.max(10, e.clientY - menuHeight)
      : Math.min(e.clientY, window.innerHeight - menuHeight - 10);

    setContextMenu({
      isOpen: true,
      x: Math.max(10, x),
      y: Math.max(10, y),
      type,
      targetId,
    });
  };

  const handleExportSinglePromptMd = (prompt: PromptItem) => {
    const varsText = prompt.variables && prompt.variables.length > 0
      ? `## 变量配置清单\n` + prompt.variables.map((v) => `- \`{{${v.name}}}\`: ${v.description || '无描述'} (默认值: "${v.defaultValue || ''}")`).join('\n') + '\n\n'
      : '';
    const content = `# ${prompt.title}
> 框架: ${prompt.framework || 'CO-STAR'} | 更新时间: ${new Date(prompt.updatedAt).toLocaleString()}

${varsText}## 优化后提示词 (Current Optimized)
\`\`\`markdown
${prompt.currentOptimized || prompt.originalDraft || '（暂无提示词内容）'}
\`\`\`

${prompt.originalDraft && prompt.originalDraft !== prompt.currentOptimized ? `## 原始输入需求 (Original Draft)\n\`\`\`markdown\n${prompt.originalDraft}\n\`\`\`\n` : ''}`;

    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${prompt.title.replace(/[\\/:*?"<>|]/g, '_') || 'prompt'}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportBundle = async (folderId: string, format: 'markdown' | 'json') => {
    try {
      const { filename, content } = await exportFolderMasterBundle(folderId, format);
      const mime = format === 'markdown' ? 'text/markdown;charset=utf-8' : 'application/json;charset=utf-8';
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportMenuFolderId(null);
    } catch (err: any) {
      alert('导出项目包失败: ' + err.message);
    }
  };

  // 渲染移动目标文件夹选项树
  const renderMoveFolderOptions = (parentId: string | null, depth = 0): React.ReactNode => {
    const currentPrompt = prompts.find((p) => p.id === movingPromptId);
    const childFolders = folders.filter((f) => f.parentId === parentId);
    return childFolders.map((folder) => {
      const isCurrent = currentPrompt?.folderId === folder.id;
      return (
        <React.Fragment key={folder.id}>
          <button
            style={{ paddingLeft: `${depth * 14 + 12}px` }}
            onClick={async () => {
              if (movingPromptId) {
                await movePromptToFolder(movingPromptId, folder.id);
                setMovingPromptId(null);
              }
            }}
            className={`w-full flex items-center justify-between py-2 pr-3 rounded-xl text-left transition-colors cursor-pointer ${
              isCurrent
                ? 'bg-mac-accentBlue/10 text-mac-accentBlue font-bold'
                : 'hover:bg-black/5 text-[#2C2A29]'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Folder size={14} className="text-mac-accentAmber shrink-0" />
              <span className="truncate">{folder.name}</span>
            </div>
            {isCurrent && (
              <span className="text-[10px] text-mac-accentBlue font-mono shrink-0">当前</span>
            )}
          </button>
          {renderMoveFolderOptions(folder.id, depth + 1)}
        </React.Fragment>
      );
    });
  };

  // 递归渲染文件夹节点
  const renderFolder = (folder: FolderType, depth = 0) => {
    const isExpanded = expandedFolderIds.has(folder.id);
    const childFolders = folders.filter((f) => f.parentId === folder.id);
    const folderPrompts = filteredPrompts.filter((p) => p.folderId === folder.id);
    const hasContext = Boolean(folder.systemContext?.trim() || folder.domainRules?.trim());
    const isEditing = editingItem?.id === folder.id && editingItem?.type === 'folder';

    return (
      <div key={folder.id} className="select-none text-xs">
        {/* Folder Row */}
        <div
          style={{ paddingLeft: `${depth * 12 + 10}px` }}
          className={`group flex items-center justify-between py-1.5 pr-2 rounded-xl transition-colors cursor-pointer ${
            activeFolderId === folder.id && !activePromptId
              ? 'bg-mac-accentBlue/10 text-mac-accentBlue font-medium'
              : 'text-mac-textPrimary hover:bg-black/[0.04]'
          }`}
          onClick={() => {
            if (isEditing) return;
            toggleFolderExpand(folder.id);
            setActiveFolderId(folder.id);
          }}
          onContextMenu={(e) => handleContextMenu(e, 'folder', folder.id)}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span
              onClick={(e) => {
                e.stopPropagation();
                toggleFolderExpand(folder.id);
              }}
              className="text-mac-textSecondary hover:text-mac-textPrimary p-0.5 flex-shrink-0"
            >
              {isExpanded ? (
                <ChevronDown size={11} className="stroke-[2.5]" />
              ) : (
                <ChevronRight size={11} className="stroke-[2.5]" />
              )}
            </span>

            {isExpanded ? (
              <FolderOpen size={14} className="text-mac-accentAmber flex-shrink-0" />
            ) : (
              <Folder size={14} className="text-mac-accentAmber flex-shrink-0" />
            )}

            {isEditing ? (
              <input
                ref={renameInputRef}
                type="text"
                value={editingItem.text}
                onChange={(e) => setEditingItem({ ...editingItem, text: e.target.value })}
                onKeyDown={handleRenameKeyDown}
                onBlur={handleRenameSubmit}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                className="text-xs bg-white dark:bg-zinc-800 text-mac-textPrimary px-1.5 py-0.5 rounded border border-mac-accentBlue focus:outline-none focus:ring-1 focus:ring-mac-accentBlue flex-1 shadow-2xs font-medium"
              />
            ) : (
              <span 
                className="truncate text-xs font-medium select-none"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditingItem({ id: folder.id, type: 'folder', text: folder.name });
                }}
                title="双击可就地重命名"
              >
                {folder.name}
              </span>
            )}

            {hasContext && (
              <span
                title="已配置上下文与行业规则"
                className="flex items-center text-[10px] px-1 py-0.2 rounded bg-mac-accentBlue/10 text-mac-accentBlue font-mono flex-shrink-0"
              >
                <Sparkles size={10} className="mr-0.5" />
                Context
              </span>
            )}
          </div>

          {/* Folder Action Buttons */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* 重命名 */}
            <button
              title="重命名文件夹 (支持双击名称)"
              onClick={(e) => {
                e.stopPropagation();
                setEditingItem({ id: folder.id, type: 'folder', text: folder.name });
              }}
              className="p-1 rounded text-mac-textSecondary hover:text-mac-accentBlue hover:bg-black/5 dark:hover:bg-white/10"
            >
              <Pencil size={12} />
            </button>

            {/* 导出项目提示词包 */}
            <div className="relative">
              <button
                title="导出项目提示词包 (Markdown/JSON)"
                onClick={(e) => {
                  e.stopPropagation();
                  if (exportMenuFolderId === folder.id) {
                    setExportMenuFolderId(null);
                  } else {
                    const isNearBottom = window.innerHeight - e.clientY < 180;
                    setExportMenuPlacement(isNearBottom ? 'top' : 'bottom');
                    setExportMenuFolderId(folder.id);
                  }
                }}
                className="p-1 rounded text-mac-textSecondary hover:text-mac-accentAmber hover:bg-black/5 dark:hover:bg-white/10"
              >
                <Box size={13} />
              </button>

              {exportMenuFolderId === folder.id && (
                <div 
                  onClick={(e) => e.stopPropagation()}
                  className={`absolute right-0 z-30 w-48 bg-white dark:bg-[#1c1c21] rounded-xl shadow-macModal border border-mac-border dark:border-white/10 py-1 text-xs animate-scale-in ${
                    exportMenuPlacement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'
                  }`}
                >
                  <div className="px-3 py-1 text-[10px] font-bold text-mac-textMuted uppercase border-b border-mac-border/50 dark:border-white/10">
                    导出项目提示词包
                  </div>
                  <button
                    onClick={() => {
                      setExportMenuFolderId(null);
                      handleExportBundle(folder.id, 'markdown');
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-mac-accentBlue/10 hover:text-mac-accentBlue flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Download size={12} />
                    <span>Markdown 工程手册 (.md)</span>
                  </button>
                  <button
                    onClick={() => {
                      setExportMenuFolderId(null);
                      handleExportBundle(folder.id, 'json');
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-mac-accentBlue/10 hover:text-mac-accentBlue flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Download size={12} />
                    <span>JSON 结构化工程包 (.json)</span>
                  </button>
                </div>
              )}
            </div>

            <button
              title="配置文件夹背景与行业规则"
              onClick={(e) => {
                e.stopPropagation();
                setContextModalFolderId(folder.id);
              }}
              className="p-1 rounded text-mac-textSecondary hover:text-mac-accentBlue hover:bg-black/5"
            >
              <SlidersHorizontal size={13} />
            </button>

            <button
              title="在此文件夹新建提示词"
              onClick={async (e) => {
                e.stopPropagation();
                await createPrompt(folder.id, '新建提示词');
              }}
              className="p-1 rounded text-mac-textSecondary hover:text-mac-accentGreen hover:bg-black/5"
            >
              <Plus size={13} />
            </button>

            <button
              title="删除文件夹"
              onClick={async (e) => {
                e.stopPropagation();
                if (await confirmAction(`确定删除文件夹「${folder.name}」及其内容吗？`)) {
                  deleteFolder(folder.id);
                }
              }}
              className="p-1 rounded text-mac-textSecondary hover:text-red-500 hover:bg-black/5"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Sub-folder input */}
        {creatingInFolder === folder.id && (
          <div style={{ paddingLeft: `${(depth + 1) * 12 + 10}px` }} className="py-1 pr-2">
            <div className="flex items-center gap-1.5 bg-white dark:bg-zinc-800 rounded-lg border border-mac-accentBlue/40 dark:border-blue-500/30 px-2 py-1 shadow-sm">
              <Folder size={13} className="text-mac-accentAmber flex-shrink-0" />
              <input
                type="text"
                autoFocus
                placeholder="子文件夹名称..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateSubFolder(folder.id);
                  if (e.key === 'Escape') setCreatingInFolder(null);
                }}
                className="text-xs bg-transparent flex-1 focus:outline-none"
              />
              <button
                onClick={() => handleCreateSubFolder(folder.id)}
                className="text-[10px] text-mac-accentBlue font-medium px-1 cursor-pointer"
              >
                确定
              </button>
            </div>
          </div>
        )}

        {/* Expanded children */}
        {isExpanded && (
          <div className="space-y-0.5">
            {/* Child folders */}
            {childFolders.map((sub) => renderFolder(sub, depth + 1))}

            {/* Prompts in this folder */}
            {renderPromptTree(folderPrompts, depth + 1)}
          </div>
        )}
      </div>
    );
  };

  // 递归渲染提示词树（支持 N 级链路与分支）
  const renderPromptTree = (promptsList: PromptItem[], folderDepth = 0) => {
    const promptIdSet = new Set(promptsList.map((p) => p.id));
    const childrenMap = new Map<string, PromptItem[]>();
    const topLevelPrompts: PromptItem[] = [];

    promptsList.forEach((p) => {
      if (p.parentPromptId && promptIdSet.has(p.parentPromptId)) {
        const list = childrenMap.get(p.parentPromptId) || [];
        list.push(p);
        childrenMap.set(p.parentPromptId, list);
      } else {
        topLevelPrompts.push(p);
      }
    });

    // 统计某个节点下游所有的链路步骤数量
    const collectChainSequence = (
      nodeId: string,
      currentLevel = 2
    ): { prompt: PromptItem; level: number }[] => {
      const kids = childrenMap.get(nodeId) || [];
      const seq: { prompt: PromptItem; level: number }[] = [];
      for (const kid of kids) {
        seq.push({ prompt: kid, level: currentLevel });
        seq.push(...collectChainSequence(kid.id, currentLevel + 1));
      }
      return seq;
    };

    return topLevelPrompts.map((rootPrompt) => {
      const chainSteps = collectChainSequence(rootPrompt.id, 2);
      const hasChain = chainSteps.length > 0;
      const isCollapsed = collapsedPromptChainIds.has(rootPrompt.id);
      const rootPaddingLeft = folderDepth * 12 + 10;

      return (
        <div key={rootPrompt.id} className="space-y-0.5">
          {renderPromptItem(
            rootPrompt,
            rootPaddingLeft,
            1,
            hasChain,
            isCollapsed,
            hasChain ? () => togglePromptChainCollapse(rootPrompt.id) : undefined,
            chainSteps.length
          )}
          {hasChain && !isCollapsed && (
            <div
              style={{ marginLeft: `${rootPaddingLeft + 14}px` }}
              className="border-l-2 border-purple-300/80 dark:border-purple-500/50 pl-2 my-0.5 space-y-0.5"
            >
              {chainSteps.map((step) => (
                <React.Fragment key={step.prompt.id}>
                  {renderPromptItem(step.prompt, 4, step.level, false, false, undefined)}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      );
    });
  };

  // 渲染单个提示词节点 (整齐管线排版)
  const renderPromptItem = (
    prompt: PromptItem,
    paddingLeftPx: number,
    chainLevel = 1,
    hasChildren = false,
    isChainCollapsed = false,
    onToggleCollapse?: () => void,
    totalChainSteps?: number
  ) => {
    const isActive = activePromptId === prompt.id && !isScratchpadActive;
    const isEditing = editingItem?.id === prompt.id && editingItem?.type === 'prompt';
    const isChild = chainLevel > 1;

    return (
      <div
        key={prompt.id}
        style={{ paddingLeft: `${paddingLeftPx}px` }}
        className={`group flex items-center justify-between h-[30px] pr-2 rounded-xl transition-all cursor-pointer ${
          isActive
            ? 'bg-mac-accentBlue text-white shadow-sm font-medium'
            : 'text-mac-textPrimary hover:bg-black/[0.04]'
        }`}
        onClick={() => {
          if (isEditing) return;
          setIsScratchpadActive(false);
          setActivePromptId(prompt.id);
          setActiveFolderId(prompt.folderId);
        }}
        onContextMenu={(e) => handleContextMenu(e, 'prompt', prompt.id)}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* 根节点链路总折叠/展开按钮 */}
          {hasChildren && onToggleCollapse && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollapse();
              }}
              className={`p-0.5 rounded hover:bg-black/10 transition-colors flex-shrink-0 cursor-pointer ${
                isActive ? 'text-white' : 'text-mac-textSecondary'
              }`}
              title={isChainCollapsed ? "展开整条下游链路" : "折叠整条下游链路"}
            >
              {isChainCollapsed ? (
                <ChevronRight size={10} className="stroke-[2.5]" />
              ) : (
                <ChevronDown size={10} className="stroke-[2.5]" />
              )}
            </button>
          )}

          {/* 区分根提示词与链路子分支图标 */}
          {isChild ? (
            <GitFork
              size={12}
              className={`flex-shrink-0 ${
                isActive ? 'text-white' : 'text-purple-500'
              }`}
            />
          ) : (
            <FileText
              size={13}
              className={`flex-shrink-0 ${
                isActive ? 'text-white' : 'text-mac-textSecondary'
              }`}
            />
          )}


          {isEditing ? (
            <input
              ref={renameInputRef}
              type="text"
              value={editingItem.text}
              onChange={(e) => setEditingItem({ ...editingItem, text: e.target.value })}
              onKeyDown={handleRenameKeyDown}
              onBlur={handleRenameSubmit}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              className="text-xs bg-white dark:bg-zinc-800 text-mac-textPrimary px-1.5 py-0.5 rounded border border-mac-accentBlue focus:outline-none focus:ring-1 focus:ring-mac-accentBlue flex-1 shadow-2xs font-medium"
            />
          ) : (
            <span 
              className="truncate flex-1 text-xs select-none"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingItem({ id: prompt.id, type: 'prompt', text: prompt.title });
              }}
              title={prompt.title ? `${prompt.title} (双击可重命名)` : '未命名提示词 (双击可重命名)'}
            >
              {prompt.title || '未命名提示词'}
            </span>
          )}
        </div>

        {/* 右侧区域：固定高度容器，未悬浮时展示步数/层级标签，悬浮时平滑切换为操作图标，零高度跳动 */}
        <div className="flex items-center gap-1 flex-shrink-0 ml-1 h-full">
          {/* 根节点提示词标记链路步数 (悬浮时隐藏) */}
          {!isChild && totalChainSteps && totalChainSteps > 0 ? (
            <span
              className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full font-semibold group-hover:hidden transition-all flex-shrink-0 ${
                isActive
                  ? 'bg-white/20 text-white'
                  : 'bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/60'
              }`}
              title={`包含 ${totalChainSteps} 级后续步骤链路`}
            >
              {`+${totalChainSteps}步`}
            </span>
          ) : null}

          {isChild && (
            <span
              className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full font-semibold group-hover:hidden transition-all flex-shrink-0 ${
                isActive
                  ? 'bg-white/20 text-white'
                  : 'bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300'
              }`}
              title={`提示词工程链路第 ${chainLevel} 级`}
            >
              {'L' + chainLevel}
            </span>
          )}

          {/* 悬浮内联按钮：固定 20px 按钮高度，严格在行高内垂直居中 */}
          <div className="hidden group-hover:flex items-center gap-0.5 h-full">
            {/* 快捷继续链路 */}
            <button
              title="基于此提示词派生下一级链路"
              onClick={async (e) => {
                e.stopPropagation();
                await createChildPrompt(prompt.id);
              }}
              className={`p-1 w-5 h-5 flex items-center justify-center rounded transition-colors cursor-pointer ${
                isActive ? 'hover:bg-white/20 text-white' : 'hover:bg-purple-100 dark:hover:bg-purple-900/30 text-mac-textSecondary hover:text-purple-700 dark:hover:text-purple-300'
              }`}
            >
              <GitFork size={12} />
            </button>

            {/* 重命名 */}
            <button
              title="重命名 (支持双击)"
              onClick={(e) => {
                e.stopPropagation();
                setEditingItem({ id: prompt.id, type: 'prompt', text: prompt.title });
              }}
              className={`p-1 w-5 h-5 flex items-center justify-center rounded transition-colors cursor-pointer ${
                isActive ? 'hover:bg-white/20 text-white' : 'hover:bg-black/5 dark:hover:bg-white/10 text-mac-textSecondary hover:text-mac-accentBlue'
              }`}
            >
              <Pencil size={12} />
            </button>

            {/* 复制副本 */}
            <button
              title="复制副本"
              onClick={async (e) => {
                e.stopPropagation();
                await duplicatePrompt(prompt.id);
              }}
              className={`p-1 w-5 h-5 flex items-center justify-center rounded transition-colors cursor-pointer ${
                isActive ? 'hover:bg-white/20 text-white' : 'hover:bg-black/5 dark:hover:bg-white/10 text-mac-textSecondary hover:text-purple-600'
              }`}
            >
              <Copy size={12} />
            </button>

            {/* 删除 */}
            <button
              title="删除"
              onClick={async (e) => {
                e.stopPropagation();
                const descendants = getDescendantCount(prompt.id);
                const message = descendants > 0
                  ? `确定删除「${prompt.title}」及其后续 ${descendants} 个下游链路提示词吗？整条链路将一并删除。`
                  : `确定删除提示词「${prompt.title}」吗？`;
                if (await confirmAction(message)) {
                  deletePrompt(prompt.id);
                }
              }}
              className={`p-1 w-5 h-5 flex items-center justify-center rounded transition-opacity cursor-pointer ${
                isActive ? 'hover:bg-white/20 text-white' : 'hover:bg-black/5 dark:hover:bg-white/10 text-mac-textSecondary hover:text-red-500'
              }`}
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const rootFolders = folders.filter((f) => !f.parentId);
  const rootPrompts = filteredPrompts.filter((p) => !p.folderId);

  return (
    <div className="flex flex-col h-full relative select-none">
      {/* 顶部搜索与单次独立优化 */}
      <div className="px-3 pb-2 pt-1 flex items-center gap-1.5">
        <div className="flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-mac-border/60 dark:border-white/10 focus-within:bg-white dark:focus-within:bg-zinc-800 focus-within:border-mac-accentBlue focus-within:ring-2 focus-within:ring-mac-accentBlue/10 transition-all">
          <Search size={13} className="text-mac-textSecondary flex-shrink-0" />
          <input
            type="text"
            placeholder="搜索提示词、目录..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs bg-transparent focus:outline-none text-mac-textPrimary placeholder:text-mac-textMuted"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="p-0.5 text-mac-textMuted hover:text-mac-textPrimary rounded cursor-pointer"
              title="清空搜索"
            >
              <X size={12} />
            </button>
          )}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
            className="text-[10px] font-mono px-1 py-0.2 rounded bg-black/5 dark:bg-white/10 text-mac-textMuted hover:text-mac-textPrimary transition-colors flex-shrink-0 cursor-pointer"
            title="快捷键 Cmd+K / Ctrl+K 呼出聚焦命令面板"
          >
            ⌘K
          </button>
        </div>

        {/* 快速独立优化 */}
        <button
          title="快速独立优化 (Scratchpad)"
          onClick={() => {
            setIsScratchpadActive(true);
            setActivePromptId(null);
          }}
          className={`p-2 rounded-xl border transition-all flex items-center justify-center flex-shrink-0 cursor-pointer ${
            isScratchpadActive
              ? 'bg-mac-accentBlue text-white border-mac-accentBlue shadow-sm'
              : 'bg-mac-surface dark:bg-white/[0.05] hover:bg-black/[0.04] dark:hover:bg-white/10 text-mac-textSecondary hover:text-mac-textPrimary border-mac-border/70 dark:border-white/10 shadow-sm'
          }`}
        >
          <Pencil size={14} />
        </button>
      </div>

      {/* 资源库小标题 */}
      <div className="px-4 py-1.5 flex items-center justify-between text-[11px] font-semibold text-mac-textSecondary tracking-wide">
        <span>资源库</span>
        <div className="flex items-center gap-0.5">
          <button
            title="新建根文件夹"
            onClick={() => setIsCreatingRootFolder(true)}
            className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-mac-textSecondary hover:text-mac-textPrimary transition-colors cursor-pointer"
          >
            <FolderPlus size={14} />
          </button>
          <button
            title="新建提示词"
            onClick={async () => {
              await createPrompt(null, '新建提示词');
            }}
            className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-mac-textSecondary hover:text-mac-textPrimary transition-colors cursor-pointer"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* 根目录新建文件夹输入行 */}
      {isCreatingRootFolder && (
        <div className="px-3 py-1">
          <div className="flex items-center gap-1.5 bg-white dark:bg-zinc-800 rounded-lg border border-mac-accentBlue/40 dark:border-blue-500/30 px-2 py-1 shadow-sm">
            <Folder size={13} className="text-mac-accentAmber flex-shrink-0" />
            <input
              type="text"
              autoFocus
              placeholder="新文件夹名称..."
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateRootFolder();
                if (e.key === 'Escape') setIsCreatingRootFolder(false);
              }}
              className="text-xs bg-transparent flex-1 focus:outline-none"
            />
            <button
              onClick={handleCreateRootFolder}
              className="text-[10px] text-mac-accentBlue font-medium px-1 cursor-pointer"
            >
              创建
            </button>
          </div>
        </div>
      )}

      {/* 文件与文件夹树状列表 */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5 min-h-0">
        {/* 渲染根目录文件夹 */}
        {rootFolders.map((folder) => renderFolder(folder, 0))}

        {/* 渲染根目录未归类提示词 */}
        {rootPrompts.length > 0 && (
          <div className="pt-1 border-t border-mac-border/40 mt-1">
            <div className="px-2 py-1 text-[10px] font-semibold text-mac-textMuted uppercase">
              未归类提示词 ({rootPrompts.length})
            </div>
            {renderPromptTree(rootPrompts, 0)}
          </div>
        )}

        {filteredPrompts.length === 0 && (
          <div className="text-center py-6 text-xs text-mac-textMuted">
            未找到相关提示词
          </div>
        )}
      </div>

      {/* -------------------- macOS 原生级右键上下文菜单 -------------------- */}
      {contextMenu && (
        <div
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 w-52 bg-white/95 dark:bg-[#1c1c21]/95 backdrop-blur-md rounded-xl shadow-macModal border border-[#E5E2D9] dark:border-white/10 py-1 text-xs text-[#2C2A29] dark:text-zinc-200 animate-scale-in select-none"
        >
          {contextMenu.type === 'folder' ? (
            <>
              <div className="px-3 py-1 text-[10px] font-bold text-[#6E6B65] dark:text-zinc-400 uppercase border-b border-[#E5E2D9]/60 dark:border-white/10 truncate">
                文件夹：{folders.find((f) => f.id === contextMenu.targetId)?.name || '未命名'}
              </div>
              <button
                onClick={() => {
                  const folder = folders.find((f) => f.id === contextMenu.targetId);
                  if (folder) setEditingItem({ id: folder.id, type: 'folder', text: folder.name });
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-mac-accentBlue/10 hover:text-mac-accentBlue flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Pencil size={13} className="text-mac-textSecondary" />
                <span>重命名文件夹</span>
              </button>
              <button
                onClick={async () => {
                  await createPrompt(contextMenu.targetId, '新建提示词');
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-mac-accentBlue/10 hover:text-mac-accentBlue flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Plus size={13} className="text-mac-accentGreen" />
                <span>在此新建提示词</span>
              </button>
              <button
                onClick={() => {
                  setCreatingInFolder(contextMenu.targetId);
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-mac-accentBlue/10 hover:text-mac-accentBlue flex items-center gap-2 transition-colors cursor-pointer"
              >
                <FolderPlus size={13} className="text-mac-accentAmber" />
                <span>新建子文件夹</span>
              </button>
              <button
                onClick={() => {
                  setExportMenuFolderId(contextMenu.targetId);
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-mac-accentBlue/10 hover:text-mac-accentBlue flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Box size={13} className="text-indigo-600 dark:text-indigo-400" />
                <span>导出项目提示词包...</span>
              </button>
              <button
                onClick={() => {
                  setContextModalFolderId(contextMenu.targetId);
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-mac-accentBlue/10 hover:text-mac-accentBlue flex items-center gap-2 transition-colors cursor-pointer"
              >
                <SlidersHorizontal size={13} className="text-mac-accentBlue" />
                <span>配置项目上下文与规则</span>
              </button>
              <div className="my-1 border-t border-[#E5E2D9]/70 dark:border-white/10" />
              <button
                onClick={async () => {
                  const folder = folders.find((f) => f.id === contextMenu.targetId);
                  if (folder && (await confirmAction(`确定删除文件夹「${folder.name}」及其内容吗？`))) {
                    deleteFolder(folder.id);
                  }
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600 dark:text-rose-400 flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Trash2 size={13} />
                <span>删除文件夹</span>
              </button>
            </>
          ) : (
            <>
              <div className="px-3 py-1 text-[10px] font-bold text-[#6E6B65] dark:text-zinc-400 uppercase border-b border-[#E5E2D9]/60 dark:border-white/10 truncate">
                提示词：{prompts.find((p) => p.id === contextMenu.targetId)?.title || '未命名'}
              </div>
              <button
                onClick={() => {
                  const prompt = prompts.find((p) => p.id === contextMenu.targetId);
                  if (prompt) setEditingItem({ id: prompt.id, type: 'prompt', text: prompt.title });
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-mac-accentBlue/10 hover:text-mac-accentBlue flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Pencil size={13} className="text-mac-textSecondary" />
                <span>重命名提示词</span>
              </button>
              <button
                onClick={async () => {
                  await duplicatePrompt(contextMenu.targetId);
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-mac-accentBlue/10 hover:text-mac-accentBlue flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Copy size={13} className="text-purple-600 dark:text-purple-400" />
                <span>复制副本 (Duplicate)</span>
              </button>
              <button
                onClick={async () => {
                  await createChildPrompt(contextMenu.targetId);
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-purple-50 dark:hover:bg-purple-950/30 hover:text-purple-700 dark:hover:text-purple-300 flex items-center gap-2 transition-colors cursor-pointer"
              >
                <GitFork size={13} className="text-purple-500 dark:text-purple-400" />
                <span>继续链路 (创建子提示词)</span>
              </button>
              <button
                onClick={() => {
                  setMovingPromptId(contextMenu.targetId);
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-mac-accentBlue/10 hover:text-mac-accentBlue flex items-center gap-2 transition-colors cursor-pointer"
              >
                <FolderInput size={13} className="text-mac-accentAmber" />
                <span>移动至其他文件夹...</span>
              </button>
              <button
                onClick={() => {
                  const prompt = prompts.find((p) => p.id === contextMenu.targetId);
                  if (prompt) handleExportSinglePromptMd(prompt);
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-mac-accentBlue/10 hover:text-mac-accentBlue flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Download size={13} className="text-emerald-600 dark:text-emerald-400" />
                <span>导出 Markdown 单文件</span>
              </button>
              <div className="my-1 border-t border-[#E5E2D9]/70 dark:border-white/10" />
              <button
                onClick={async () => {
                  const prompt = prompts.find((p) => p.id === contextMenu.targetId);
                  if (prompt) {
                    const descendants = getDescendantCount(prompt.id);
                    const message = descendants > 0
                      ? `确定删除「${prompt.title}」及其后续 ${descendants} 个下游链路提示词吗？整条链路将一并删除。`
                      : `确定彻底删除提示词「${prompt.title}」吗？`;
                    if (await confirmAction(message)) {
                      deletePrompt(prompt.id);
                    }
                  }
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600 dark:text-rose-400 flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Trash2 size={13} />
                <span>彻底删除</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* -------------------- 移动至其他文件夹弹窗 -------------------- */}
      {movingPromptId && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-xs p-4 animate-fade-in"
          onClick={() => setMovingPromptId(null)}
        >
          <div 
            className="bg-[#FAF9F6] border border-[#E5E2D9] rounded-2xl shadow-macModal w-full max-w-sm overflow-hidden text-[#2C2A29]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-[#E5E2D9] flex items-center justify-between bg-[#F4F2EB]/80">
              <div className="flex items-center gap-2 min-w-0">
                <FolderInput size={16} className="text-mac-accentAmber shrink-0" />
                <h3 className="text-xs font-bold text-[#2C2A29] truncate">
                  移动提示词至...
                </h3>
              </div>
              <button
                onClick={() => setMovingPromptId(null)}
                className="p-1 rounded-lg text-[#6E6B65] hover:text-[#2C2A29] hover:bg-black/5 cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            <div className="p-3 max-h-72 overflow-y-auto space-y-1 text-xs">
              <div className="text-[10px] font-bold text-[#6E6B65] px-2 py-0.5 uppercase">
                选择目标位置
              </div>

              {/* 根目录项 */}
              <button
                onClick={async () => {
                  await movePromptToFolder(movingPromptId, null);
                  setMovingPromptId(null);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                  prompts.find((p) => p.id === movingPromptId)?.folderId === null
                    ? 'bg-mac-accentBlue/10 text-mac-accentBlue font-bold'
                    : 'hover:bg-black/5 text-[#2C2A29]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Folder size={14} className="text-mac-textSecondary" />
                  <span>根目录 (未归类提示词)</span>
                </div>
                {prompts.find((p) => p.id === movingPromptId)?.folderId === null && (
                  <span className="text-[10px] text-mac-accentBlue font-mono">当前</span>
                )}
              </button>

              {/* 渲染所有子文件夹树 */}
              {renderMoveFolderOptions(null, 0)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
