import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
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
  Folder
} from 'lucide-react';

export const WorkspaceHeader: React.FC = () => {
  const { 
    activePromptId, 
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
  } = useAppStore();

  const currentPrompt = prompts.find((p) => p.id === activePromptId);
  const isScratchpadMode = isScratchpadActive || !currentPrompt;

  const [title, setTitle] = useState('');
  const [copied, setCopied] = useState(false);

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
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${isScratchpadMode ? 'scratchpad-prompt' : (currentPrompt?.title || 'prompt')}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="border-b border-mac-border/60 bg-mac-surface/60 backdrop-blur-xl px-5 py-3 flex flex-col gap-2.5">
      {/* Top line: Breadcrumbs and actions */}
      <div className="flex items-center justify-between">
        {/* Breadcrumbs */}
        {isScratchpadMode ? (
          <div />
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-mac-textSecondary">
            <Folder size={14} strokeWidth={1.75} className="text-mac-accentAmber" />
            <span>根目录</span>
            {ancestors.map((anc) => (
              <React.Fragment key={anc.folderId}>
                <ChevronRight size={11} strokeWidth={2} className="text-mac-textMuted" />
                <button
                  onClick={() => setContextModalFolderId(anc.folderId)}
                  className="hover:text-mac-accentBlue underline decoration-dotted transition-colors"
                  title="点击配置该级文件夹上下文"
                >
                  {anc.folderName}
                </button>
              </React.Fragment>
            ))}
            <ChevronRight size={11} strokeWidth={2} className="text-mac-textMuted" />
            <span className="text-mac-textPrimary font-medium truncate max-w-[200px]">
              {currentPrompt?.title || '未命名提示词'}
            </span>

            {ancestors.length > 0 ? (
              <button
                onClick={() => currentFolder && setContextModalFolderId(currentFolder.id)}
                className="ml-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-mac-accentPurple/15 text-mac-accentPurple border border-mac-accentPurple/30 hover:bg-mac-accentPurple/25 transition-all shadow-2xs group"
                title={`当前提示词受 ${ancestors.length} 层上层项目背景与行业规则制约。点击查看/编辑注入规则`}
              >
                <Layers size={12} strokeWidth={2} className="text-mac-accentPurple group-hover:scale-110 transition-transform" />
                <span className="font-semibold">继承 {ancestors.length} 层项目上下文</span>
                <span className="opacity-70 text-[9px] font-mono hidden md:inline">({ancestors.map((a) => a.folderName).join(' › ')})</span>
              </button>
            ) : currentFolder ? (
              <button
                onClick={() => setContextModalFolderId(currentFolder.id)}
                className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] text-mac-textMuted hover:text-mac-accentBlue bg-black/[0.03] hover:bg-mac-accentBlue/10 transition-colors border border-dashed border-mac-border"
                title="点击为当前所属项目注入全局背景与行业约束规则"
              >
                <span>+ 注入项目级上下文</span>
              </button>
            ) : null}
          </div>
        )}

        {/* Action icons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-mac-border hover:bg-white text-mac-textPrimary transition-all shadow-sm"
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
            onClick={handleExport}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-mac-border hover:bg-white text-mac-textPrimary transition-all shadow-sm"
            title="导出为 JSON 备份"
          >
            <Share2 size={13} strokeWidth={1.75} className="text-mac-textSecondary" />
            <span>导出</span>
          </button>
        </div>
      </div>

      {/* Middle line: Editable Title and Tab Bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        {isScratchpadMode ? (
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-mac-textPrimary px-1.5 py-0.5">
              单次独立优化台
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-mac-accentBlue/10 text-mac-accentBlue font-medium">
              草稿模式
            </span>
          </div>
        ) : (
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            className="text-base font-bold text-mac-textPrimary bg-transparent hover:bg-black/[0.03] focus:bg-white focus:ring-1 focus:ring-mac-accentBlue rounded-lg px-1.5 py-0.5 focus:outline-none transition-all"
          />
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center p-1 bg-black/[0.03] rounded-xl border border-mac-border/60 overflow-x-auto scrollbar-none flex-shrink-0">
          <button
            onClick={() => setActiveTab('optimize')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex-shrink-0 ${
              activeTab === 'optimize'
                ? 'bg-white text-mac-accentBlue shadow-sm'
                : 'text-mac-textSecondary hover:text-mac-textPrimary'
            }`}
          >
            <Sparkles size={13} strokeWidth={1.75} className="text-mac-accentBlue" />
            结构优化
          </button>

          <button
            onClick={() => setActiveTab('ab_test')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex-shrink-0 ${
              activeTab === 'ab_test'
                ? 'bg-white text-mac-accentGreen shadow-sm'
                : 'text-mac-textSecondary hover:text-mac-textPrimary'
            }`}
          >
            <ArrowLeftRight size={13} strokeWidth={1.75} className="text-mac-accentGreen" />
            双轨 A/B 对比
          </button>

          <button
            onClick={() => setActiveTab('variables')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex-shrink-0 ${
              activeTab === 'variables'
                ? 'bg-white text-mac-accentPurple shadow-sm'
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
            onClick={() => setActiveTab('versions')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex-shrink-0 ${
              activeTab === 'versions'
                ? 'bg-white text-mac-accentAmber shadow-sm'
                : 'text-mac-textSecondary hover:text-mac-textPrimary'
            }`}
          >
            <History size={13} strokeWidth={1.75} className="text-mac-accentAmber" />
            版本历史 (v{(isScratchpadMode ? scratchpadVersions.length : currentPrompt?.versions?.length) || 1})
          </button>
        </div>
      </div>
    </div>
  );
};
