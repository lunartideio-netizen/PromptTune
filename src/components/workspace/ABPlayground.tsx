import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { 
  substituteVariables, 
  resolvePromptReferences, 
  streamChat, 
  ChatMessage 
} from '../../services/llmService';
import { StreamTelemetry } from '../../types';
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
  Trophy
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
    setActiveTab
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

  // Telemetry for A (original) and B (optimized)
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

  // 1. 优先解析跨提示词与技能 @ 引用 (Prompt & Skill Chaining: {{@名称}})
  const resolvedA = resolvePromptReferences(originalDraft || '', prompts, skills).resolvedText;
  const resolvedB = resolvePromptReferences(currentOptimized || originalDraft || '', prompts, skills).resolvedText;

  // 2. 代入动态变量测试值 (Variable Substitution)
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

    // Track A Stream
    streamChat(
      messagesA,
      apiConfig,
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
      apiConfig,
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
            className={`px-3 py-1.5 text-xs font-medium rounded-xl border transition-all flex items-center gap-1.5 ${
              showDiff
                ? 'bg-mac-accentBlue/10 border-mac-accentBlue/30 text-mac-accentBlue shadow-sm'
                : 'border-mac-border hover:bg-white text-mac-textSecondary'
            }`}
          >
            <Columns2 size={14} strokeWidth={1.75} />
            {showDiff ? '隐藏差异' : '高亮差异'}
          </button>

          {isRunning ? (
            <button
              onClick={handleStop}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded-xl shadow-sm transition-all flex items-center gap-1.5"
            >
              <Square size={13} strokeWidth={2} className="fill-current" />
              终止测试
            </button>
          ) : (
            <button
              onClick={handleRunDualStream}
              disabled={!substitutedA && !substitutedB}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-mac-accentGreen hover:bg-mac-accentGreen/90 disabled:opacity-50 rounded-xl shadow-sm transition-all flex items-center gap-1.5"
            >
              <Zap size={14} strokeWidth={2} />
              并发双流测试
            </button>
          )}
        </div>
      </div>

      {/* API Key Missing Inline Notice */}
      {apiKeyError && (
        <div className="bg-amber-50/90 border border-amber-200/90 rounded-2xl p-3 shadow-sm flex items-center justify-between text-xs text-amber-900 animate-fade-in">
          <div className="flex items-center gap-2">
            <Key size={15} strokeWidth={1.75} className="text-amber-600 flex-shrink-0" />
            <span>未配置 API Key，请先完成配置或使用本地 Ollama。</span>
          </div>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="px-3 py-1.5 bg-amber-600 text-white rounded-xl font-semibold hover:bg-amber-700 transition-colors text-xs flex-shrink-0 flex items-center gap-1 shadow-sm"
          >
            <Settings size={14} strokeWidth={1.75} />
            配置密钥
          </button>
        </div>
      )}

      {/* 2. In-Place Variable Assignment Bar (if variables exist) */}
      {variables.length > 0 && (
        <div className="bg-mac-surface backdrop-blur-xl border border-mac-border rounded-2xl p-3.5 shadow-mac space-y-2">
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
              className="text-[11px] text-mac-accentPurple hover:underline flex items-center gap-1 font-medium"
            >
              <span>完整变量表</span>
              <ArrowRight size={11} strokeWidth={2} />
            </button>
          </div>

          <div className="flex items-center gap-2.5 overflow-x-auto pb-1 pt-0.5 scrollbar-thin">
            {variables.map((v) => (
              <div
                key={v.name}
                className="flex items-center gap-2 bg-white/90 border border-mac-border rounded-xl px-2.5 py-1.5 shadow-xs flex-shrink-0"
              >
                <span className="font-mono text-xs font-semibold text-mac-accentPurple bg-mac-accentPurple/10 px-1.5 py-0.5 rounded-lg">
                  {`{{${v.name}}}`}
                </span>
                <input
                  type="text"
                  value={v.currentValue || ''}
                  onChange={(e) => handleVariableChange(v.name, e.target.value)}
                  placeholder={v.defaultValue || '输入测试值...'}
                  className="w-36 sm:w-48 text-xs font-mono bg-mac-canvas px-2 py-1 rounded-lg border border-mac-border/80 focus:outline-none focus:ring-1 focus:ring-mac-accentPurple text-mac-textPrimary"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Side-by-Side Prompts Preview & Diff */}
      {showDiff ? (
        <DiffViewer
          oldText={substitutedA}
          newText={substitutedB}
          oldTitle="A 轨：原始草稿 (Baseline)"
          newTitle={`B 轨：优化提示词 (${versionLabel})`}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Track A: Baseline Prompt */}
          <div className="p-3.5 bg-mac-canvasAlt/50 rounded-2xl border border-mac-border flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-mac-textSecondary flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-mac-textSecondary" />
                A 轨：原始草稿 (Baseline)
              </span>
              <span className="text-[10px] font-mono text-mac-textMuted">
                ~{Math.ceil(substitutedA.length / 3)} tokens
              </span>
            </div>
            <div className="flex-1 bg-white/70 p-3 rounded-xl border border-mac-border/60 text-xs font-mono text-mac-textSecondary max-h-36 overflow-y-auto whitespace-pre-wrap select-text">
              {substitutedA || '（无原始草稿内容）'}
            </div>
          </div>

          {/* Track B: Tuned Prompt */}
          <div className="p-3.5 bg-mac-accentGreen/[0.03] rounded-2xl border border-mac-accentGreen/20 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-mac-accentGreen flex items-center gap-1.5">
                <Sparkles size={13} strokeWidth={1.75} className="text-mac-accentGreen" />
                B 轨：优化提示词 ({versionLabel})
              </span>
              <span className="text-[10px] font-mono text-mac-accentGreen font-semibold">
                ~{Math.ceil(substitutedB.length / 3)} tokens
              </span>
            </div>
            <div className="flex-1 bg-white/90 p-3 rounded-xl border border-mac-accentGreen/30 text-xs font-mono text-mac-textPrimary max-h-36 overflow-y-auto whitespace-pre-wrap select-text">
              {substitutedB || '（无优化提示词内容）'}
            </div>
          </div>
        </div>
      )}

      {/* 4. Real-Time Benchmark Execution Output Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-[380px]">
        {/* Output A Pane */}
        <div className="bg-mac-surface backdrop-blur-xl border border-mac-border rounded-2xl p-4 shadow-mac flex flex-col">
          {/* Telemetry Pro HUD A */}
          <div className="px-3 py-2 bg-white/90 rounded-xl border border-mac-border mb-3 flex items-center justify-between text-xs font-mono tabular-nums shadow-2xs">
            <div className="flex items-center gap-1.5 text-mac-textSecondary">
              <Clock size={13} strokeWidth={1.75} className="text-mac-accentBlue" />
              <span className="font-sans text-[11px]">首字:</span>
              <span className={`font-bold ${isA_TTFT_Better ? 'text-emerald-600' : 'text-mac-textPrimary'}`}>
                {telemetryA.ttftMs ? `${telemetryA.ttftMs}ms` : '--'}
              </span>
              {isA_TTFT_Better && (
                <span className="text-[10px] text-emerald-700 bg-emerald-100 font-sans font-semibold px-1 py-0.5 rounded flex items-center gap-0.5">
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
              <span className={`font-bold ${isA_TPS_Better ? 'text-emerald-600' : 'text-mac-textPrimary'}`}>
                {telemetryA.tokPerSec ? `${telemetryA.tokPerSec} t/s` : '--'}
              </span>
              {isA_TPS_Better && (
                <span className="text-[10px] text-emerald-700 bg-emerald-100 font-sans font-semibold px-1 py-0.5 rounded flex items-center gap-0.5">
                  <Trophy size={9} strokeWidth={2.5} /> 更高
                </span>
              )}
            </div>
          </div>

          {/* Stream Output Text */}
          <div className="flex-1 bg-white/90 rounded-xl border border-mac-border p-3.5 text-xs text-mac-textPrimary font-mono leading-relaxed overflow-y-auto whitespace-pre-wrap select-text">
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
        </div>

        {/* Output B Pane */}
        <div className="bg-mac-surface backdrop-blur-xl border border-mac-accentGreen/30 rounded-2xl p-4 shadow-mac flex flex-col ring-1 ring-mac-accentGreen/20">
          {/* Telemetry Pro HUD B */}
          <div className="px-3 py-2 bg-mac-accentGreen/[0.06] rounded-xl border border-mac-accentGreen/30 mb-3 flex items-center justify-between text-xs font-mono tabular-nums shadow-2xs">
            <div className="flex items-center gap-1.5 text-mac-accentGreen font-medium">
              <Clock size={13} strokeWidth={1.75} />
              <span className="font-sans text-[11px]">首字:</span>
              <span className={`font-bold ${isB_TTFT_Better ? 'text-emerald-600' : 'text-mac-textPrimary'}`}>
                {telemetryB.ttftMs ? `${telemetryB.ttftMs}ms` : '--'}
              </span>
              {isB_TTFT_Better && (
                <span className="text-[10px] text-emerald-700 bg-emerald-100 font-sans font-semibold px-1 py-0.5 rounded flex items-center gap-0.5">
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
              <span className={`font-bold ${isB_TPS_Better ? 'text-emerald-600' : 'text-mac-textPrimary'}`}>
                {telemetryB.tokPerSec ? `${telemetryB.tokPerSec} t/s` : '--'}
              </span>
              {isB_TPS_Better && (
                <span className="text-[10px] text-emerald-700 bg-emerald-100 font-sans font-semibold px-1 py-0.5 rounded flex items-center gap-0.5">
                  <Trophy size={9} strokeWidth={2.5} /> 更高
                </span>
              )}
            </div>
          </div>

          {/* Stream Output Text */}
          <div className="flex-1 bg-white/95 rounded-xl border border-mac-accentGreen/30 p-3.5 text-xs text-mac-textPrimary font-mono leading-relaxed overflow-y-auto whitespace-pre-wrap select-text">
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
        </div>
      </div>
    </div>
  );
};
