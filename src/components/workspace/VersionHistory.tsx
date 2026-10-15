import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { PromptVersion, PromptItem } from '../../types';
import { syncVariables } from '../../services/llmService';
import { calculatePromptQuality } from '../../utils/promptUtils';
import { 
  History, 
  RotateCcw, 
  Copy, 
  Check, 
  Sparkles, 
  CheckCircle2, 
  Columns2, 
  GitFork, 
  GitBranch, 
  GitCommit, 
  ChevronRight, 
  ArrowDown, 
  Layers, 
  Plus,
  Network
} from 'lucide-react';
import { DiffViewer } from '../common/DiffViewer';
import { confirmAction } from '../../utils/dialog';

export const VersionHistory: React.FC = () => {
  const { 
    activePromptId, 
    setActivePromptId,
    prompts, 
    updatePrompt, 
    createChildPrompt,
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

  const [viewType, setViewType] = useState<'tree' | 'list'>('tree');
  const [copiedVersion, setCopiedVersion] = useState<number | null>(null);
  const [diffVersion, setDiffVersion] = useState<number | null>(null);

  const currentText = isScratchpadMode 
    ? (scratchpadOptimized || scratchpadDraft) 
    : (currentPrompt?.currentOptimized || currentPrompt?.originalDraft || '');

  // 倒序列表 (最新在前)
  const versionsList = useMemo(() => {
    return isScratchpadMode
      ? [...scratchpadVersions].reverse()
      : [...(currentPrompt?.versions || [])].reverse();
  }, [isScratchpadMode, scratchpadVersions, currentPrompt?.versions]);

  // 正序演进树 (按时间演进 v1 -> v2 -> v3)
  const versionsChronological = useMemo(() => {
    return isScratchpadMode
      ? [...scratchpadVersions]
      : [...(currentPrompt?.versions || [])];
  }, [isScratchpadMode, scratchpadVersions, currentPrompt?.versions]);

  // 递归回溯提示词全链路祖先 (从根到直接上游)
  const ancestors = useMemo(() => {
    if (!currentPrompt || isScratchpadMode) return [];
    const chain: PromptItem[] = [];
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

  // 寻找所有以此提示词为父节点的下游子任务
  const childPrompts = useMemo(() => {
    if (!currentPrompt || isScratchpadMode) return [];
    return prompts.filter((p) => p.parentPromptId === currentPrompt.id);
  }, [currentPrompt, prompts, isScratchpadMode]);

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
      <div className="bg-mac-surface dark:bg-zinc-900/80 backdrop-blur-xl border border-mac-border dark:border-white/10 rounded-2xl p-4 shadow-mac flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-mac-accentAmber/10 text-mac-accentAmber flex items-center justify-center">
            <History size={16} strokeWidth={1.75} />
          </div>
          <div>
            <h3 className="text-xs font-bold text-mac-textPrimary dark:text-zinc-100 flex items-center gap-2">
              <span>提示词版本演进与全景拓扑</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-mac-accentAmber/10 text-mac-accentAmber font-medium">
                {versionsList.length} 个快照
              </span>
            </h3>
            <p className="text-[11px] text-mac-textSecondary dark:text-zinc-400">
              每一次结构化重构或微调均会自动保存快照，支持无损词级对比、版本拓扑图与一键回滚
            </p>
          </div>
        </div>

        {/* 视图切换：树状图谱 vs 快照列表 */}
        <div className="flex items-center bg-black/[0.04] dark:bg-white/[0.06] p-0.5 rounded-xl border border-black/[0.06] dark:border-white/10">
          <button
            type="button"
            onClick={() => setViewType('tree')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
              viewType === 'tree'
                ? 'bg-white dark:bg-zinc-800 text-mac-textPrimary dark:text-zinc-100 shadow-xs font-semibold'
                : 'text-mac-textSecondary dark:text-zinc-400 hover:text-mac-textPrimary dark:hover:text-zinc-200'
            }`}
          >
            <Network size={13} strokeWidth={2} />
            <span>演进图谱 (Tree)</span>
          </button>

          <button
            type="button"
            onClick={() => setViewType('list')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
              viewType === 'list'
                ? 'bg-white dark:bg-zinc-800 text-mac-textPrimary dark:text-zinc-100 shadow-xs font-semibold'
                : 'text-mac-textSecondary dark:text-zinc-400 hover:text-mac-textPrimary dark:hover:text-zinc-200'
            }`}
          >
            <Layers size={13} strokeWidth={2} />
            <span>快照列表 (List)</span>
          </button>
        </div>
      </div>

      {/* 视图 A: 演进树图 (Tree / Timeline) */}
      {viewType === 'tree' ? (
        <div className="space-y-4">
          {/* 1. 上游链路祖先节点 (若有) */}
          {ancestors.length > 0 && (
            <div className="bg-mac-surface dark:bg-zinc-900/60 backdrop-blur-xl border border-purple-500/20 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3 text-xs font-bold text-purple-700 dark:text-purple-300">
                <GitFork size={14} className="text-purple-600" />
                <span>前置上游链路节点 ({ancestors.length} 层依赖)</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {ancestors.map((anc, idx) => (
                  <React.Fragment key={anc.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setActivePromptId(anc.id);
                        setActiveTab('optimize');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-800 dark:text-purple-200 text-xs font-medium transition-all flex items-center gap-2 group cursor-pointer shadow-2xs"
                      title="点击切入查看该上游提示词节点"
                    >
                      <span className="w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center text-[10px] font-mono font-bold">
                        {idx + 1}
                      </span>
                      <span className="font-semibold">{anc.title}</span>
                      <ChevronRight size={12} className="opacity-60 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                    {idx < ancestors.length - 1 && (
                      <span className="text-purple-400 font-bold">›</span>
                    )}
                  </React.Fragment>
                ))}
              </div>
              <div className="flex justify-center mt-3">
                <ArrowDown size={16} className="text-purple-400 animate-bounce-subtle" />
              </div>
            </div>
          )}

          {/* 2. 当前提示词版本演进时间轴 */}
          <div className="relative pl-6 sm:pl-8 space-y-4 before:absolute before:left-3 sm:before:left-4 before:top-3 before:bottom-3 before:w-0.5 before:bg-mac-border/80 dark:before:bg-white/10">
            {versionsChronological.length > 0 ? (
              versionsChronological.map((v, index) => {
                const isLatest = index === versionsChronological.length - 1;
                const score = v.qualityScore || calculatePromptQuality(v.promptText, v.framework);

                return (
                  <div key={v.version} className="relative group">
                    {/* Timeline Node Dot */}
                    <div 
                      className={`absolute -left-6 sm:-left-8 top-4 -translate-x-1/2 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
                        isLatest 
                          ? 'bg-mac-accentBlue border-white shadow-xs dark:border-zinc-900 ring-4 ring-mac-accentBlue/20' 
                          : 'bg-white dark:bg-zinc-800 border-mac-border dark:border-white/20'
                      }`}
                    >
                      {isLatest ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                      ) : (
                        <span className="w-1 h-1 rounded-full bg-mac-textMuted" />
                      )}
                    </div>

                    {/* Card */}
                    <div className={`bg-mac-surface dark:bg-zinc-900/80 backdrop-blur-xl border rounded-2xl p-4 shadow-mac hover:shadow-macHover transition-all ${
                      isLatest 
                        ? 'border-mac-accentBlue/40 dark:border-mac-accentBlue/40 ring-1 ring-mac-accentBlue/10' 
                        : 'border-mac-border dark:border-white/10'
                    }`}>
                      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-lg text-xs font-mono font-bold ${
                            isLatest 
                              ? 'bg-mac-accentBlue text-white shadow-2xs' 
                              : 'bg-black/5 dark:bg-white/10 text-mac-textPrimary dark:text-zinc-200'
                          }`}>
                            v{v.version}
                          </span>

                          <span className="text-xs font-bold text-mac-textPrimary dark:text-zinc-100">
                            {v.instruction || (isLatest ? '当前最新版' : '结构化优化节点')}
                          </span>

                          {isLatest && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-mac-accentBlue/10 text-mac-accentBlue font-semibold border border-mac-accentBlue/20">
                              Active 当前
                            </span>
                          )}

                          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-black/5 dark:bg-white/5 text-mac-textSecondary dark:text-zinc-400">
                            {v.framework}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-mac-textMuted dark:text-zinc-500 font-mono">
                            {new Date(v.timestamp).toLocaleString()}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleCopy(v)}
                            className="p-1.5 rounded-lg border border-mac-border dark:border-white/10 hover:bg-white dark:hover:bg-zinc-800 text-mac-textSecondary dark:text-zinc-300 shadow-2xs cursor-pointer"
                            title="复制此版本"
                          >
                            {copiedVersion === v.version ? (
                              <Check size={13} strokeWidth={2} className="text-mac-accentGreen" />
                            ) : (
                              <Copy size={13} strokeWidth={1.75} />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => setDiffVersion(diffVersion === v.version ? null : v.version)}
                            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border transition-all cursor-pointer ${
                              diffVersion === v.version
                                ? 'bg-mac-accentBlue text-white border-mac-accentBlue shadow-2xs font-semibold'
                                : 'border-mac-border dark:border-white/10 hover:bg-white dark:hover:bg-zinc-800 text-mac-textSecondary dark:text-zinc-300'
                            }`}
                          >
                            <Columns2 size={13} strokeWidth={1.75} />
                            <span>{diffVersion === v.version ? '收起透镜' : '词级透镜'}</span>
                          </button>

                          {!isLatest && (
                            <button
                              type="button"
                              onClick={() => handleRestore(v)}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-mac-accentBlue/10 hover:bg-mac-accentBlue/20 text-mac-accentBlue transition-colors cursor-pointer"
                            >
                              <RotateCcw size={13} strokeWidth={1.75} />
                              <span>回滚至此</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* 三维健康分指标 */}
                      <div className="mb-2.5 flex items-center gap-3 text-[11px] text-mac-textSecondary dark:text-zinc-400 px-3 py-1.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-mac-border/50 dark:border-white/5">
                        <span className="flex items-center gap-1">
                          <CheckCircle2 size={12} className="text-emerald-500" />
                          清晰度: <strong className="text-mac-textPrimary dark:text-zinc-200 font-mono">{score.clarity}%</strong>
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle2 size={12} className="text-emerald-500" />
                          完备度: <strong className="text-mac-textPrimary dark:text-zinc-200 font-mono">{score.completeness}%</strong>
                        </span>
                        <span className="flex items-center gap-1">
                          <Sparkles size={12} className="text-mac-accentAmber" />
                          规范分: <strong className="text-mac-textPrimary dark:text-zinc-200 font-mono">{score.structure}%</strong>
                        </span>
                      </div>

                      {/* Content or Diff */}
                      {diffVersion === v.version ? (
                        <div className="mt-2">
                          <DiffViewer
                            oldText={v.promptText}
                            newText={currentText}
                            oldTitle={`快照版本 (v${v.version})`}
                            newTitle="当前主线提示词"
                          />
                        </div>
                      ) : (
                        <div className="bg-white/80 dark:bg-zinc-800/80 p-3 rounded-xl border border-mac-border/70 dark:border-white/10 text-xs font-mono text-mac-textPrimary dark:text-zinc-200 max-h-36 overflow-y-auto whitespace-pre-wrap select-text leading-relaxed">
                          {v.promptText}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-10 text-center text-xs text-mac-textMuted dark:text-zinc-500 border border-dashed border-mac-border dark:border-white/10 rounded-xl">
                暂无版本快照，优化提示词后将自动在此形成演进树。
              </div>
            )}
          </div>

          {/* 3. 下游派生链路提示词 (若有) */}
          {childPrompts.length > 0 && (
            <div className="bg-mac-surface dark:bg-zinc-900/60 backdrop-blur-xl border border-emerald-500/20 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                <GitBranch size={14} className="text-emerald-600" />
                <span>下游派生子任务 ({childPrompts.length} 个下游分支)</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {childPrompts.map((cp) => (
                  <button
                    key={cp.id}
                    type="button"
                    onClick={() => {
                      setActivePromptId(cp.id);
                      setActiveTab('optimize');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 text-xs font-medium transition-all flex items-center gap-2 cursor-pointer shadow-2xs group"
                  >
                    <span>{cp.title}</span>
                    <span className="text-[10px] font-mono opacity-70">v{cp.versions?.length || 1}</span>
                    <ChevronRight size={12} className="opacity-60 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* 视图 B: 经典快照列表 (List) */
        <div className="space-y-3">
          {versionsList.length > 0 ? (
            versionsList.map((v) => (
              <div
                key={v.version}
                className="bg-mac-surface dark:bg-zinc-900/80 backdrop-blur-xl border border-mac-border dark:border-white/10 rounded-2xl p-4 shadow-mac hover:shadow-macHover transition-all"
              >
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-lg text-xs font-mono font-bold bg-mac-accentBlue/10 text-mac-accentBlue">
                      v{v.version}
                    </span>
                    <span className="text-xs font-semibold text-mac-textPrimary dark:text-zinc-100">
                      {v.instruction || '版本快照'}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-black/5 dark:bg-white/5 text-mac-textSecondary dark:text-zinc-400">
                      {v.framework}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-mac-textMuted dark:text-zinc-500 font-mono">
                      {new Date(v.timestamp).toLocaleString()}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleCopy(v)}
                      className="p-1.5 rounded-lg border border-mac-border dark:border-white/10 hover:bg-white dark:hover:bg-zinc-800 text-mac-textSecondary dark:text-zinc-300 shadow-2xs cursor-pointer"
                      title="复制此版本"
                    >
                      {copiedVersion === v.version ? (
                        <Check size={13} strokeWidth={2} className="text-mac-accentGreen" />
                      ) : (
                        <Copy size={13} strokeWidth={1.75} />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setDiffVersion(diffVersion === v.version ? null : v.version)}
                      className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border transition-all cursor-pointer ${
                        diffVersion === v.version
                          ? 'bg-mac-accentBlue text-white border-mac-accentBlue shadow-xs'
                          : 'border-mac-border dark:border-white/10 hover:bg-white dark:hover:bg-zinc-800 text-mac-textSecondary dark:text-zinc-300'
                      }`}
                    >
                      <Columns2 size={13} strokeWidth={1.75} />
                      <span>{diffVersion === v.version ? '收起变动' : '对比当前版'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRestore(v)}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-mac-accentBlue/10 text-mac-accentBlue hover:bg-mac-accentBlue/20 transition-colors cursor-pointer"
                    >
                      <RotateCcw size={13} strokeWidth={1.75} />
                      <span>回滚至此版本</span>
                    </button>
                  </div>
                </div>

                {/* Diff Viewer or Content */}
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
                  <div className="bg-white/90 dark:bg-zinc-800/80 p-3 rounded-xl border border-mac-border dark:border-white/10 text-xs font-mono text-mac-textPrimary dark:text-zinc-200 max-h-48 overflow-y-auto whitespace-pre-wrap select-text leading-relaxed">
                    {v.promptText}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="py-12 text-center text-xs text-mac-textMuted dark:text-zinc-500 border border-dashed border-mac-border dark:border-white/10 rounded-xl">
              暂无历史快照，在「结构优化」面板进行优化后将在此处归档。
            </div>
          )}
        </div>
      )}
    </div>
  );
};
