import React, { useState, useCallback } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { PromptWorkspaceCore } from './PromptWorkspaceCore';
import { extractSmartTitleFromDraft } from '../../services/llmService';
import { FolderPlus } from 'lucide-react';
import confetti from 'canvas-confetti';

export const QuickScratchpad: React.FC = () => {
  const { 
    scratchpadDraft, 
    setScratchpadDraft,
    scratchpadOptimized, 
    setScratchpadOptimized,
    scratchpadFramework,
    setScratchpadFramework,
    scratchpadTurns,
    addScratchpadTurn,
    scratchpadVersions,
    addScratchpadVersion,
    scratchpadVariables,
    setScratchpadVariables,
    archiveScratchpadToFolder,
    folders,
    showToast,
  } = useAppStore();

  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [targetFolderId, setTargetFolderId] = useState<string | null>(null);
  const [archiveTitle, setArchiveTitle] = useState('');

  const handleDraftChange = useCallback((draft: string) => {
    setScratchpadDraft(draft);
  }, [setScratchpadDraft]);

  const handleOptimizedChange = useCallback((opt: string) => {
    setScratchpadOptimized(opt);
  }, [setScratchpadOptimized]);

  const handleFrameworkChange = useCallback((fw: any) => {
    setScratchpadFramework(fw);
  }, [setScratchpadFramework]);

  const handleSaveVersion = useCallback(async (version: any) => {
    addScratchpadVersion(version);
  }, [addScratchpadVersion]);

  const handleAddTurn = useCallback(async (turn: any) => {
    addScratchpadTurn(turn);
  }, [addScratchpadTurn]);

  const handleUpdateVariables = useCallback(async (vars: any) => {
    setScratchpadVariables(vars);
  }, [setScratchpadVariables]);

  const openArchiveDialog = () => {
    const smart = extractSmartTitleFromDraft(scratchpadDraft) || '快速优化提示词';
    setArchiveTitle(smart);
    setShowArchiveDialog(true);
  };

  const handleArchiveConfirm = async () => {
    try {
      await archiveScratchpadToFolder(targetFolderId, archiveTitle);
      setShowArchiveDialog(false);
      confetti({
        particleCount: 50,
        spread: 70,
        origin: { y: 0.6, x: 0.5 },
      });
      showToast('提示词已成功归档至项目库！', 'success');
    } catch (err: any) {
      showToast('归档失败: ' + err.message, 'error');
    }
  };

  const archiveButton = (
    <button
      onClick={openArchiveDialog}
      disabled={!scratchpadDraft.trim() && !scratchpadOptimized.trim()}
      className="px-2 py-1 text-xs rounded-lg bg-mac-canvas border border-mac-border dark:border-white/10 hover:bg-white dark:hover:bg-white/10 text-mac-textPrimary hover:text-mac-accentGreen font-medium transition-all shadow-xs flex items-center gap-1 disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer"
      title="将当前便签草稿与成果保存并归档到项目文件夹"
    >
      <FolderPlus size={12.5} strokeWidth={1.75} className="text-mac-accentGreen shrink-0" />
      <span>归档<span className="hidden xl:inline">到项目</span></span>
    </button>
  );

  return (
    <>
      <PromptWorkspaceCore
        mode="scratchpad"
        promptId="scratchpad"
        title="独立单次优化台"
        initialDraft={scratchpadDraft}
        initialOptimized={scratchpadOptimized}
        initialFramework={scratchpadFramework}
        variables={scratchpadVariables}
        versions={scratchpadVersions}
        turns={scratchpadTurns}
        headerExtra={archiveButton}
        onDraftChange={handleDraftChange}
        onOptimizedChange={handleOptimizedChange}
        onFrameworkChange={handleFrameworkChange}
        onSaveVersion={handleSaveVersion}
        onAddTurn={handleAddTurn}
        onUpdateVariables={handleUpdateVariables}
      />

      {/* 归档弹窗 */}
      {showArchiveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-fade-in p-4">
          <div className="bg-white dark:bg-[#1c1c21] border border-mac-border dark:border-white/10 rounded-2xl shadow-macModal w-full max-w-sm p-5 space-y-4">
            <div className="text-xs font-bold text-mac-textPrimary">
              保存并归档到文件夹
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-mac-textPrimary mb-1">
                标题
              </label>
              <input
                type="text"
                value={archiveTitle}
                onChange={(e) => setArchiveTitle(e.target.value)}
                placeholder="提示词标题"
                className="w-full text-xs px-3 py-2 bg-mac-canvas rounded-xl border border-mac-border dark:border-white/10 focus:outline-none focus:ring-1 focus:ring-mac-accentGreen text-mac-textPrimary font-medium"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-mac-textPrimary mb-1">
                选择目录
              </label>
              <select
                value={targetFolderId || ''}
                onChange={(e) => setTargetFolderId(e.target.value ? e.target.value : null)}
                className="w-full text-xs px-3 py-2 bg-mac-canvas rounded-xl border border-mac-border dark:border-white/10 focus:outline-none focus:ring-1 focus:ring-mac-accentGreen text-mac-textPrimary cursor-pointer"
              >
                <option value="">根目录 (未归类)</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-mac-border/60 dark:border-white/10">
              <button
                onClick={() => setShowArchiveDialog(false)}
                className="px-3 py-1.5 text-xs text-mac-textSecondary hover:text-mac-textPrimary hover:bg-black/5 dark:hover:bg-white/10 rounded-lg cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleArchiveConfirm}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-mac-accentGreen hover:bg-mac-accentGreen/90 rounded-lg shadow-sm cursor-pointer"
              >
                确认归档
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default QuickScratchpad;
