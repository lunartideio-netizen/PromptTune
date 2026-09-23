import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { PromptVersion } from '../../types';
import { syncVariables } from '../../services/llmService';
import { History, RotateCcw, Copy, Check, Sparkles, CheckCircle2, Columns2 } from 'lucide-react';
import { DiffViewer } from '../common/DiffViewer';
import { confirmAction } from '../../utils/dialog';

export const VersionHistory: React.FC = () => {
  const { 
    activePromptId, 
    prompts, 
    updatePrompt, 
    setActiveTab, 
    isScratchpadActive,
    scratchpadVersions,
    scratchpadDraft,
    scratchpadOptimized,
    setScratchpadOptimized,
    setScratchpadFramework
  } = useAppStore();

  const currentPrompt = prompts.find((p) => p.id === activePromptId);
  const isScratchpadMode = isScratchpadActive || !currentPrompt;

  const [copiedVersion, setCopiedVersion] = useState<number | null>(null);
  const [diffVersion, setDiffVersion] = useState<number | null>(null);

  const currentText = isScratchpadMode 
    ? (scratchpadOptimized || scratchpadDraft) 
    : (currentPrompt?.currentOptimized || currentPrompt?.originalDraft || '');

  const versions = isScratchpadMode
    ? [...scratchpadVersions].reverse()
    : [...(currentPrompt?.versions || [])].reverse();

  const handleRestore = async (v: PromptVersion) => {
    if (await confirmAction(`确定将提示词回滚至版本 v${v.version} 吗？`)) {
      if (isScratchpadMode) {
        setScratchpadOptimized(v.promptText);
        setScratchpadFramework(v.framework);
      } else if (currentPrompt) {
        const syncedVars = syncVariables(
          currentPrompt.variables || [],
          (currentPrompt.originalDraft || '') + '\n' + v.promptText
        );
        updatePrompt(currentPrompt.id, {
          currentOptimized: v.promptText,
          framework: v.framework,
          variables: syncedVars,
        });
      }
      setActiveTab('optimize');
    }
  };

  const handleCopy = (v: PromptVersion) => {
    navigator.clipboard.writeText(v.promptText);
    setCopiedVersion(v.version);
    setTimeout(() => setCopiedVersion(null), 1500);
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-4 md:p-5 space-y-4 max-w-7xl mx-auto w-full">
      {/* Header Banner */}
      <div className="bg-mac-surface backdrop-blur-xl border border-mac-border rounded-2xl p-4 shadow-mac flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-mac-accentAmber/10 text-mac-accentAmber flex items-center justify-center">
            <History size={16} strokeWidth={1.75} />
          </div>
          <div>
            <h3 className="text-xs font-bold text-mac-textPrimary">
              提示词迭代版本归档
            </h3>
            <p className="text-[11px] text-mac-textSecondary">
              每一次结构化重构或多轮微调均会自动保存快照，支持随时无损对比与一键回滚
            </p>
          </div>
        </div>

        <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-full bg-mac-accentAmber/10 text-mac-accentAmber">
          共 {versions.length} 个版本快照
        </span>
      </div>

      {/* Version List */}
      <div className="space-y-3">
        {versions.length > 0 ? (
          versions.map((v) => (
            <div
              key={v.version}
              className="bg-mac-surface backdrop-blur-xl border border-mac-border rounded-2xl p-4 shadow-mac hover:shadow-macHover transition-all"
            >
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-lg text-xs font-mono font-bold bg-mac-accentBlue/10 text-mac-accentBlue">
                    v{v.version}
                  </span>
                  <span className="text-xs font-semibold text-mac-textPrimary">
                    {v.instruction || '版本快照'}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-black/5 text-mac-textSecondary">
                    {v.framework}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-mac-textMuted font-mono">
                    {new Date(v.timestamp).toLocaleString()}
                  </span>

                  <button
                    onClick={() => handleCopy(v)}
                    className="p-1.5 rounded-lg border border-mac-border hover:bg-white text-mac-textSecondary hover:text-mac-textPrimary shadow-sm"
                    title="复制此版本"
                  >
                    {copiedVersion === v.version ? (
                      <Check size={13} strokeWidth={2} className="text-mac-accentGreen" />
                    ) : (
                      <Copy size={13} strokeWidth={1.75} />
                    )}
                  </button>

                  <button
                    onClick={() => setDiffVersion(diffVersion === v.version ? null : v.version)}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border transition-all ${
                      diffVersion === v.version
                        ? 'bg-mac-accentBlue text-white border-mac-accentBlue shadow-xs'
                        : 'border-mac-border hover:bg-white text-mac-textSecondary hover:text-mac-textPrimary'
                    }`}
                  >
                    <Columns2 size={13} strokeWidth={1.75} />
                    <span>{diffVersion === v.version ? '收起变动' : '对比当前版'}</span>
                  </button>

                  <button
                    onClick={() => handleRestore(v)}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-mac-accentBlue/10 text-mac-accentBlue hover:bg-mac-accentBlue/20 transition-colors"
                  >
                    <RotateCcw size={13} strokeWidth={1.75} />
                    回滚至此版本
                  </button>
                </div>
              </div>

              {/* Quality score cards if available */}
              {v.qualityScore && (
                <div className="mb-3 flex items-center gap-4 text-[11px] text-mac-textSecondary px-3 py-1.5 rounded-xl bg-black/[0.02] border border-mac-border/60">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 size={13} strokeWidth={1.75} className="text-mac-accentGreen" />
                    结构清晰度: <strong className="text-mac-textPrimary font-mono">{v.qualityScore.clarity}%</strong>
                  </span>
                  <span className="flex items-center gap-1">
                    <CheckCircle2 size={13} strokeWidth={1.75} className="text-mac-accentGreen" />
                    约束完备度: <strong className="text-mac-textPrimary font-mono">{v.qualityScore.completeness}%</strong>
                  </span>
                  <span className="flex items-center gap-1">
                    <Sparkles size={13} strokeWidth={1.75} className="text-mac-accentAmber" />
                    架构规范分: <strong className="text-mac-textPrimary font-mono">{v.qualityScore.structure}%</strong>
                  </span>
                </div>
              )}

              {/* Prompt Body / Diff Viewer */}
              {diffVersion === v.version ? (
                <div className="mt-2">
                  <DiffViewer
                    oldText={v.promptText}
                    newText={currentText}
                    oldTitle={`历史快照 (v${v.version})`}
                    newTitle="当前最新提示词"
                  />
                </div>
              ) : (
                <div className="bg-white/90 p-3 rounded-xl border border-mac-border text-xs font-mono text-mac-textPrimary max-h-48 overflow-y-auto whitespace-pre-wrap select-text leading-relaxed">
                  {v.promptText}
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="py-12 text-center text-xs text-mac-textMuted border border-dashed border-mac-border rounded-xl">
            暂无历史快照，在「结构优化」面板进行优化后将在此处归档。
          </div>
        )}
      </div>
    </div>
  );
};
