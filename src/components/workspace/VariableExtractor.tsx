import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { PromptVariable } from '../../types';
import { substituteVariables, extractVariablesFromText, resolvePromptReferences } from '../../services/llmService';
import { Code2, Plus, Trash2, Check, Copy, Eye, Sparkles, Link, ArrowRight, AlertCircle, Zap, TableProperties } from 'lucide-react';
import { BatchDatasetMatrix } from './BatchDatasetMatrix';

export const VariableExtractor: React.FC = () => {
  const { 
    activePromptId, 
    prompts, 
    skills,
    updateVariables,
    setActivePromptId,
    setIsSkillHunterOpen,
    isScratchpadActive,
    scratchpadDraft,
    scratchpadOptimized,
    scratchpadVariables,
    setScratchpadVariables,
    getFolderAncestors,
  } = useAppStore();

  const [viewMode, setViewMode] = useState<'single' | 'batch'>('single');

  const currentPrompt = prompts.find((p) => p.id === activePromptId);
  const isScratchpadMode = isScratchpadActive || !currentPrompt;

  const [copied, setCopied] = useState(false);
  const [newVarName, setNewVarName] = useState('');
  const [newVarDesc, setNewVarDesc] = useState('');

  const promptText = isScratchpadMode 
    ? (scratchpadOptimized || scratchpadDraft)
    : (currentPrompt?.currentOptimized || currentPrompt?.originalDraft || '');

  const ancestors = currentPrompt ? getFolderAncestors(currentPrompt.folderId) : [];
  const systemContext = ancestors
    .map((a) => [a.systemContext, a.domainRules].filter(Boolean).join('\n'))
    .filter(Boolean)
    .join('\n\n');
  const title = isScratchpadMode ? '单次独立优化提示词' : (currentPrompt?.title || 'Prompt');

  const variables = isScratchpadMode
    ? scratchpadVariables
    : (currentPrompt?.variables || []);

  const saveVariables = (next: PromptVariable[]) => {
    if (isScratchpadMode) {
      setScratchpadVariables(next);
    } else if (currentPrompt) {
      updateVariables(currentPrompt.id, next);
    }
  };

  const handleUpdateVar = (index: number, field: keyof PromptVariable, value: string) => {
    const next = [...variables];
    next[index] = { ...next[index], [field]: value };
    saveVariables(next);
  };

  const handleDeleteVar = (index: number) => {
    const next = variables.filter((_, i) => i !== index);
    saveVariables(next);
  };

  const handleAddVar = () => {
    if (!newVarName.trim()) return;
    const cleanName = newVarName.trim().replace(/[{}]/g, '');
    const next = [
      ...variables,
      {
        name: cleanName,
        description: newVarDesc.trim(),
        defaultValue: '',
        currentValue: '',
      },
    ];
    saveVariables(next);
    setNewVarName('');
    setNewVarDesc('');
  };

  const handleAutoScan = () => {
    const textToScan = isScratchpadMode
      ? (scratchpadDraft + '\n' + scratchpadOptimized)
      : ((currentPrompt?.originalDraft || '') + '\n' + (currentPrompt?.currentOptimized || ''));
    const detected = extractVariablesFromText(textToScan);
    const existingNames = new Set(variables.map((v) => v.name));
    const toAdd: PromptVariable[] = [];

    for (const name of detected) {
      if (!existingNames.has(name)) {
        toAdd.push({
          name,
          description: '从正文自动提取',
          defaultValue: '',
          currentValue: '',
        });
      }
    }

    if (toAdd.length > 0) {
      saveVariables([...variables, ...toAdd]);
    }
  };

  // 跨提示词与已装技能引用解析 (Prompt & Skill Chaining: {{@名称}})
  const refResult = resolvePromptReferences(promptText, prompts, skills);

  // Build key-value map for variable substitution preview
  const varMap: Record<string, string> = {};
  for (const v of variables) {
    varMap[v.name] = v.currentValue || v.defaultValue || `{{${v.name}}}`;
  }
  const previewText = substituteVariables(refResult.resolvedText, varMap);

  const handleCopyPreview = () => {
    navigator.clipboard.writeText(previewText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-4 md:p-5 space-y-4 max-w-7xl mx-auto w-full">
      {/* Top Banner */}
      <div className="bg-mac-surface backdrop-blur-xl border border-mac-border rounded-2xl p-4 shadow-mac flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-mac-accentPurple/10 text-mac-accentPurple flex items-center justify-center">
            <Code2 size={16} strokeWidth={1.75} />
          </div>
          <div>
            <h3 className="text-xs font-bold text-mac-textPrimary">
              模板动态变量与测试数据集
            </h3>
            <p className="text-[11px] text-mac-textSecondary">
              自动识别正文中类似 <code className="text-mac-accentPurple font-mono">{'{{variable}}'}</code> 的占位符，支持注入不同测试案例
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* 模式切换器 (FEAT-2) */}
          <div className="flex items-center p-1 bg-black/[0.04] dark:bg-white/[0.04] rounded-xl border border-mac-border/50">
            <button
              type="button"
              onClick={() => setViewMode('single')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg transition-all ${
                viewMode === 'single'
                  ? 'bg-white dark:bg-[#2b2b36] text-mac-accentPurple shadow-xs font-semibold'
                  : 'text-mac-textSecondary hover:text-mac-textPrimary'
              }`}
            >
              <Code2 size={13} />
              <span>单例调试与预览</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('batch')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg transition-all ${
                viewMode === 'batch'
                  ? 'bg-white dark:bg-[#2b2b36] text-mac-accentPurple shadow-xs font-semibold'
                  : 'text-mac-textSecondary hover:text-mac-textPrimary'
              }`}
            >
              <TableProperties size={13} />
              <span>批量并发评测矩阵</span>
            </button>
          </div>

          {viewMode === 'single' && (
            <button
              onClick={handleAutoScan}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-mac-border dark:border-white/10 bg-mac-surface dark:bg-white/[0.05] hover:bg-black/5 dark:hover:bg-white/10 text-mac-textPrimary text-xs font-medium transition-all shadow-sm cursor-pointer"
            >
              <Sparkles size={13} strokeWidth={1.75} className="text-mac-accentPurple" />
              重新扫描占位符
            </button>
          )}
        </div>
      </div>

      {viewMode === 'batch' ? (
        <BatchDatasetMatrix
          title={title}
          promptText={promptText}
          systemContext={systemContext}
          variables={variables}
        />
      ) : (
        <>
          {/* 跨提示词与已装技能 @ 引用链路 (Prompt & Skill Chaining) */}
      <div className="bg-mac-surface backdrop-blur-xl border border-mac-border dark:border-white/10 rounded-2xl p-4 shadow-mac">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <Link size={15} strokeWidth={2} className="text-mac-accentBlue" />
            <span className="text-xs font-bold text-mac-textPrimary">
              跨提示词与已装技能 @ 引用链路 ({refResult.references.length} 个)
            </span>
          </div>
          <span className="text-[11px] text-mac-textSecondary">
            语法：<code className="text-mac-accentBlue font-mono">{'{{@技能名称}}'}</code> 或 <code className="text-mac-accentBlue font-mono">{'{{@提示词标题}}'}</code>，执行时自动作为上下文代入
          </span>
        </div>

        {refResult.references.length > 0 ? (
          <div className="space-y-2">
            {refResult.references.map((ref, idx) => (
              <div
                key={idx}
                className="p-3 bg-white/90 dark:bg-white/[0.04] rounded-xl border border-mac-border dark:border-white/10 flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`font-mono font-semibold px-2 py-0.5 rounded-lg text-xs flex-shrink-0 ${
                    ref.type === 'skill'
                      ? 'text-purple-700 bg-purple-100/70'
                      : 'text-mac-accentBlue bg-mac-accentBlue/10'
                  }`}>
                    {`{{@${ref.title}}}`}
                  </span>
                  {ref.isResolved ? (
                    ref.type === 'skill' ? (
                      <span className="text-[10px] text-purple-700 bg-purple-50 border border-purple-200/80 px-1.5 py-0.5 rounded font-medium flex-shrink-0 flex items-center gap-1">
                        <Zap size={11} strokeWidth={2} className="text-purple-600" />
                        <span>已装配技能能力</span>
                      </span>
                    ) : (
                      <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.5 rounded font-medium flex-shrink-0 flex items-center gap-1">
                        <Check size={11} strokeWidth={2} />
                        <span>已关联目标提示词</span>
                      </span>
                    )
                  ) : (
                    <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 rounded font-medium flex-shrink-0 flex items-center gap-1">
                      <AlertCircle size={11} strokeWidth={2} />
                      <span>未匹配到技能或提示词「{ref.title}」</span>
                    </span>
                  )}
                  {ref.resolvedSnippet && (
                    <span className="text-mac-textMuted text-[11px] truncate hidden md:inline">
                      正文摘要："{ref.resolvedSnippet}..."
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {ref.promptId && (
                    <button
                      onClick={() => {
                        if (ref.promptId) {
                          setActivePromptId(ref.promptId);
                        }
                      }}
                      className="px-2.5 py-1 text-xs rounded-lg bg-mac-canvas border border-mac-border hover:bg-mac-accentBlue/10 hover:text-mac-accentBlue text-mac-textSecondary transition-all flex items-center gap-1 font-medium"
                      title="跳转至该提示词进行查看与编辑"
                    >
                      <span>查看提示词</span>
                      <ArrowRight size={12} strokeWidth={2} />
                    </button>
                  )}
                  {ref.type === 'skill' && (
                    <button
                      onClick={() => setIsSkillHunterOpen(true)}
                      className="px-2.5 py-1 text-xs rounded-lg bg-purple-50 border border-purple-200 hover:bg-purple-100 text-purple-700 transition-all flex items-center gap-1 font-medium"
                      title="打开技能中心管理技能"
                    >
                      <span>查看技能库</span>
                      <ArrowRight size={12} strokeWidth={2} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 bg-black/[0.01] rounded-xl border border-dashed border-mac-border/60 text-xs text-mac-textMuted leading-relaxed">
            当前提示词尚未引用任何上游提示词或技能。在正文或草稿中键入 <code className="text-indigo-600 font-mono font-semibold">@</code> 即可快速唤起联想，或使用 <code className="text-mac-accentBlue font-mono font-semibold">{'{{@技能名称}}'}</code> 实现管道级能力装配！
          </div>
        )}
      </div>

      {/* Variables Editor Table / Card */}
      <div className="bg-mac-surface backdrop-blur-xl border border-mac-border rounded-2xl p-4 shadow-mac">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-mac-textPrimary">
            变量列表 ({variables.length} 个)
          </span>
          <span className="text-[11px] text-mac-textSecondary">
            在 A/B 对比测试中将自动带入「当前测试值」
          </span>
        </div>

        {variables.length > 0 ? (
          <div className="space-y-2">
            {variables.map((v, idx) => (
              <div
                key={idx}
                className="p-3 bg-white/90 dark:bg-white/[0.04] rounded-xl border border-mac-border dark:border-white/10 flex flex-col md:flex-row items-start md:items-center gap-3"
              >
                {/* Variable name badge */}
                <div className="flex items-center gap-1.5 min-w-[130px]">
                  <span className="px-2 py-0.5 rounded-lg text-xs font-mono font-semibold bg-mac-accentPurple/10 text-mac-accentPurple">
                    {`{{${v.name}}}`}
                  </span>
                </div>

                {/* Description input */}
                <div className="flex-1 w-full">
                  <input
                    type="text"
                    value={v.description || ''}
                    onChange={(e) => handleUpdateVar(idx, 'description', e.target.value)}
                    placeholder="变量说明（选填）..."
                    className="w-full text-xs px-2.5 py-1.5 bg-mac-canvas rounded-lg border border-mac-border dark:border-white/10 focus:outline-none focus:ring-1 focus:ring-mac-accentPurple text-mac-textPrimary"
                  />
                </div>

                {/* Current Value input */}
                <div className="flex-[1.5] w-full">
                  <input
                    type="text"
                    value={v.currentValue || ''}
                    onChange={(e) => handleUpdateVar(idx, 'currentValue', e.target.value)}
                    placeholder="当前测试值（例如：具体测试用例）..."
                    className="w-full text-xs px-2.5 py-1.5 bg-mac-canvas rounded-lg border border-mac-border dark:border-white/10 focus:outline-none focus:ring-1 focus:ring-mac-accentBlue text-mac-textPrimary font-mono"
                  />
                </div>

                {/* Delete button */}
                <button
                  onClick={() => handleDeleteVar(idx)}
                  className="p-1.5 rounded-lg text-mac-textSecondary hover:text-red-500 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                  title="删除变量"
                >
                  <Trash2 size={13} strokeWidth={1.75} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-mac-textMuted border border-dashed border-mac-border dark:border-white/10 rounded-xl">
            暂未提取到动态变量。在提示词中输入 <code className="font-mono text-mac-accentPurple">{'{{变量名}}'}</code> 即可自动检测！
          </div>
        )}

        {/* Add custom variable manually */}
        <div className="mt-3 pt-3 border-t border-mac-border/60 dark:border-white/10 flex items-center gap-2">
          <input
            type="text"
            placeholder="新变量标识 (如 user_name)"
            value={newVarName}
            onChange={(e) => setNewVarName(e.target.value)}
            className="w-44 text-xs px-3 py-1.5 bg-mac-canvas rounded-lg border border-mac-border dark:border-white/10 focus:outline-none focus:ring-1 focus:ring-mac-accentPurple font-mono text-mac-textPrimary"
          />
          <input
            type="text"
            placeholder="变量用途说明..."
            value={newVarDesc}
            onChange={(e) => setNewVarDesc(e.target.value)}
            className="flex-1 text-xs px-3 py-1.5 bg-mac-canvas rounded-lg border border-mac-border dark:border-white/10 focus:outline-none focus:ring-1 focus:ring-mac-accentPurple text-mac-textPrimary"
          />
          <button
            onClick={handleAddVar}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-mac-accentPurple hover:opacity-90 rounded-lg flex items-center gap-1 shadow-sm cursor-pointer"
          >
            <Plus size={13} strokeWidth={2} />
            添加变量
          </button>
        </div>
      </div>

      {/* Live Preview with Variables Injected */}
      <div className="bg-mac-surface backdrop-blur-xl border border-mac-border dark:border-white/10 rounded-2xl p-4 shadow-mac flex flex-col flex-1">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Eye size={14} strokeWidth={1.75} className="text-mac-accentBlue" />
            <span className="text-xs font-bold text-mac-textPrimary">
              实时替换预览
            </span>
          </div>

          <button
            onClick={handleCopyPreview}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-mac-border dark:border-white/10 bg-mac-surface dark:bg-white/[0.05] hover:bg-black/5 dark:hover:bg-white/10 text-mac-textPrimary transition-all shadow-sm cursor-pointer"
          >
            {copied ? (
              <>
                <Check size={13} strokeWidth={2} className="text-mac-accentGreen" />
                <span className="text-mac-accentGreen">已复制</span>
              </>
            ) : (
              <>
                <Copy size={13} strokeWidth={1.75} className="text-mac-textSecondary" />
                <span>复制结果</span>
              </>
            )}
          </button>
        </div>

        <div className="flex-1 w-full bg-mac-canvas rounded-xl border border-mac-border dark:border-white/10 p-3.5 text-xs text-mac-textPrimary font-mono leading-relaxed overflow-y-auto whitespace-pre-wrap select-text min-h-[160px]">
          {previewText}
        </div>
      </div>
        </>
      )}
    </div>
  );
};
