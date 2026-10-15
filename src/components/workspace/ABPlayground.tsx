import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { 
  substituteVariables, 
  resolvePromptReferences, 
  streamChat, 
  ChatMessage 
} from '../../services/llmService';
import { StreamTelemetry, APIConfig } from '../../types';
import { DiffViewer } from '../common/DiffViewer';
import { 
  Zap, 
  Square, 
  Clock, 
  Activity, 
  Gauge, 
  Sparkles,
  Columns2,
  Key,
  Settings,
  Code2,
  ArrowRight,
  Trophy,
  Copy,
  Check,
  GitBranch,
  ArrowUpRight
} from 'lucide-react';
import confetti from 'canvas-confetti';

const initialTelemetry: StreamTelemetry = {
  startTime: 0,
  firstTokenTime: null,
  endTime: null,
  ttftMs: 0,
  totalMs: 0,
  tokenCount: 0,
  tokPerSec: 0,
  content: '',
  isDone: false,
};

export const ABPlayground: React.FC = () => {
  const { 
    activePromptId, 
    prompts, 
    skills,
    apiConfig, 
    getInheritedContextForPrompt,
    setIsSettingsOpen,
    isScratchpadActive,
    scratchpadDraft,
    scratchpadOptimized,
    scratchpadVariables,
    setScratchpadVariables,
    updateVariables,
    setActiveTab,
    setScratchpadOptimized,
    addScratchpadVersion,
    scratchpadVersions,
    scratchpadFramework,
    updatePrompt,
    addPromptVersion,
    createPrompt,
    setActivePromptId,
    showToast
  } = useAppStore();

  const currentPrompt = prompts.find((p) => p.id === activePromptId);
  const isScratchpadMode = isScratchpadActive || !currentPrompt;

  const originalDraft = isScratchpadMode ? scratchpadDraft : (currentPrompt?.originalDraft || '');
  const currentOptimized = isScratchpadMode ? scratchpadOptimized : (currentPrompt?.currentOptimized || '');
  const variables = isScratchpadMode ? scratchpadVariables : (currentPrompt?.variables || []);
  const versionLabel = isScratchpadMode ? '优化成果' : `v${currentPrompt?.versions?.length || 1}`;

  const [isRunning, setIsRunning] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [apiKeyError, setApiKeyError] = useState(false);
  const [copiedA, setCopiedA] = useState(false);
  const [copiedB, setCopiedB] = useState(false);

  // 跨模型 A/B 对决独立模型配置与提示词源选择 (FEAT-1)
  const [modelA, setModelA] = useState<string>(apiConfig.model || 'gpt-4o');
  const [modelB, setModelB] = useState<string>(apiConfig.model || 'gpt-4o');
  const [promptSourceA, setPromptSourceA] = useState<'draft' | 'optimized'>('draft');
  const [promptSourceB, setPromptSourceB] = useState<'draft' | 'optimized'>('optimized');

  // Telemetry for A and B
  const [telemetryA, setTelemetryA] = useState<StreamTelemetry>(initialTelemetry);
  const [telemetryB, setTelemetryB] = useState<StreamTelemetry>(initialTelemetry);

  const isA_TTFT_Better = Boolean(telemetryA.ttftMs && telemetryB.ttftMs && telemetryA.ttftMs < telemetryB.ttftMs);
  const isB_TTFT_Better = Boolean(telemetryA.ttftMs && telemetryB.ttftMs && telemetryB.ttftMs < telemetryA.ttftMs);
  const isA_TPS_Better = Boolean(telemetryA.tokPerSec && telemetryB.tokPerSec && telemetryA.tokPerSec > telemetryB.tokPerSec);
  const isB_TPS_Better = Boolean(telemetryA.tokPerSec && telemetryB.tokPerSec && telemetryB.tokPerSec > telemetryA.tokPerSec);

  const abortControllerARef = useRef<AbortController | null>(null);
  const abortControllerBRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  // 组件卸载或提示词切换时，无条件中断双轨流式网络请求，杜绝内存泄漏与非法渲染
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortControllerARef.current?.abort();
      abortControllerBRef.current?.abort();
    };
  }, [activePromptId]);

  const isOllama = apiConfig.provider === 'ollama';
  const isLocal = isOllama || apiConfig.baseUrl.includes('localhost') || apiConfig.baseUrl.includes('127.0.0.1');
  const hasKey = Boolean(apiConfig.apiKey?.trim()) || isLocal;

  const { combinedSystemContext, combinedDomainRules } = (!isScratchpadMode && currentPrompt)
    ? getInheritedContextForPrompt(currentPrompt.id)
    : { combinedSystemContext: '', combinedDomainRules: '' };

  const handleVariableChange = (varName: string, val: string) => {
    const updated = variables.map((v) => (v.name === varName ? { ...v, currentValue: val } : v));
    if (isScratchpadMode) {
      setScratchpadVariables(updated);
    } else if (currentPrompt) {
      updateVariables(currentPrompt.id, updated);
    }
  };

  // Substitute variables
  const varMap: Record<string, string> = {};
  for (const v of variables) {
    varMap[v.name] = v.currentValue || v.defaultValue || `{{${v.name}}}`;
  }

  // 1. 动态根据选定源解析 A/B 提示词 (FEAT-1)
  const textA = promptSourceA === 'draft' ? originalDraft : (currentOptimized || originalDraft);
  const textB = promptSourceB === 'optimized' ? (currentOptimized || originalDraft) : originalDraft;

  // 2. 优先解析跨提示词与技能 @ 引用 (Prompt & Skill Chaining: {{@名称}})
  const resolvedA = resolvePromptReferences(textA || '', prompts, skills).resolvedText;
  const resolvedB = resolvePromptReferences(textB || '', prompts, skills).resolvedText;

  // 3. 代入动态变量测试值 (Variable Substitution)
  const substitutedA = substituteVariables(resolvedA, varMap);
  const substitutedB = substituteVariables(resolvedB, varMap);

  const handleStop = () => {
    abortControllerARef.current?.abort();
    abortControllerBRef.current?.abort();
    setIsRunning(false);
  };

  const handleRunDualStream = async () => {
    setApiKeyError(false);
    if (!hasKey) {
      setApiKeyError(true);
      return;
    }

    setIsRunning(true);

    setTelemetryA({ ...initialTelemetry, startTime: Date.now() });
    setTelemetryB({ ...initialTelemetry, startTime: Date.now() });

    abortControllerARef.current = new AbortController();
    abortControllerBRef.current = new AbortController();

    const systemPrompt = [
      combinedSystemContext ? `【系统背景】：${combinedSystemContext}` : '',
      combinedDomainRules ? `【规则约束】：${combinedDomainRules}` : '',
    ].filter(Boolean).join('\n\n');

    const messagesA: ChatMessage[] = [
      ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
      { role: 'user', content: substitutedA },
    ];

    const messagesB: ChatMessage[] = [
      ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
      { role: 'user', content: substitutedB },
    ];

    let doneA = false;
    let doneB = false;

    const checkBothDone = () => {
      if (doneA && doneB) {
        if (!isMountedRef.current) return;
        setIsRunning(false);
        confetti({
          particleCount: 50,
          spread: 70,
          origin: { y: 0.7, x: 0.5 },
          colors: ['#0A84FF', '#34C759', '#FF9F0A'],
        });
      }
    };

    // Track A 独立模型配置
    const configA: APIConfig = {
      ...apiConfig,
      model: modelA.trim() || apiConfig.model,
    };

    // Track B 独立模型配置
    const configB: APIConfig = {
      ...apiConfig,
      model: modelB.trim() || apiConfig.model,
    };

    // Track A Stream
    streamChat(
      messagesA,
      configA,
      {
        onFirstToken: (ttft) => {
          if (!isMountedRef.current) return;
          setTelemetryA((prev) => ({ ...prev, firstTokenTime: Date.now(), ttftMs: ttft }));
        },
        onChunk: (_chunk, acc) => {
          if (!isMountedRef.current) return;
          setTelemetryA((prev) => ({ ...prev, content: acc }));
        },
        onDone: (telemetry) => {
          if (!isMountedRef.current) return;
          setTelemetryA(telemetry);
          doneA = true;
          checkBothDone();
        },
        onError: (_err) => {
          if (!isMountedRef.current) return;
          useAppStore.getState().showToast('A 轨评测未完成: ' + _err, 'error');
          doneA = true;
          checkBothDone();
        },
      },
      abortControllerARef.current.signal
    );

    // Track B Stream
    streamChat(
      messagesB,
      configB,
      {
        onFirstToken: (ttft) => {
          if (!isMountedRef.current) return;
          setTelemetryB((prev) => ({ ...prev, firstTokenTime: Date.now(), ttftMs: ttft }));
        },
        onChunk: (_chunk, acc) => {
          if (!isMountedRef.current) return;
          setTelemetryB((prev) => ({ ...prev, content: acc }));
        },
        onDone: (telemetry) => {
          if (!isMountedRef.current) return;
          setTelemetryB(telemetry);
          doneB = true;
          checkBothDone();
        },
        onError: (_err) => {
          if (!isMountedRef.current) return;
          useAppStore.getState().showToast('B 轨评测未完成: ' + _err, 'error');
          doneB = true;
          checkBothDone();
        },
      },
      abortControllerBRef.current.signal
    );
  };

  const handleCopy = (track: 'A' | 'B') => {
    const text = track === 'A' ? telemetryA.content : telemetryB.content;
    if (!text) return;
    navigator.clipboard.writeText(text);
    if (track === 'A') {
      setCopiedA(true);
      setTimeout(() => setCopiedA(false), 2000);
    } else {
      setCopiedB(true);
      setTimeout(() => setCopiedB(false), 2000);
    }
    showToast(`已复制 ${track} 轨输出文本`, 'success');
  };

  const handlePromote = async (track: 'A' | 'B') => {
    const text = track === 'A' ? telemetryA.content : telemetryB.content;
    if (!text.trim()) return;

    if (isScratchpadMode) {
      setScratchpadOptimized(text);
      addScratchpadVersion({
        version: (scratchpadVersions.length || 0) + 1,
        promptText: text,
        instruction: `A/B 测试 ${track} 轨基准采纳回填`,
        framework: scratchpadFramework,
        timestamp: Date.now(),
        tokenCount: Math.ceil(text.length / 3),
      });
    } else if (activePromptId) {
      await updatePrompt(activePromptId, { currentOptimized: text });
      await addPromptVersion(activePromptId, {
        version: (currentPrompt?.versions.length || 0) + 1,
        promptText: text,
        instruction: `A/B 测试 ${track} 轨基准采纳回填`,
        framework: currentPrompt?.framework || 'FREEFORM',
        timestamp: Date.now(),
        tokenCount: Math.ceil(text.length / 3),
      });
    }
    showToast(`已将 ${track} 轨结果成功采纳为主工作台基准版本`, 'success');
    setActiveTab('optimize');
  };

  const handleBranch = async (track: 'A' | 'B') => {
    const text = track === 'A' ? telemetryA.content : telemetryB.content;
    if (!text.trim()) return;

    const baseTitle = currentPrompt?.title || '未命名提示词';
    const newTitle = `${baseTitle} (${track}轨实验衍生)`;
    const newId = await createPrompt(currentPrompt?.folderId || null, newTitle);
    await updatePrompt(newId, {
      originalDraft: originalDraft,
      currentOptimized: text,
      framework: currentPrompt?.framework || 'FREEFORM',
    });
    setActivePromptId(newId);
    showToast(`已成功派生新提示词: ${newTitle}`, 'success');
    setActiveTab('optimize');
  };

  if (!originalDraft.trim() && !currentOptimized.trim()) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-mac-textMuted">
        <Zap size={36} strokeWidth={1.5} className="text-mac-textMuted/40 mb-3" />
        <p className="text-xs">暂无草稿或优化结果。请在「结构优化」面板输入原始草稿并进行优化。</p>
        <button
          onClick={() => setActiveTab('optimize')}
          className="mt-3 px-3 py-1.5 rounded-xl bg-mac-accentBlue text-white text-xs font-medium hover:bg-mac-accentBlueHover transition-colors"
        >
          前往结构优化
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-4 md:p-5 space-y-4 max-w-7xl mx-auto w-full">
      {/* 1. Header Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-mac-accentGreen/10 flex items-center justify-center text-mac-accentGreen">
            <Zap size={16} strokeWidth={1.75} />
          </div>
          <div>
            <h3 className="text-xs font-bold text-mac-textPrimary">
              双轨并发 A/B 对比测试基准
            </h3>
            <p className="text-[11px] text-mac-textSecondary">
              同参真实端点并行请求，评测首字延迟 (TTFT)、响应吞吐及输出质量
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowDiff(!showDiff)}
            className={`px-3 py-1.5 text-xs font-medium rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer ${
              showDiff
                ? 'bg-mac-accentBlue/10 border-mac-accentBlue/30 text-mac-accentBlue shadow-sm'
                : 'border-mac-border dark:border-white/10 hover:bg-white dark:hover:bg-white/10 text-mac-textSecondary'
            }`}
          >
            <Columns2 size={14} strokeWidth={1.75} />
            {showDiff ? '隐藏差异' : '高亮差异'}
          </button>

          {isRunning ? (
            <button
              onClick={handleStop}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Square size={13} strokeWidth={2} className="fill-current" />
              终止测试
            </button>
          ) : (
            <button
              onClick={handleRunDualStream}
              disabled={!substitutedA && !substitutedB}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-mac-accentGreen hover:bg-mac-accentGreen/90 disabled:opacity-50 rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Zap size={14} strokeWidth={2} />
              并发双流测试
            </button>
          )}
        </div>
      </div>

      {/* API Key Missing Inline Notice */}
      {apiKeyError && (
        <div className="bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200/90 dark:border-amber-800/60 rounded-2xl p-3 shadow-sm flex items-center justify-between text-xs text-amber-900 dark:text-amber-200 animate-fade-in">
          <div className="flex items-center gap-2">
            <Key size={15} strokeWidth={1.75} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <span>未配置 API Key，请先完成配置或使用本地 Ollama。</span>
          </div>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="px-3 py-1.5 bg-amber-600 text-white rounded-xl font-semibold hover:bg-amber-700 transition-colors text-xs flex-shrink-0 flex items-center gap-1 shadow-sm cursor-pointer"
          >
            <Settings size={14} strokeWidth={1.75} />
            配置密钥
          </button>
        </div>
      )}

      {/* 2. In-Place Variable Assignment Bar (if variables exist) */}
      {variables.length > 0 && (
        <div className="bg-mac-surface backdrop-blur-xl border border-mac-border dark:border-white/10 rounded-2xl p-3.5 shadow-mac space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code2 size={15} strokeWidth={2} className="text-mac-accentPurple" />
              <span className="text-xs font-semibold text-mac-textPrimary">
                测试变量实时赋值条
              </span>
              <span className="text-[10px] text-mac-textSecondary hidden sm:inline">
                （在此直接填入测试用例值，将实时代入 A/B 双轨对比）
              </span>
            </div>
            <button
              onClick={() => setActiveTab('variables')}
              className="text-[11px] text-mac-accentPurple hover:underline flex items-center gap-1 font-medium cursor-pointer"
            >
              <span>完整变量表</span>
              <ArrowRight size={11} strokeWidth={2} />
            </button>
          </div>

          <div className="flex items-center gap-2.5 overflow-x-auto pb-1 pt-0.5 scrollbar-thin">
            {variables.map((v) => (
              <div
                key={v.name}
                className="flex items-center gap-2 bg-white/90 dark:bg-white/[0.04] border border-mac-border dark:border-white/10 rounded-xl px-2.5 py-1.5 shadow-xs flex-shrink-0"
              >
                <span className="font-mono text-xs font-semibold text-mac-accentPurple bg-mac-accentPurple/10 px-1.5 py-0.5 rounded-lg">
                  {`{{${v.name}}}`}
                </span>
                <input
                  type="text"
                  value={v.currentValue || ''}
                  onChange={(e) => handleVariableChange(v.name, e.target.value)}
                  placeholder={v.defaultValue || '输入测试值...'}
                  className="w-36 sm:w-48 text-xs font-mono bg-mac-canvas px-2 py-1 rounded-lg border border-mac-border/80 dark:border-white/10 focus:outline-none focus:ring-1 focus:ring-mac-accentPurple text-mac-textPrimary"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 模型自动提示候选列表 */}
      <datalist id="ab-models-list">
        <option value="gpt-4o" />
        <option value="gpt-4o-mini" />
        <option value="deepseek-chat" />
        <option value="deepseek-reasoner" />
        <option value="claude-3-7-sonnet" />
        <option value="gemini-2.5-pro" />
        <option value="llama3.2" />
        <option value="qwen-2.5-72b" />
      </datalist>

      {/* 3. Side-by-Side Prompts Preview & Diff */}
      {showDiff ? (
        <DiffViewer
          oldText={substitutedA}
          newText={substitutedB}
          oldTitle={`A 轨 (${modelA || apiConfig.model})`}
          newTitle={`B 轨 (${modelB || apiConfig.model})`}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Track A: Prompt & Model Selector */}
          <div className="p-3.5 bg-mac-canvasAlt/50 dark:bg-white/[0.02] rounded-2xl border border-mac-border dark:border-white/10 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-mac-textSecondary" />
                <span className="text-xs font-bold text-mac-textSecondary">A 轨</span>
                {/* 来源切换 */}
                <div className="inline-flex rounded-lg border border-mac-border dark:border-white/10 bg-black/5 dark:bg-white/[0.06] p-0.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setPromptSourceA('draft')}
                    className={`px-1.5 py-0.5 rounded font-medium transition-all cursor-pointer ${
                      promptSourceA === 'draft' ? 'bg-white dark:bg-white/15 text-mac-textPrimary shadow-2xs font-semibold' : 'text-mac-textSecondary'
                    }`}
                  >
                    原始草稿
                  </button>
                  <button
                    type="button"
                    onClick={() => setPromptSourceA('optimized')}
                    className={`px-1.5 py-0.5 rounded font-medium transition-all cursor-pointer ${
                      promptSourceA === 'optimized' ? 'bg-white dark:bg-white/15 text-mac-textPrimary shadow-2xs font-semibold' : 'text-mac-textSecondary'
                    }`}
                  >
                    优化成果
                  </button>
                </div>
              </div>

              {/* 独立模型选择器 */}
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  list="ab-models-list"
                  value={modelA}
                  onChange={(e) => setModelA(e.target.value)}
                  placeholder="A轨模型..."
                  className="w-28 sm:w-36 text-[11px] font-mono px-2 py-0.5 bg-white dark:bg-zinc-800 rounded-lg border border-mac-border dark:border-white/10 text-mac-textPrimary focus:outline-none focus:ring-1 focus:ring-mac-accentBlue"
                />
                <span className="text-[10px] font-mono text-mac-textMuted">
                  ~{Math.ceil(substitutedA.length / 3)}t
                </span>
              </div>
            </div>

            <div className="flex-1 bg-mac-canvas p-3 rounded-xl border border-mac-border/60 dark:border-white/10 text-xs font-mono text-mac-textSecondary max-h-36 overflow-y-auto whitespace-pre-wrap select-text">
              {substitutedA || '（无提示词内容）'}
            </div>
          </div>

          {/* Track B: Prompt & Model Selector */}
          <div className="p-3.5 bg-mac-accentGreen/[0.03] dark:bg-mac-accentGreen/[0.06] rounded-2xl border border-mac-accentGreen/20 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Sparkles size={13} strokeWidth={1.75} className="text-mac-accentGreen" />
                <span className="text-xs font-bold text-mac-accentGreen">B 轨</span>
                {/* 来源切换 */}
                <div className="inline-flex rounded-lg border border-mac-accentGreen/30 bg-mac-accentGreen/10 p-0.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setPromptSourceB('draft')}
                    className={`px-1.5 py-0.5 rounded font-medium transition-all cursor-pointer ${
                      promptSourceB === 'draft' ? 'bg-white dark:bg-white/15 text-mac-accentGreen dark:text-emerald-300 shadow-2xs font-semibold' : 'text-mac-textSecondary'
                    }`}
                  >
                    原始草稿
                  </button>
                  <button
                    type="button"
                    onClick={() => setPromptSourceB('optimized')}
                    className={`px-1.5 py-0.5 rounded font-medium transition-all cursor-pointer ${
                      promptSourceB === 'optimized' ? 'bg-white dark:bg-white/15 text-mac-accentGreen dark:text-emerald-300 shadow-2xs font-semibold' : 'text-mac-textSecondary'
                    }`}
                  >
                    优化成果
                  </button>
                </div>
              </div>

              {/* 独立模型选择器 */}
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  list="ab-models-list"
                  value={modelB}
                  onChange={(e) => setModelB(e.target.value)}
                  placeholder="B轨模型..."
                  className="w-28 sm:w-36 text-[11px] font-mono px-2 py-0.5 bg-white dark:bg-zinc-800 rounded-lg border border-mac-accentGreen/40 text-mac-textPrimary focus:outline-none focus:ring-1 focus:ring-mac-accentGreen"
                />
                <span className="text-[10px] font-mono text-mac-accentGreen font-semibold">
                  ~{Math.ceil(substitutedB.length / 3)}t
                </span>
              </div>
            </div>

            <div className="flex-1 bg-mac-canvas p-3 rounded-xl border border-mac-accentGreen/30 text-xs font-mono text-mac-textPrimary max-h-36 overflow-y-auto whitespace-pre-wrap select-text">
              {substitutedB || '（无提示词内容）'}
            </div>
          </div>
        </div>
      )}

      {/* 4. Real-Time Benchmark Execution Output Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-[380px]">
        {/* Output A Pane */}
        <div className="bg-mac-surface backdrop-blur-xl border border-mac-border dark:border-white/10 rounded-2xl p-4 shadow-mac flex flex-col">
          {/* Telemetry Pro HUD A */}
          <div className="px-3 py-2 bg-mac-canvasAlt/60 dark:bg-white/[0.04] rounded-xl border border-mac-border dark:border-white/10 mb-3 flex items-center justify-between text-xs font-mono tabular-nums shadow-2xs">
            <div className="flex items-center gap-1.5 text-mac-textSecondary">
              <Clock size={13} strokeWidth={1.75} className="text-mac-accentBlue" />
              <span className="font-sans text-[11px]">首字:</span>
              <span className={`font-bold ${isA_TTFT_Better ? 'text-emerald-600 dark:text-emerald-400' : 'text-mac-textPrimary'}`}>
                {telemetryA.ttftMs ? `${telemetryA.ttftMs}ms` : '--'}
              </span>
              {isA_TTFT_Better && (
                <span className="text-[10px] text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/40 font-sans font-semibold px-1 py-0.5 rounded flex items-center gap-0.5">
                  <Trophy size={9} strokeWidth={2.5} /> 更快
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-mac-textSecondary">
              <Activity size={13} strokeWidth={1.75} className="text-mac-accentPurple" />
              <span className="font-sans text-[11px]">耗时:</span>
              <span className="font-bold text-mac-textPrimary">
                {telemetryA.totalMs ? `${(telemetryA.totalMs / 1000).toFixed(2)}s` : '--'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-mac-textSecondary">
              <Gauge size={13} strokeWidth={1.75} className="text-mac-accentAmber" />
              <span className="font-sans text-[11px]">速率:</span>
              <span className={`font-bold ${isA_TPS_Better ? 'text-emerald-600 dark:text-emerald-400' : 'text-mac-textPrimary'}`}>
                {telemetryA.tokPerSec ? `${telemetryA.tokPerSec} t/s` : '--'}
              </span>
              {isA_TPS_Better && (
                <span className="text-[10px] text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/40 font-sans font-semibold px-1 py-0.5 rounded flex items-center gap-0.5">
                  <Trophy size={9} strokeWidth={2.5} /> 更高
                </span>
              )}
            </div>
          </div>

          {/* Stream Output Text */}
          <div className="flex-1 bg-mac-canvas rounded-xl border border-mac-border dark:border-white/10 p-3.5 text-xs text-mac-textPrimary font-mono leading-relaxed overflow-y-auto whitespace-pre-wrap select-text">
            {telemetryA.content ? (
              telemetryA.content
            ) : isRunning ? (
              <span className="text-mac-textMuted flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-mac-accentBlue animate-ping" />
                正在等待 A 轨模型首字返回...
              </span>
            ) : (
              <span className="text-mac-textMuted">点击上方「并发双流测试」查看 A 轨基准输出</span>
            )}
          </div>

          {/* 底部操作闭环工具栏 A */}
          {Boolean(telemetryA.content) && (
            <div className="flex items-center justify-between gap-2 pt-2.5 mt-2 border-t border-mac-border/60 dark:border-white/10">
              <button
                type="button"
                onClick={() => handleCopy('A')}
                className="flex items-center gap-1 text-[11px] text-mac-textSecondary hover:text-mac-textPrimary px-2.5 py-1 rounded-lg border border-mac-border dark:border-white/10 bg-mac-surface dark:bg-white/[0.05] hover:bg-black/[0.03] dark:hover:bg-white/10 transition-all shadow-2xs cursor-pointer"
              >
                {copiedA ? <Check size={12} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={12} />}
                <span>{copiedA ? '已复制' : '复制输出'}</span>
              </button>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleBranch('A')}
                  className="flex items-center gap-1 text-[11px] text-mac-accentPurple hover:text-mac-accentPurple/80 px-2.5 py-1 rounded-lg border border-mac-accentPurple/20 bg-mac-accentPurple/[0.04] hover:bg-mac-accentPurple/[0.08] transition-all font-medium cursor-pointer"
                  title="以此输出派生新的独立提示词"
                >
                  <GitBranch size={12} />
                  <span>派生新提示词</span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePromote('A')}
                  className="flex items-center gap-1 text-[11px] text-white bg-mac-accentBlue hover:bg-mac-accentBlueHover px-2.5 py-1 rounded-lg shadow-2xs transition-all font-medium cursor-pointer"
                  title="将 A 轨结果写回主工作台并归档新版本"
                >
                  <ArrowUpRight size={12} />
                  <span>设为主基准</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Output B Pane */}
        <div className="bg-mac-surface backdrop-blur-xl border border-mac-accentGreen/30 rounded-2xl p-4 shadow-mac flex flex-col ring-1 ring-mac-accentGreen/20">
          {/* Telemetry Pro HUD B */}
          <div className="px-3 py-2 bg-mac-accentGreen/[0.06] rounded-xl border border-mac-accentGreen/30 mb-3 flex items-center justify-between text-xs font-mono tabular-nums shadow-2xs">
            <div className="flex items-center gap-1.5 text-mac-accentGreen font-medium">
              <Clock size={13} strokeWidth={1.75} />
              <span className="font-sans text-[11px]">首字:</span>
              <span className={`font-bold ${isB_TTFT_Better ? 'text-emerald-600 dark:text-emerald-400' : 'text-mac-textPrimary'}`}>
                {telemetryB.ttftMs ? `${telemetryB.ttftMs}ms` : '--'}
              </span>
              {isB_TTFT_Better && (
                <span className="text-[10px] text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/40 font-sans font-semibold px-1 py-0.5 rounded flex items-center gap-0.5">
                  <Trophy size={9} strokeWidth={2.5} /> 更快
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-mac-textGreen font-medium">
              <Activity size={13} strokeWidth={1.75} />
              <span className="font-sans text-[11px]">耗时:</span>
              <span className="font-bold text-mac-textPrimary">
                {telemetryB.totalMs ? `${(telemetryB.totalMs / 1000).toFixed(2)}s` : '--'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-mac-accentGreen font-medium">
              <Gauge size={13} strokeWidth={1.75} />
              <span className="font-sans text-[11px]">速率:</span>
              <span className={`font-bold ${isB_TPS_Better ? 'text-emerald-600 dark:text-emerald-400' : 'text-mac-textPrimary'}`}>
                {telemetryB.tokPerSec ? `${telemetryB.tokPerSec} t/s` : '--'}
              </span>
              {isB_TPS_Better && (
                <span className="text-[10px] text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/40 font-sans font-semibold px-1 py-0.5 rounded flex items-center gap-0.5">
                  <Trophy size={9} strokeWidth={2.5} /> 更高
                </span>
              )}
            </div>
          </div>

          {/* Stream Output Text */}
          <div className="flex-1 bg-mac-canvas rounded-xl border border-mac-accentGreen/30 p-3.5 text-xs text-mac-textPrimary font-mono leading-relaxed overflow-y-auto whitespace-pre-wrap select-text">
            {telemetryB.content ? (
              telemetryB.content
            ) : isRunning ? (
              <span className="text-mac-accentGreen flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-mac-accentGreen animate-ping" />
                正在实时流式接收 B 轨优化提示词的高阶响应...
              </span>
            ) : (
              <span className="text-mac-textMuted">点击上方「并发双流测试」查看 B 轨优化输出</span>
            )}
          </div>

          {/* 底部操作闭环工具栏 B */}
          {Boolean(telemetryB.content) && (
            <div className="flex items-center justify-between gap-2 pt-2.5 mt-2 border-t border-mac-accentGreen/20">
              <button
                type="button"
                onClick={() => handleCopy('B')}
                className="flex items-center gap-1 text-[11px] text-mac-textSecondary hover:text-mac-textPrimary px-2.5 py-1 rounded-lg border border-mac-border dark:border-white/10 bg-mac-surface dark:bg-white/[0.05] hover:bg-black/[0.03] dark:hover:bg-white/10 transition-all shadow-2xs cursor-pointer"
              >
                {copiedB ? <Check size={12} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={12} />}
                <span>{copiedB ? '已复制' : '复制输出'}</span>
              </button>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleBranch('B')}
                  className="flex items-center gap-1 text-[11px] text-mac-accentPurple hover:text-mac-accentPurple/80 px-2.5 py-1 rounded-lg border border-mac-accentPurple/20 bg-mac-accentPurple/[0.04] hover:bg-mac-accentPurple/[0.08] transition-all font-medium cursor-pointer"
                  title="以此输出派生新的独立提示词"
                >
                  <GitBranch size={12} />
                  <span>派生新提示词</span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePromote('B')}
                  className="flex items-center gap-1 text-[11px] text-white bg-mac-accentGreen hover:bg-mac-accentGreen/90 px-2.5 py-1 rounded-lg shadow-2xs transition-all font-medium"
                  title="将 B 轨结果写回主工作台并归档新版本"
                >
                  <ArrowUpRight size={12} />
                  <span>设为主基准</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
