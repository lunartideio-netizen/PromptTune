import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Play, 
  Square, 
  Plus, 
  Trash2, 
  Download, 
  FileSpreadsheet, 
  Wand2, 
  Check, 
  AlertCircle, 
  Clock, 
  Zap, 
  Maximize2, 
  X, 
  Copy,
  RotateCcw,
  Upload,
  FileJson,
  FileText,
  Gavel,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Loader2,
  SlidersHorizontal
} from 'lucide-react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { useAppStore } from '../../store/useAppStore';
import { PromptVariable } from '../../types';
import { streamChat, substituteVariables, resolvePromptReferences } from '../../services/llmService';
import { 
  DatasetCaseItem, 
  generateDefaultTestCases, 
  exportBatchEvalToMarkdown, 
  exportBatchEvalToCsv,
  parseDatasetCsv,
  parseDatasetJsonl,
  exportBatchEvalToJsonl,
  generateJudgePrompt,
  parseJudgeResponse,
  calculateJudgeMetrics,
  DEFAULT_JUDGE_RUBRICS,
  JudgeRubric
} from '../../utils/batchEvalUtils';

interface BatchDatasetMatrixProps {
  title: string;
  promptText: string;
  systemContext?: string;
  variables: PromptVariable[];
}

export const BatchDatasetMatrix: React.FC<BatchDatasetMatrixProps> = ({
  title,
  promptText,
  systemContext = '',
  variables,
}) => {
  const { apiConfig, prompts, skills, showToast } = useAppStore();
  const variableNames = variables.map((v) => v.name);

  // 初始化测试用例列表
  const [cases, setCases] = useState<DatasetCaseItem[]>(() => 
    generateDefaultTestCases(variableNames)
  );
  const [isRunning, setIsRunning] = useState(false);
  const [isJudging, setIsJudging] = useState(false);
  const [selectedRubricId, setSelectedRubricId] = useState<string>(DEFAULT_JUDGE_RUBRICS[0].id);
  const [activeModalCase, setActiveModalCase] = useState<DatasetCaseItem | null>(null);
  const [modalCopied, setModalCopied] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteContent, setPasteContent] = useState('');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const judgeAbortRef = useRef<AbortController | null>(null);

  // 挂载 AutoAnimate 物理补间动画
  const [tableBodyRef] = useAutoAnimate<HTMLTableSectionElement>({ duration: 180, easing: 'ease-out' });

  // 计算 AI 裁判指标
  const judgeMetrics = useMemo(() => calculateJudgeMetrics(cases), [cases]);
  const activeRubric = DEFAULT_JUDGE_RUBRICS.find((r) => r.id === selectedRubricId) || DEFAULT_JUDGE_RUBRICS[0];

  // 组件卸载时强制中断后台并发请求与裁判请求，防止内存泄漏与非法状态更新
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      judgeAbortRef.current?.abort();
    };
  }, []);

  // 添加新空白用例
  const handleAddCase = () => {
    const newCase: DatasetCaseItem = {
      id: `case-${Date.now()}`,
      name: `用例 ${cases.length + 1}: 自定义测试`,
      variableValues: {},
      status: 'idle',
    };
    for (const name of variableNames) {
      newCase.variableValues[name] = '';
    }
    setCases((prev) => [...prev, newCase]);
  };

  // 生成预设边界用例
  const handleGeneratePresets = () => {
    setCases(generateDefaultTestCases(variableNames));
  };

  // 更新用例某变量值
  const handleUpdateCaseValue = (caseId: string, varName: string, val: string) => {
    setCases((prev) =>
      prev.map((c) =>
        c.id === caseId
          ? { ...c, variableValues: { ...c.variableValues, [varName]: val } }
          : c
      )
    );
  };

  // 更新用例名称
  const handleUpdateCaseName = (caseId: string, name: string) => {
    setCases((prev) =>
      prev.map((c) => (c.id === caseId ? { ...c, name } : c))
    );
  };

  // 删除用例
  const handleDeleteCase = (caseId: string) => {
    setCases((prev) => prev.filter((c) => c.id !== caseId));
  };

  // 并发跑测执行器
  const handleRunBatch = async (onlyIncomplete = false) => {
    if (isRunning) return;

    const targetCases = onlyIncomplete
      ? cases.filter((c) => c.status === 'error' || c.status === 'idle')
      : cases;

    if (targetCases.length === 0) return;

    setIsRunning(true);
    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;
    const targetIds = new Set(targetCases.map((c) => c.id));

    // 仅重置目标用例状态为 running
    setCases((prev) =>
      prev.map((c) =>
        targetIds.has(c.id)
          ? {
              ...c,
              status: 'running',
              output: '',
              ttftMs: undefined,
              totalMs: undefined,
              error: undefined,
            }
          : c
      )
    );

    // 最大并发数限制为 3
    const concurrency = 3;
    const queue = [...targetCases];

    const runWorker = async () => {
      while (queue.length > 0 && !abortCtrl.signal.aborted) {
        const item = queue.shift();
        if (!item) break;

        const { resolvedText } = resolvePromptReferences(promptText, prompts, skills);
        const renderedUserPrompt = substituteVariables(resolvedText, item.variableValues);
        const messages = [
          ...(systemContext.trim() ? [{ role: 'system' as const, content: systemContext }] : []),
          { role: 'user' as const, content: renderedUserPrompt },
        ];

        const itemStartTime = Date.now();
        let itemTtft = 0;
        let itemOutput = '';

        try {
          await streamChat(
            messages,
            apiConfig,
            {
              onFirstToken: (ttft: number) => {
                itemTtft = ttft;
                setCases((prev) =>
                  prev.map((c) => (c.id === item.id ? { ...c, ttftMs: ttft } : c))
                );
              },
              onChunk: (_chunk: string, accumulated: string) => {
                itemOutput = accumulated;
                setCases((prev) =>
                  prev.map((c) => (c.id === item.id ? { ...c, output: accumulated } : c))
                );
              },
              onDone: () => {
                const total = Date.now() - itemStartTime;
                setCases((prev) =>
                  prev.map((c) =>
                    c.id === item.id
                      ? { ...c, status: 'completed', totalMs: total, output: itemOutput }
                      : c
                  )
                );
              },
              onError: (err: string) => {
                setCases((prev) =>
                  prev.map((c) =>
                    c.id === item.id
                      ? { ...c, status: 'error', error: err }
                      : c
                  )
                );
              },
            },
            abortCtrl.signal
          );
        } catch (err: any) {
          if (!abortCtrl.signal.aborted) {
            setCases((prev) =>
              prev.map((c) =>
                c.id === item.id
                  ? { ...c, status: 'error', error: err?.message || '请求异常' }
                  : c
              )
            );
          }
        }
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, targetCases.length) }, () => runWorker());
    await Promise.allSettled(workers);

    setIsRunning(false);
    abortControllerRef.current = null;
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsRunning(false);
  };

  // 自动化裁判质检打分执行器 (LLM-as-a-Judge)
  const handleRunAIJudge = async () => {
    if (isJudging || isRunning) return;
    const completedCases = cases.filter((c) => c.status === 'completed' && c.output?.trim());
    if (completedCases.length === 0) {
      showToast('暂无已跑测的生成结果，请先开始批量跑测', 'error');
      return;
    }

    setIsJudging(true);
    const abortCtrl = new AbortController();
    judgeAbortRef.current = abortCtrl;

    const { resolvedText } = resolvePromptReferences(promptText, prompts, skills);
    const queue = [...completedCases];
    const concurrency = 2; // 裁判并发限制

    const runJudgeWorker = async () => {
      while (queue.length > 0 && !abortCtrl.signal.aborted) {
        const item = queue.shift();
        if (!item || !item.output) break;

        // 标记为正在裁判
        setCases((prev) =>
          prev.map((c) => (c.id === item.id ? { ...c, judgeStatus: 'pending' } : c))
        );

        const judgePrompt = generateJudgePrompt(resolvedText, item.variableValues, item.output, activeRubric);
        const messages = [{ role: 'user' as const, content: judgePrompt }];

        let accumulated = '';
        try {
          await streamChat(
            messages,
            apiConfig,
            {
              onChunk: (_chunk, acc) => {
                accumulated = acc;
              },
              onDone: () => {
                const parsed = parseJudgeResponse(accumulated, activeRubric.passThreshold);
                setCases((prev) =>
                  prev.map((c) =>
                    c.id === item.id
                      ? {
                          ...c,
                          judgeScore: parsed.score,
                          judgeReason: parsed.reason,
                          judgeStatus: parsed.pass ? 'pass' : 'fail',
                        }
                      : c
                  )
                );
              },
              onError: (err) => {
                setCases((prev) =>
                  prev.map((c) =>
                    c.id === item.id
                      ? { ...c, judgeReason: `裁判异常: ${err}`, judgeStatus: 'fail' }
                      : c
                  )
                );
              },
            },
            abortCtrl.signal
          );
        } catch (err: any) {
          if (!abortCtrl.signal.aborted) {
            setCases((prev) =>
              prev.map((c) =>
                c.id === item.id
                  ? { ...c, judgeReason: `裁判异常: ${err?.message || '请求失败'}`, judgeStatus: 'fail' }
                  : c
              )
            );
          }
        }
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, completedCases.length) }, () => runJudgeWorker());
    await Promise.allSettled(workers);

    setIsJudging(false);
    judgeAbortRef.current = null;
    if (!abortCtrl.signal.aborted) {
      showToast('AI 裁判质量评估已全部完成', 'success');
    }
  };

  const handleStopJudge = () => {
    judgeAbortRef.current?.abort();
    judgeAbortRef.current = null;
    setIsJudging(false);
  };

  // 导出 Markdown 报告
  const handleExportMarkdown = () => {
    const md = exportBatchEvalToMarkdown(title, apiConfig.model, cases, variableNames);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `eval_report_${title || 'prompt'}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  // 导出 CSV 表格
  const handleExportCsv = () => {
    const csv = exportBatchEvalToCsv(cases, variableNames);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `eval_report_${title || 'prompt'}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  // 导出 JSONL 格式
  const handleExportJsonl = () => {
    const jsonl = exportBatchEvalToJsonl(cases, variableNames);
    const blob = new Blob([jsonl], { type: 'application/x-ndjson;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `eval_report_${title || 'prompt'}.jsonl`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  // 核心导入文本解析器 (自动识别 CSV / JSONL / JSON)
  const handleImportText = (rawText: string, sourceName: string) => {
    const trimmed = rawText.trim();
    if (!trimmed) return;

    let result: { cases: DatasetCaseItem[]; matchedVars: string[]; totalRows: number };

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      result = parseDatasetJsonl(trimmed, variableNames);
    } else {
      result = parseDatasetCsv(trimmed, variableNames);
    }

    if (result.cases.length === 0) {
      setImportNotice(`⚠️ 未能从 ${sourceName} 中识别出有效的测试用例`);
      setTimeout(() => setImportNotice(null), 4000);
      return;
    }

    setCases((prev) => [...prev, ...result.cases]);
    const matchInfo = result.matchedVars.length > 0 
      ? `匹配到变量: ${result.matchedVars.map((v) => `{{${v}}}`).join(', ')}`
      : '未匹配到同名变量列';
    setImportNotice(`🎉 成功导入 ${result.cases.length} 组用例！(${matchInfo})`);
    setTimeout(() => setImportNotice(null), 5000);
  };

  // 文件选取回调
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        handleImportText(content, file.name);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // 文件拖拽导入
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (content) {
          handleImportText(content, file.name);
        }
      };
      reader.readAsText(file);
    }
  };

  // 提交粘贴导入
  const handlePasteSubmit = () => {
    if (!pasteContent.trim()) return;
    handleImportText(pasteContent, '剪贴板内容');
    setPasteContent('');
    setShowPasteModal(false);
  };

  const completedCount = cases.filter((c) => c.status === 'completed').length;
  const incompleteCount = cases.filter((c) => c.status === 'error' || c.status === 'idle').length;

  return (
    <div 
      className="flex flex-col space-y-4 select-none relative"
      onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={handleDrop}
    >
      {/* 隐藏的文件输入组件 */}
      <input 
        ref={fileInputRef}
        type="file" 
        accept=".csv,.jsonl,.json,.txt"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* 拖拽指示悬浮层 */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-30 bg-mac-accentBlue/10 dark:bg-mac-accentBlue/20 backdrop-blur-xs border-2 border-dashed border-mac-accentBlue rounded-2xl flex flex-col items-center justify-center pointer-events-none transition-all animate-in fade-in duration-150">
          <Upload size={36} className="text-mac-accentBlue animate-bounce mb-2" />
          <span className="text-sm font-semibold text-mac-accentBlue">释放文件以一键导入数据集 (.csv, .jsonl)</span>
        </div>
      )}

      {/* 状态提醒通知横条 */}
      {importNotice && (
        <div className="px-4 py-2.5 rounded-xl bg-mac-accentBlue/10 dark:bg-mac-accentBlue/20 border border-mac-accentBlue/30 text-xs text-mac-accentBlue dark:text-blue-300 font-medium flex items-center justify-between animate-in fade-in duration-200">
          <span>{importNotice}</span>
          <button 
            type="button" 
            onClick={() => setImportNotice(null)}
            className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-md cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* AI 裁判质量门禁看板 (LLM-as-a-Judge Banner) */}
      <div className="relative overflow-hidden p-4 rounded-2xl bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-blue-500/10 border border-indigo-500/20 dark:border-indigo-500/30 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 shadow-2xs">
            <Gavel size={20} strokeWidth={2.2} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold text-mac-textPrimary dark:text-zinc-100 flex items-center gap-1.5">
                <span>AI 裁判自动化质量门禁 (LLM-as-a-Judge)</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 font-medium">
                  生产级质检
                </span>
              </h4>
            </div>
            <p className="text-[11px] text-mac-textSecondary dark:text-zinc-400 mt-0.5">
              由裁判模型对大模型输出进行严苛盲审，自动校验指令遵从度、事实准确性与格式门禁
            </p>
          </div>
        </div>

        {/* 裁判看板统计指标 */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-white/80 dark:bg-zinc-800/80 px-3 py-1.5 rounded-xl border border-mac-border/60 dark:border-white/10 text-xs shadow-2xs">
            <div className="flex flex-col">
              <span className="text-[10px] text-mac-textMuted uppercase">综合及格率</span>
              <span className="font-mono font-bold text-mac-textPrimary">
                {judgeMetrics.totalJudged > 0 ? `${judgeMetrics.passRate}%` : '-'}
              </span>
            </div>
            <div className="h-6 w-px bg-mac-border/60 dark:bg-white/10 mx-1" />
            <div className="flex flex-col">
              <span className="text-[10px] text-mac-textMuted uppercase">平均评分</span>
              <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                {judgeMetrics.totalJudged > 0 ? `${judgeMetrics.averageScore} / 5.0` : '-'}
              </span>
            </div>
            <div className="h-6 w-px bg-mac-border/60 dark:bg-white/10 mx-1" />
            <div className="flex flex-col">
              <span className="text-[10px] text-mac-textMuted uppercase">通过 / 淘汰</span>
              <span className="font-mono text-xs">
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">{judgeMetrics.passCount}</span>
                <span className="text-mac-textMuted mx-0.5">/</span>
                <span className="text-rose-600 dark:text-rose-400 font-bold">{judgeMetrics.failCount}</span>
              </span>
            </div>
          </div>

          {/* 准则选择与启动按钮 */}
          <div className="flex items-center gap-1.5">
            <select
              value={selectedRubricId}
              onChange={(e) => setSelectedRubricId(e.target.value)}
              disabled={isJudging}
              className="text-xs px-2.5 py-1.5 rounded-xl bg-white dark:bg-zinc-800 border border-mac-border/80 dark:border-white/10 text-mac-textPrimary focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans cursor-pointer"
            >
              {DEFAULT_JUDGE_RUBRICS.map((rubric) => (
                <option key={rubric.id} value={rubric.id}>
                  {rubric.name} (门槛 {rubric.passThreshold}分)
                </option>
              ))}
            </select>

            {isJudging ? (
              <button
                type="button"
                onClick={handleStopJudge}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl bg-rose-500 text-white hover:bg-rose-600 transition-all shadow-xs cursor-pointer active:scale-98"
              >
                <Square size={12} fill="currentColor" />
                <span>停止裁判</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleRunAIJudge}
                disabled={completedCount === 0 || isRunning}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-xs cursor-pointer active:scale-98 disabled:opacity-40"
                title={completedCount === 0 ? '请先运行至少一个用例以获得输出结果' : '启动 AI 裁判对所有已完成用例进行质量判定'}
              >
                <Gavel size={13} />
                <span>启动 AI 裁判质检</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3 bg-white/70 dark:bg-white/[0.03] p-3 rounded-2xl border border-mac-border/80 dark:border-white/10 shadow-2xs">
        <div className="flex items-center gap-2 flex-wrap">
          {isRunning ? (
            <button
              type="button"
              onClick={handleStop}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-xl bg-red-500 text-white hover:bg-red-600 transition-all shadow-sm cursor-pointer active:scale-98"
            >
              <Square size={13} fill="currentColor" />
              <span>停止并发跑测</span>
            </button>
          ) : (
            <>
            <button
              type="button"
              onClick={() => handleRunBatch(false)}
              disabled={cases.length === 0}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-xl bg-mac-accentBlue text-white hover:brightness-105 active:scale-98 disabled:opacity-50 transition-all shadow-sm cursor-pointer"
            >
              <Play size={13} fill="currentColor" />
              <span>开始批量并发跑测 ({cases.length} 组)</span>
            </button>
              {incompleteCount > 0 && incompleteCount < cases.length && (
                <button
                  type="button"
                  onClick={() => handleRunBatch(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-amber-300 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-all shadow-2xs cursor-pointer active:scale-98"
                  title="仅重跑执行失败或未执行的用例"
                >
                  <RotateCcw size={12} strokeWidth={2} />
                  <span>仅重跑未完成 ({incompleteCount} 组)</span>
                </button>
              )}
            </>
          )}

          <button
            type="button"
            onClick={handleAddCase}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-xl border border-mac-border dark:border-white/10 bg-mac-surface dark:bg-white/[0.05] hover:bg-black/[0.04] dark:hover:bg-white/10 text-mac-textPrimary dark:text-zinc-200 transition-all shadow-2xs cursor-pointer active:scale-98"
          >
            <Plus size={13} />
            <span>添加用例</span>
          </button>

          {/* 导入数据集按钮组 */}
          <div className="flex items-center rounded-xl border border-mac-border dark:border-white/10 bg-mac-surface dark:bg-white/[0.05] shadow-2xs overflow-hidden">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium hover:bg-black/[0.04] dark:hover:bg-white/10 text-mac-textPrimary dark:text-zinc-200 transition-all cursor-pointer"
              title="支持选择本地 .csv 或 .jsonl 测试集文件直接导入"
            >
              <Upload size={13} className="text-mac-accentBlue" />
              <span>导入文件</span>
            </button>
            <button
              type="button"
              onClick={() => setShowPasteModal(true)}
              className="px-2 py-1.5 text-xs font-medium border-l border-mac-border/60 dark:border-white/10 hover:bg-black/[0.04] dark:hover:bg-white/10 text-mac-textSecondary dark:text-zinc-400 hover:text-mac-textPrimary dark:hover:text-zinc-200 transition-all cursor-pointer"
              title="从剪贴板粘贴表格或 JSONL 数据导入"
            >
              粘贴
            </button>
          </div>

          <button
            type="button"
            onClick={handleGeneratePresets}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-xl border border-mac-border dark:border-white/10 bg-mac-surface dark:bg-white/[0.05] hover:bg-black/[0.04] dark:hover:bg-white/10 text-mac-accentPurple dark:text-purple-300 transition-all shadow-2xs cursor-pointer active:scale-98"
            title="一键加载标准、空值、特殊符号与超长文本边界测试集"
          >
            <Wand2 size={13} />
            <span>重置边界预设</span>
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-mac-textMuted dark:text-zinc-400 font-mono">
            进度: {completedCount}/{cases.length}
          </span>

          <button
            type="button"
            onClick={handleExportMarkdown}
            disabled={cases.length === 0}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-xl border border-mac-border dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10 text-mac-textPrimary dark:text-zinc-200 transition-all shadow-2xs cursor-pointer disabled:opacity-50 active:scale-98"
            title="导出为 Markdown 评测报告"
          >
            <Download size={13} />
            <span>Markdown</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={cases.length === 0}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-xl border border-mac-border dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10 text-mac-textPrimary dark:text-zinc-200 transition-all shadow-2xs cursor-pointer disabled:opacity-50 active:scale-98"
            title="导出为 Excel / CSV 矩阵"
          >
            <FileSpreadsheet size={13} />
            <span>CSV</span>
          </button>

          <button
            type="button"
            onClick={handleExportJsonl}
            disabled={cases.length === 0}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-xl border border-mac-border dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10 text-mac-textPrimary dark:text-zinc-200 transition-all shadow-2xs cursor-pointer disabled:opacity-50 active:scale-98"
            title="导出为便于自动化程序解析的 JSONL 数据"
          >
            <FileJson size={13} />
            <span>JSONL</span>
          </button>
        </div>
      </div>

      {/* Dataset Matrix Table */}
      <div className="border border-mac-border/80 dark:border-white/10 rounded-2xl overflow-hidden bg-mac-surface dark:bg-[#18181b] shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-black/[0.03] dark:bg-white/[0.04] border-b border-mac-border/70 dark:border-white/10 text-mac-textSecondary dark:text-zinc-400">
                <th className="py-2.5 px-3 font-semibold w-40">用例名称</th>
                {variableNames.map((name) => (
                  <th key={name} className="py-2.5 px-3 font-semibold min-w-[130px]">
                    <span className="text-mac-accentPurple dark:text-purple-300 font-mono">{`{{${name}}}`}</span>
                  </th>
                ))}
                <th className="py-2.5 px-3 font-semibold w-24 text-center">状态</th>
                <th className="py-2.5 px-3 font-semibold min-w-[140px] text-center">AI 裁判质检</th>
                <th className="py-2.5 px-3 font-semibold w-24 text-right">TTFT</th>
                <th className="py-2.5 px-3 font-semibold w-24 text-right">总耗时</th>
                <th className="py-2.5 px-3 font-semibold min-w-[200px]">输出预览</th>
                <th className="py-2.5 px-3 font-semibold w-12 text-center">操作</th>
              </tr>
            </thead>
            <tbody ref={tableBodyRef} className="divide-y divide-mac-border/40 dark:divide-white/10 font-mono">
              {cases.map((c) => (
                <tr key={c.id} className="hover:bg-black/[0.015] dark:hover:bg-white/[0.015] transition-colors">
                  {/* Case Name */}
                  <td className="p-2">
                    <input
                      type="text"
                      value={c.name}
                      onChange={(e) => handleUpdateCaseName(c.id, e.target.value)}
                      className="w-full px-2 py-1 text-xs bg-transparent border border-transparent hover:border-mac-border focus:border-mac-accentBlue rounded-lg focus:outline-none font-sans text-mac-textPrimary font-medium"
                    />
                  </td>

                  {/* Variable Inputs */}
                  {variableNames.map((name) => (
                    <td key={name} className="p-2">
                      <input
                        type="text"
                        value={c.variableValues[name] ?? ''}
                        onChange={(e) => handleUpdateCaseValue(c.id, name, e.target.value)}
                        placeholder={`值...`}
                        className="w-full px-2 py-1 text-xs bg-black/[0.02] dark:bg-white/[0.04] border border-mac-border/60 focus:border-mac-accentPurple rounded-lg focus:outline-none text-mac-textPrimary"
                      />
                    </td>
                  ))}

                  {/* Status Badge */}
                  <td className="p-2 text-center">
                    {c.status === 'running' && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-mac-accentBlue bg-mac-accentBlue/10 px-2 py-0.5 rounded-full font-sans">
                        <Zap size={11} className="animate-spin" />
                        <span>跑测中</span>
                      </span>
                    )}
                    {c.status === 'completed' && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full font-sans">
                        <Check size={11} />
                        <span>完成</span>
                      </span>
                    )}
                    {c.status === 'error' && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full font-sans" title={c.error}>
                        <AlertCircle size={11} />
                        <span>失败</span>
                      </span>
                    )}
                    {c.status === 'idle' && (
                      <span className="text-[11px] text-mac-textMuted font-sans">未执行</span>
                    )}
                  </td>

                  {/* AI 裁判质检打分 */}
                  <td className="p-2 text-center">
                    {c.judgeStatus === 'pending' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-indigo-600 bg-indigo-500/10 px-2 py-0.5 rounded-full font-sans">
                        <Loader2 size={11} className="animate-spin text-indigo-500" />
                        <span>质检中...</span>
                      </span>
                    ) : typeof c.judgeScore === 'number' ? (
                      <div 
                        className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full cursor-help font-mono border ${
                          c.judgeStatus === 'pass'
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20'
                        }`}
                        title={c.judgeReason ? `【裁判评定理由】: ${c.judgeReason}` : '已完成自动化质量审查'}
                      >
                        {c.judgeStatus === 'pass' ? (
                          <CheckCircle2 size={11} className="text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <XCircle size={11} className="text-rose-600 dark:text-rose-400" />
                        )}
                        <span>{c.judgeScore} 分</span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-mac-textMuted font-sans">待质检</span>
                    )}
                  </td>

                  {/* TTFT */}
                  <td className="p-2 text-right text-mac-textSecondary">
                    {c.ttftMs ? `${c.ttftMs}ms` : '-'}
                  </td>

                  {/* Total Latency */}
                  <td className="p-2 text-right text-mac-textSecondary">
                    {c.totalMs ? `${(c.totalMs / 1000).toFixed(2)}s` : '-'}
                  </td>

                  {/* Output Preview */}
                  <td className="p-2">
                    <div className="flex items-center justify-between gap-1 group">
                      <span className="truncate max-w-[240px] text-mac-textPrimary font-sans">
                        {c.output || c.error || <span className="text-mac-textMuted italic">等待测试结果...</span>}
                      </span>
                      {c.output && (
                        <button
                          type="button"
                          onClick={() => setActiveModalCase(c)}
                          className="p-1 rounded text-mac-textMuted hover:text-mac-accentBlue hover:bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="全屏查看完整生成结果"
                        >
                          <Maximize2 size={12} />
                        </button>
                      )}
                    </div>
                  </td>

                  {/* Delete Row */}
                  <td className="p-2 text-center">
                    <button
                      type="button"
                      onClick={() => handleDeleteCase(c.id)}
                      className="p-1 text-mac-textMuted hover:text-red-500 rounded hover:bg-black/5 transition-colors"
                      title="删除此用例"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Output Details Inspection Modal */}
      {activeModalCase && (
        <div 
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150 select-none"
          onClick={() => setActiveModalCase(null)}
        >
          <div 
            className="bg-white dark:bg-[#1c1c21] border border-mac-border dark:border-white/10 rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-mac-border/60 dark:border-white/10 flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-xs text-mac-textPrimary dark:text-zinc-100">{activeModalCase.name}</h4>
                <p className="text-[11px] text-mac-textMuted dark:text-zinc-400">
                  首字延迟: {activeModalCase.ttftMs || 0}ms | 总耗时: {activeModalCase.totalMs || 0}ms
                </p>
              </div>
              <button 
                type="button"
                onClick={() => setActiveModalCase(null)}
                className="p-1.5 rounded-lg text-mac-textMuted hover:text-mac-textPrimary dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 text-xs text-mac-textPrimary dark:text-zinc-200 whitespace-pre-wrap leading-relaxed select-text font-sans">
              {activeModalCase.output}
            </div>

            <div className="px-5 py-3 border-t border-mac-border/60 dark:border-white/10 bg-mac-surface dark:bg-[#1c1c21] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(activeModalCase.output || '');
                  setModalCopied(true);
                  setTimeout(() => setModalCopied(false), 1500);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl bg-mac-accentBlue text-white hover:brightness-105 cursor-pointer shadow-sm"
              >
                {modalCopied ? <Check size={13} /> : <Copy size={13} />}
                <span>{modalCopied ? '已复制' : '复制内容'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Paste Import Modal */}
      {showPasteModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150 select-none"
          onClick={() => setShowPasteModal(false)}
        >
          <div 
            className="bg-white dark:bg-[#1c1c21] border border-mac-border dark:border-white/10 rounded-2xl shadow-2xl max-w-xl w-full flex flex-col max-h-[85vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-mac-border/60 dark:border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-mac-accentBlue/10 text-mac-accentBlue">
                  <Upload size={16} />
                </div>
                <div>
                  <h4 className="font-semibold text-xs text-mac-textPrimary dark:text-zinc-100">粘贴测试数据集</h4>
                  <p className="text-[11px] text-mac-textMuted dark:text-zinc-400">
                    支持粘贴 CSV、TSV (Excel复制) 或逐行 JSONL 数据，自动匹配模板变量
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setShowPasteModal(false)}
                className="p-1.5 rounded-lg text-mac-textMuted hover:text-mac-textPrimary dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 flex-1 flex flex-col space-y-2">
              <span className="text-xs font-medium text-mac-textSecondary dark:text-zinc-400">
                数据文本内容 (示例：用例名称,{variableNames.join(',') || 'var1,var2'})：
              </span>
              <textarea
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
                placeholder={`用例名称,${variableNames.join(',') || '参数1'}\n常规用例,${variableNames.map(() => '测试值').join(',')}\n边界测试,${variableNames.map(() => '特殊符号!@#').join(',')}`}
                className="w-full h-48 p-3 text-xs font-mono bg-black/[0.02] dark:bg-zinc-900 border border-mac-border dark:border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-mac-accentBlue text-mac-textPrimary dark:text-zinc-100 resize-none select-text leading-relaxed"
                autoFocus
              />
            </div>

            <div className="px-5 py-3 border-t border-mac-border/60 dark:border-white/10 bg-mac-surface dark:bg-[#1c1c21] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPasteModal(false)}
                className="px-3 py-1.5 text-xs text-mac-textSecondary hover:text-mac-textPrimary dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handlePasteSubmit}
                disabled={!pasteContent.trim()}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-xl bg-mac-accentBlue text-white hover:brightness-105 disabled:opacity-50 cursor-pointer shadow-sm transition-all"
              >
                <Check size={13} />
                <span>解析并导入</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
