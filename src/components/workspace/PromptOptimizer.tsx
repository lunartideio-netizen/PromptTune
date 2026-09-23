import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { FrameworkType, PromptItem } from '../../types';
import { streamChat, ChatMessage, MessageContentPart, syncVariables, resolvePromptReferences, extractSmartTitleFromDraft } from '../../services/llmService';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { fileToDataUrl, extractImagesFromPaste, extractImagesFromDrop } from '../../utils/imageUtils';
import { MentionAutocomplete } from '../common/MentionAutocomplete';
import { DiffViewer } from '../common/DiffViewer';
import { SelectionVariablePopover } from '../common/SelectionVariablePopover';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { 
  Sparkles, 
  Send, 
  Copy, 
  Check, 
  ArrowRight, 
  Loader2, 
  Clock,
  Key,
  FileText,
  Zap,
  Lightbulb,
  ShieldCheck,
  Code2,
  Brain,
  Pencil,
  RotateCcw,
  Mic,
  Image as ImageIcon,
  X as XIcon,
  Plus as PlusIcon,
  Columns2
} from 'lucide-react';
import confetti from 'canvas-confetti';

const FRAMEWORKS: { id: FrameworkType; name: string; desc: string; badge: string }[] = [
  { id: 'CO-STAR', name: 'CO-STAR', desc: 'Context, Objective, Style, Tone, Audience, Response', badge: '全面结构化' },
  { id: 'CRISPE', name: 'CRISPE', desc: 'Capacity, Role, Insight, Statement, Personality, Experiment', badge: '商业分析' },
  { id: 'FEW_SHOT_COT', name: 'Few-Shot & CoT', desc: '示例引导 + 思维链深度推理', badge: '逻辑严谨' },
  { id: 'ROLE_TASK_FORMAT', name: 'Role-Task-Format', desc: '轻量高效生产三元组', badge: '紧凑高效' },
  { id: 'STRICT_JSON', name: 'Strict JSON', desc: '强类型 Schema 约束与纯代码提取', badge: '代码/接口' },
  { id: 'FREEFORM', name: '自由深度精修', desc: '保持原有语序与风格，极致消除歧义与冗余', badge: '通用润色' },
];

const QUICK_SUGGESTIONS = [
  { label: '精简 40%', icon: Zap, prompt: '精简 40%，仅保留核心指令与边界约束' },
  { label: '补充 2 个示例', icon: Lightbulb, prompt: '补充 2 个正负对比的 Few-Shot 示例' },
  { label: '强化负向约束', icon: ShieldCheck, prompt: '强化负向约束 (Negative Prompts)，防幻觉' },
  { label: '严格 JSON 规范', icon: Code2, prompt: '要求输出符合严格 JSON 格式' },
  { label: '增加思考链', icon: Brain, prompt: '增加思考链标签 <thought>，要求先分析再输出' },
];

export const PromptOptimizer: React.FC = () => {
  const { 
    activePromptId, 
    prompts, 
    skills,
    apiConfig, 
    updatePrompt, 
    addPromptVersion, 
    addOptimizationTurn,
    getInheritedContextForPrompt,
    setActiveTab,
    setIsSettingsOpen,
  } = useAppStore();

  const draftTextareaRef = useRef<HTMLTextAreaElement>(null);

  const currentPrompt = prompts.find((p) => p.id === activePromptId);

  const [draft, setDraft] = useState(currentPrompt?.originalDraft || '');
  const [selectedFramework, setSelectedFramework] = useState<FrameworkType>(currentPrompt?.framework || 'CO-STAR');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [liveStreamingText, setLiveStreamingText] = useState('');
  const [feedbackInput, setFeedbackInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [apiKeyError, setApiKeyError] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftDebounceTimerRef = useRef<any>(null);

  // 语音输入 hooks
  const draftVoice = useVoiceInput();
  const feedbackVoice = useVoiceInput();

  const toggleDraftVoice = () => {
    draftVoice.toggleListening((finalChunk) => {
      setDraft((prev) => {
        const next = prev ? `${prev} ${finalChunk}` : finalChunk;
        handleDraftChange(next);
        return next;
      });
    });
  };

  const toggleFeedbackVoice = () => {
    feedbackVoice.toggleListening((finalChunk) => {
      setFeedbackInput((prev) => (prev ? `${prev} ${finalChunk}` : finalChunk));
    });
  };

  const handleImageFiles = async (files: File[]) => {
    const validFiles = files.filter((f) => f.type.startsWith('image/'));
    if (validFiles.length === 0) return;
    const remainingSlots = 3 - referenceImages.length;
    if (remainingSlots <= 0) {
      alert('最多只支持上传 3 张视觉参考图');
      return;
    }
    const toProcess = validFiles.slice(0, remainingSlots);
    try {
      const dataUrls = await Promise.all(toProcess.map((f) => fileToDataUrl(f)));
      setReferenceImages((prev) => [...prev, ...dataUrls].slice(0, 3));
    } catch (err: any) {
      console.error('处理视觉参考图失败:', err);
    }
  };

  const handleRemoveImage = (index: number) => {
    setReferenceImages((prev) => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    if (currentPrompt) {
      setDraft(currentPrompt.originalDraft || '');
      setSelectedFramework(currentPrompt.framework || 'CO-STAR');
      setLiveStreamingText('');
      setApiKeyError(false);
      setIsEditing(false);
      setEditText('');
      setReferenceImages([]);
    }
    return () => {
      abortControllerRef.current?.abort();
      if (draftDebounceTimerRef.current) {
        clearTimeout(draftDebounceTimerRef.current);
      }
    };
  }, [currentPrompt?.id, currentPrompt?.originalDraft, currentPrompt?.framework]);

  if (!currentPrompt) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-mac-textMuted">
        <Sparkles size={36} strokeWidth={1.5} className="text-mac-textMuted/40 mb-3" />
        <p className="text-xs">请在左侧选择一个提示词，或点击顶部新建按钮开始。</p>
      </div>
    );
  }

  const { combinedSystemContext, combinedDomainRules } = getInheritedContextForPrompt(currentPrompt.id);

  const isOllama = apiConfig.provider === 'ollama';
  const isLocal = isOllama || apiConfig.baseUrl.includes('localhost') || apiConfig.baseUrl.includes('127.0.0.1');
  const hasKey = Boolean(apiConfig.apiKey?.trim()) || isLocal;

  const handleDraftChange = (newVal: string) => {
    setDraft(newVal);
    if (draftDebounceTimerRef.current) {
      clearTimeout(draftDebounceTimerRef.current);
    }
    draftDebounceTimerRef.current = setTimeout(() => {
      const nextVars = syncVariables(currentPrompt.variables || [], newVal + '\n' + (currentPrompt.currentOptimized || ''));
      updatePrompt(currentPrompt.id, {
        originalDraft: newVal,
        variables: nextVars,
      });
    }, 300);
  };

  const handleStartEdit = () => {
    if (isOptimizing) return;
    const baseText = currentPrompt.currentOptimized || liveStreamingText || draft;
    setEditText(baseText);
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    setIsEditing(false);
    const trimmed = editText.trim();
    if (!trimmed || trimmed === currentPrompt.currentOptimized) {
      return;
    }

    const newVersionNumber = (currentPrompt.versions.length || 0) + 1;
    await addPromptVersion(currentPrompt.id, {
      version: newVersionNumber,
      promptText: trimmed,
      instruction: '手动微调修改',
      framework: selectedFramework,
      timestamp: Date.now(),
      tokenCount: Math.ceil(trimmed.length / 3),
      qualityScore: { clarity: 98, completeness: 95, structure: 98 },
    });

    const nextVars = syncVariables(currentPrompt.variables || [], draft + '\n' + trimmed);
    updatePrompt(currentPrompt.id, {
      currentOptimized: trimmed,
      variables: nextVars,
    });
  };

  // 核心优化函数：无论何时均可触发全新结构化重构
  const handleStartOptimize = async () => {
    if (!draft.trim()) return;
    setApiKeyError(false);

    if (!hasKey) {
      setApiKeyError(true);
      return;
    }

    setIsOptimizing(true);
    setLiveStreamingText('');
    setIsEditing(false);

    const systemPromptParts = [
      `你是一名世界顶尖的提示词工程架构师。你的任务是将用户的原始草稿重构成结构清晰、表达精准、边界严格的工业级专业提示词。`,
      `目标工程重构框架：${selectedFramework}。`,
    ];

    if (combinedSystemContext) {
      systemPromptParts.push(`\n【上级目录继承的全局背景与角色设定】：\n${combinedSystemContext}`);
    }
    if (combinedDomainRules) {
      systemPromptParts.push(`\n【上级目录继承的行业规则与边界约束】：\n${combinedDomainRules}`);
    }

    if (referenceImages.length > 0) {
      systemPromptParts.push(
        `\n【多模态视觉专家模式】：用户已提供参考图片（UI界面/设计稿/视觉意向）。请先严谨解构图片中的视觉层级、色彩搭配 (Hex/RGB)、排版间距、交互组件、字体层级与质感细节，并将提取的视觉特征、设计语义转化为结构化、高保真还原的精确提示词指引。`
      );
    }

    systemPromptParts.push(`\n输出规范：直接输出优化后的完整提示词正文，不要输出客套开场白与结尾寒暄。务必保留并规范必要的 {{variable_name}} 变量占位符。`);

    const resolvedDraft = resolvePromptReferences(draft, prompts, skills).resolvedText;
    let userContent: string | MessageContentPart[] = `请对以下原始提示词草稿进行重构优化：\n\n${resolvedDraft}`;
    if (referenceImages.length > 0) {
      userContent = [
        {
          type: 'text',
          text: `请结合附带的 ${referenceImages.length} 张视觉参考图（解构其设计规范、布局层级与色彩），对以下原始提示词草稿进行结构化重构优化：\n\n${resolvedDraft}`,
        },
        ...referenceImages.map((img) => ({
          type: 'image_url' as const,
          image_url: { url: img },
        })),
      ];
    }

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: systemPromptParts.join('\n'),
      },
      {
        role: 'user',
        content: userContent,
      },
    ];

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    // 若当前为默认标题，提前提取智能标题并更新，使侧边栏立即响应
    const isDefaultTitle = 
      !currentPrompt.title || 
      currentPrompt.title === '未命名提示词' ||
      currentPrompt.title === '新建提示词' || 
      currentPrompt.title.startsWith('新建');
    if (isDefaultTitle && draft.trim()) {
      const smartTitle = extractSmartTitleFromDraft(draft);
      updatePrompt(currentPrompt.id, { title: smartTitle });
    }

    try {
      await streamChat(
        messages,
        apiConfig,
        {
          onChunk: (_chunk, acc) => {
            setLiveStreamingText(acc);
          },
          onDone: async (telemetry) => {
            if (!telemetry.isDone || telemetry.error) return;
            setIsOptimizing(false);

            confetti({
              particleCount: 45,
              spread: 65,
              origin: { y: 0.65, x: 0.65 },
              colors: ['#0A84FF', '#34C759', '#FF9F0A', '#AF52DE'],
            });

            const newVersionNumber = (currentPrompt.versions.length || 0) + 1;
            await addPromptVersion(currentPrompt.id, {
              version: newVersionNumber,
              promptText: telemetry.content,
              instruction: `初始框架优化 (${selectedFramework})${referenceImages.length > 0 ? ' [含视觉参考图]' : ''}`,
              framework: selectedFramework,
              timestamp: Date.now(),
              tokenCount: telemetry.tokenCount,
              qualityScore: { clarity: 95, completeness: 92, structure: 97 },
            });

            const detectedVars = syncVariables(currentPrompt.variables || [], draft + '\n' + telemetry.content);

            // 检查当前提示词是否仍为默认的“新建提示词”或“未命名提示词”
            const isStillDefault = 
              !currentPrompt.title || 
              currentPrompt.title === '未命名提示词' ||
              currentPrompt.title === '新建提示词' || 
              currentPrompt.title.startsWith('新建');
            const updates: Partial<PromptItem> = {
              currentOptimized: telemetry.content,
              variables: detectedVars,
            };
            // 若为默认标题，自动根据用户输入的问题草稿重命名！
            if (isStillDefault && draft.trim()) {
              const autoTitle = extractSmartTitleFromDraft(draft);
              updates.title = autoTitle;
            }
            await updatePrompt(currentPrompt.id, updates);

            setLiveStreamingText('');
          },
          onError: (err) => {
            setIsOptimizing(false);
            if (err === 'API_KEY_REQUIRED') {
              setApiKeyError(true);
              useAppStore.getState().showToast('请先配置 API Key 或选择本地运行模式', 'error');
            } else {
              useAppStore.getState().showToast(err || '生成失败，请检查模型与服务配置', 'error');
            }
          },
        },
        abortControllerRef.current.signal
      );
    } catch (err: any) {
      setIsOptimizing(false);
      useAppStore.getState().showToast('优化请求失败: ' + (err?.message || '未知错误'), 'error');
    }
  };

  // 多轮微调追问
  const handleFollowupIterate = async (customInstruction?: string) => {
    const instruction = customInstruction || feedbackInput.trim();
    if (!instruction) return;
    setApiKeyError(false);

    if (!hasKey) {
      setApiKeyError(true);
      return;
    }

    const currentBasePrompt = currentPrompt.currentOptimized || draft;
    if (!currentBasePrompt) return;

    setIsOptimizing(true);
    setLiveStreamingText('');
    setFeedbackInput('');
    setIsEditing(false);

    const systemPromptParts = [
      `你是一名世界顶尖的提示词工程架构师。用户的提示词已经有了前序优化版本。`,
      `你的任务是根据用户最新的【微调指令】，针对现有的提示词进行定向重构与迭代打磨。`,
      `目标工程重构框架：${selectedFramework}。`,
    ];

    if (combinedSystemContext) {
      systemPromptParts.push(`\n【上级目录继承的全局背景与角色设定】：\n${combinedSystemContext}`);
    }
    if (combinedDomainRules) {
      systemPromptParts.push(`\n【上级目录继承的行业规则与边界约束】：\n${combinedDomainRules}`);
    }

    if (referenceImages.length > 0) {
      systemPromptParts.push(
        `\n【多模态视觉专家模式】：用户已提供参考图片（UI界面/设计稿/视觉意向）。请参照视觉参考图的设计系统、组件和色彩规范，确保微调迭代后的提示词保持高度保真。`
      );
    }

    systemPromptParts.push(`\n输出规范：直接输出微调修改后的完整提示词正文，不要输出多余解释或前后缀客套。保留必要的 {{variable}} 变量占位符。`);

    const resolvedBasePrompt = resolvePromptReferences(currentBasePrompt, prompts, skills).resolvedText;
    let userContent: string | MessageContentPart[] = `【当前提示词正文】：\n${resolvedBasePrompt}\n\n【用户提出的微调迭代要求】：\n${instruction}\n\n请输出微调后的完整提示词：`;
    if (referenceImages.length > 0) {
      userContent = [
        {
          type: 'text',
          text: `【当前提示词正文】：\n${resolvedBasePrompt}\n\n【用户提出的微调迭代要求】：\n${instruction}\n\n（附带 ${referenceImages.length} 张视觉参考图，请保持视觉特征统一）\n\n请输出微调后的完整提示词：`,
        },
        ...referenceImages.map((img) => ({
          type: 'image_url' as const,
          image_url: { url: img },
        })),
      ];
    }

    // 携带前序多轮追问历史 (最多保留最近 6 轮交互)，确保模型具备连续对话记忆
    const historyTurnMessages: ChatMessage[] = (currentPrompt.turns || []).slice(-6).map((t) => ({
      role: t.role,
      content: t.refinedPrompt || t.content,
    }));

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: systemPromptParts.join('\n'),
      },
      ...historyTurnMessages,
      {
        role: 'user',
        content: userContent,
      },
    ];

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    try {
      await streamChat(
        messages,
        apiConfig,
        {
          onChunk: (_chunk, acc) => {
            setLiveStreamingText(acc);
          },
          onDone: async (telemetry) => {
            if (!telemetry.isDone || telemetry.error) return;
            setIsOptimizing(false);

            confetti({
              particleCount: 35,
              spread: 55,
              origin: { y: 0.65, x: 0.7 },
              colors: ['#0A84FF', '#34C759', '#FF9F0A'],
            });

            const newVersionNumber = (currentPrompt.versions.length || 0) + 1;
            await addPromptVersion(currentPrompt.id, {
              version: newVersionNumber,
              promptText: telemetry.content,
              instruction,
              framework: selectedFramework,
              timestamp: Date.now(),
              tokenCount: telemetry.tokenCount,
              qualityScore: { clarity: 97, completeness: 95, structure: 98 },
            });

            await addOptimizationTurn(currentPrompt.id, {
              id: `turn-${Date.now()}-u`,
              role: 'user',
              content: instruction,
              timestamp: Date.now() - 500,
            });

            await addOptimizationTurn(currentPrompt.id, {
              id: `turn-${Date.now()}-a`,
              role: 'assistant',
              content: telemetry.content,
              refinedPrompt: telemetry.content,
              timestamp: Date.now(),
              tokenCount: telemetry.tokenCount,
            });

            const detectedVars = syncVariables(currentPrompt.variables || [], draft + '\n' + telemetry.content);
            updatePrompt(currentPrompt.id, {
              currentOptimized: telemetry.content,
              variables: detectedVars,
            });

            setLiveStreamingText('');
          },
          onError: (err) => {
            setIsOptimizing(false);
            if (err === 'API_KEY_REQUIRED') {
              setApiKeyError(true);
              useAppStore.getState().showToast('请先配置 API Key 或选择本地运行模式', 'error');
            } else {
              useAppStore.getState().showToast(err || '微调失败，请检查服务连通性', 'error');
            }
          },
        },
        abortControllerRef.current.signal
      );
    } catch (err: any) {
      setIsOptimizing(false);
      useAppStore.getState().showToast('微调请求失败: ' + (err?.message || '未知错误'), 'error');
    }
  };

  const displayedOptimized = liveStreamingText || currentPrompt.currentOptimized;

  const [showDiff, setShowDiff] = useState(false);

  const handleCopyCurrent = () => {
    if (!displayedOptimized) return;
    navigator.clipboard.writeText(displayedOptimized);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // 划词快速转变量处理
  const handleAddVariableFromSelection = (name: string, defaultValue: string) => {
    const existing = currentPrompt.variables || [];
    if (!existing.some((v) => v.name === name)) {
      const next = [...existing, { name, defaultValue, currentValue: defaultValue }];
      updatePrompt(currentPrompt.id, { variables: next });
    }
  };

  // 全局 macOS 快捷键体系 (Cmd+Enter 优化, Cmd+Shift+C 复制, Cmd+D 切换 Diff)
  useKeyboardShortcuts({
    onOptimize: () => {
      if (isOptimizing) {
        abortControllerRef.current?.abort();
        setIsOptimizing(false);
      } else if (draft.trim()) {
        handleStartOptimize();
      }
    },
    onCopy: handleCopyCurrent,
    onToggleDiff: () => {
      if (displayedOptimized) {
        setShowDiff((prev) => !prev);
      }
    },
  });

  return (
    <div className="h-full flex flex-col overflow-hidden p-4 md:p-5 max-w-7xl mx-auto w-full gap-3 select-none">
      {/* API Key Missing Inline Notice */}
      {apiKeyError && (
        <div className="flex-shrink-0 bg-amber-50/90 border border-amber-200/90 rounded-xl p-2.5 shadow-sm flex items-center justify-between text-xs text-amber-900 animate-fade-in">
          <div className="flex items-center gap-2">
            <Key size={14} strokeWidth={1.75} className="text-amber-600 flex-shrink-0" />
            <span>未配置 API Key，请先完成配置或使用本地 OpenCodeX / Ollama。</span>
          </div>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="px-2.5 py-1 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 transition-colors text-xs flex-shrink-0 flex items-center gap-1 shadow-sm"
          >
            配置密钥
          </button>
        </div>
      )}

      {/* 1. 精简极窄单行架构选择栏 (高度 ~36px) */}
      <div className="flex-shrink-0 flex items-center justify-between gap-2 px-3 py-1.5 bg-mac-surface backdrop-blur-xl border border-mac-border rounded-xl shadow-xs overflow-hidden">
        <div className="flex items-center gap-1.5 text-xs font-bold text-mac-textPrimary flex-shrink-0">
          <Sparkles size={13} strokeWidth={2} className="text-mac-accentBlue" />
          <span>优化架构</span>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none flex-1 justify-end">
          {FRAMEWORKS.map((fw) => {
            const isSelected = selectedFramework === fw.id;
            return (
              <button
                key={fw.id}
                onClick={() => {
                  setSelectedFramework(fw.id);
                  updatePrompt(currentPrompt.id, { framework: fw.id });
                }}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all flex items-center gap-1.5 flex-shrink-0 ${
                  isSelected
                    ? 'bg-mac-accentBlue text-white shadow-xs'
                    : 'text-mac-textSecondary hover:text-mac-textPrimary hover:bg-black/5'
                }`}
                title={fw.desc}
              >
                <span>{fw.name}</span>
                <span className={`text-[10px] px-1 py-0.2 rounded font-normal ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-black/5 text-mac-textMuted'
                }`}>
                  {fw.badge}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. 左右双栏：撑满剩余高度，内部各自独立滚动 (min-h-0 + flex-1) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0 overflow-hidden">
        {/* 左栏：原始草稿需求 */}
        <div className="bg-mac-surface backdrop-blur-xl border border-mac-border rounded-2xl p-4 shadow-mac flex flex-col min-h-0 overflow-hidden">
          {/* 左栏 Header */}
          <div className="flex-shrink-0 flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-mac-textPrimary flex items-center gap-1.5">
              <FileText size={14} strokeWidth={1.75} className="text-mac-textSecondary" />
              <span>原始草稿需求</span>
            </span>
            <div className="flex items-center gap-2">
              {/* 隐藏的图片文件选择器 */}
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) {
                    handleImageFiles(Array.from(e.target.files));
                    e.target.value = '';
                  }
                }}
              />

              {/* 上传参考图 按钮 */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={referenceImages.length >= 3}
                className={`px-2 py-1 text-[11px] rounded-lg border transition-all flex items-center gap-1 font-medium ${
                  referenceImages.length > 0
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-2xs'
                    : 'bg-mac-canvas border-mac-border text-mac-textSecondary hover:text-mac-textPrimary hover:bg-white'
                } disabled:opacity-40 cursor-pointer`}
                title="支持上传、拖拽或 Cmd+V 粘贴 1~3 张参考图"
              >
                <ImageIcon size={13} strokeWidth={1.75} className={referenceImages.length > 0 ? 'text-indigo-600' : ''} />
                <span>上传参考图{referenceImages.length > 0 ? ` (${referenceImages.length}/3)` : ''}</span>
              </button>

              <span className="text-[11px] font-mono text-mac-textSecondary">
                {draft.length} 字符
              </span>
            </div>
          </div>

          {/* 左栏输入区：支持键盘 Cmd+V 粘贴截图与外部拖拽文件 */}
          <div 
            className={`flex-1 relative min-h-0 flex flex-col rounded-xl transition-all ${
              isDraggingOver ? 'ring-2 ring-indigo-500 bg-indigo-50/20' : ''
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingOver(true);
            }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingOver(false);
              const files = extractImagesFromDrop(e);
              if (files.length > 0) handleImageFiles(files);
            }}
          >
            <textarea
              ref={draftTextareaRef}
              value={draft}
              onChange={(e) => handleDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.altKey && e.code === 'Space') {
                  e.preventDefault();
                  toggleDraftVoice();
                }
              }}
              onPaste={(e) => {
                const imgFiles = extractImagesFromPaste(e);
                if (imgFiles.length > 0) {
                  e.preventDefault();
                  handleImageFiles(imgFiles);
                }
              }}
              placeholder="在此输入您的初始草稿或模糊想法，支持 @ 唤起已装技能与提示词，支持 {{variable}} 变量；支持拖拽或 Cmd+V 粘贴视觉参考图 (按 Option+Space 语音听写)..."
              className="flex-1 w-full bg-mac-canvas rounded-xl border border-mac-border p-3.5 pb-10 text-xs text-mac-textPrimary font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-mac-accentBlue/30 focus:border-mac-accentBlue resize-none overflow-y-auto min-h-0 select-text"
            />

            {/* @ 智能联想唤起浮层 */}
            <MentionAutocomplete
              textareaRef={draftTextareaRef}
              value={draft}
              onSelect={(val) => {
                setDraft(val);
                handleDraftChange(val);
              }}
              currentPromptId={activePromptId}
            />

            {/* 划词设为变量悬浮气泡 */}
            <SelectionVariablePopover
              textareaRef={draftTextareaRef}
              value={draft}
              onChange={(newVal) => {
                setDraft(newVal);
                handleDraftChange(newVal);
              }}
              onAddVariable={handleAddVariableFromSelection}
            />

            {/* 拖拽释放提示蒙层 */}
            {isDraggingOver && (
              <div className="absolute inset-0 bg-indigo-500/10 backdrop-blur-[1px] border-2 border-dashed border-indigo-500 rounded-xl flex items-center justify-center pointer-events-none z-10">
                <span className="text-xs font-bold text-indigo-700 bg-white/95 px-3 py-1.5 rounded-lg shadow-md flex items-center gap-1.5">
                  <ImageIcon size={14} strokeWidth={2} />
                  <span>释放鼠标以添加参考图 (最多 3 张)</span>
                </span>
              </div>
            )}

            {/* 语音听写正在识别预览徽标 (浅紫斜体即时流) */}
            {draftVoice.isListening && draftVoice.interimTranscript && (
              <div className="absolute left-3 bottom-2.5 z-10 max-w-[calc(100%-110px)] flex items-center gap-1.5 px-2.5 py-1 bg-purple-50/95 border border-purple-200/90 text-purple-900 rounded-lg shadow-xs text-xs backdrop-blur-sm animate-fade-in pointer-events-none select-none">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-ping shrink-0" />
                <span className="text-[10px] font-bold text-purple-700 shrink-0">正在识别:</span>
                <span className="text-[11px] italic truncate text-purple-950 font-medium">
                  "{draftVoice.interimTranscript}"
                </span>
              </div>
            )}

            {/* 语音听写悬浮按钮 (输入框右下角带实时音浪) */}
            <div className="absolute right-2.5 bottom-2.5 z-10 flex items-center">
              {draftVoice.isListening && (
                <span
                  className="absolute inset-0 rounded-xl bg-purple-500/25 pointer-events-none transition-transform duration-100 ease-out"
                  style={{
                    transform: `scale(${1 + (draftVoice.volume / 100) * 0.45})`,
                    opacity: Math.max(0.35, draftVoice.volume / 100),
                  }}
                />
              )}
              <button
                type="button"
                onClick={toggleDraftVoice}
                title={draftVoice.isListening ? `正在听写 (音量: ${draftVoice.volume}% · 点击停止)` : '点击开启中文语音听写 (Option + Space)'}
                className={`relative px-2.5 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 text-xs cursor-pointer ${
                  draftVoice.isListening
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white border-purple-500 shadow-md'
                    : 'bg-white/90 text-[#6E6B65] hover:text-[#2C2A29] hover:bg-white border-[#E5E2D9] shadow-xs'
                }`}
              >
                <Mic size={14} strokeWidth={draftVoice.isListening ? 2 : 1.75} className={draftVoice.isListening ? 'text-white' : ''} />
                {draftVoice.isListening ? (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-medium pr-0.5">聆听中</span>
                    {/* 动态 3 柱音浪条 */}
                    <div className="flex items-center gap-0.5 h-3">
                      <span
                        className="w-0.5 bg-white/90 rounded-full transition-all duration-75"
                        style={{ height: `${Math.max(3, Math.min(11, 3 + (draftVoice.volume * 0.08)))}px` }}
                      />
                      <span
                        className="w-0.5 bg-white rounded-full transition-all duration-75"
                        style={{ height: `${Math.max(4, Math.min(14, 4 + (draftVoice.volume * 0.12)))}px` }}
                      />
                      <span
                        className="w-0.5 bg-white/90 rounded-full transition-all duration-75"
                        style={{ height: `${Math.max(3, Math.min(10, 3 + (draftVoice.volume * 0.07)))}px` }}
                      />
                    </div>
                  </div>
                ) : (
                  <span className="text-[10px] text-[#6E6B65] font-mono hidden sm:inline">⌥Space</span>
                )}
              </button>
            </div>
          </div>

          {/* 视觉参考图缩略图栏 */}
          {referenceImages.length > 0 && (
            <div className="flex-shrink-0 mt-2 p-2 bg-mac-canvasAlt/40 rounded-xl border border-mac-border/60 flex items-center gap-2 overflow-x-auto">
              <span className="text-[10px] text-mac-textMuted font-medium flex-shrink-0 px-1">
                参考图:
              </span>
              {referenceImages.map((imgUrl, idx) => (
                <div key={idx} className="relative group w-12 h-12 rounded-lg overflow-hidden border border-mac-border/80 bg-black/5 flex-shrink-0 shadow-2xs">
                  <img src={imgUrl} alt={`参考图 ${idx + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(idx)}
                    className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/70 hover:bg-rose-600 text-white rounded-full flex items-center justify-center opacity-80 group-hover:opacity-100 transition-all cursor-pointer shadow-xs"
                    title="移除图片"
                  >
                    <XIcon size={10} strokeWidth={2.5} />
                  </button>
                </div>
              ))}
              {referenceImages.length < 3 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-12 h-12 rounded-lg border border-dashed border-mac-border/80 hover:border-indigo-400 bg-white/50 hover:bg-white flex flex-col items-center justify-center text-mac-textMuted hover:text-indigo-600 transition-all flex-shrink-0 cursor-pointer"
                  title="继续添加图片"
                >
                  <PlusIcon size={14} strokeWidth={2} />
                  <span className="text-[9px] mt-0.5">+图</span>
                </button>
              )}
            </div>
          )}

          {/* 左栏 Footer：常驻突出【重新优化 / 开始结构化重塑】按钮 */}
          <div className="flex-shrink-0 mt-3 pt-2 border-t border-mac-border/60 flex items-center justify-between">
            <span className="text-[11px] text-mac-textSecondary">
              支持 <code className="bg-black/5 px-1 py-0.5 rounded text-mac-accentPurple font-mono">{'{{variable}}'}</code> 自动提取
            </span>

            <button
              onClick={handleStartOptimize}
              disabled={isOptimizing || !draft.trim()}
              className="px-4 py-2 text-xs font-bold text-white bg-mac-accentBlue hover:bg-mac-accentBlueHover disabled:opacity-50 rounded-xl shadow-sm transition-all flex items-center gap-1.5"
            >
              {isOptimizing ? (
                <>
                  <Loader2 size={14} strokeWidth={2} className="animate-spin" />
                  <span>智能重构中...</span>
                </>
              ) : currentPrompt.currentOptimized ? (
                <>
                  <RotateCcw size={14} strokeWidth={2} />
                  <span>重新优化 (全新重塑)</span>
                </>
              ) : (
                <>
                  <Sparkles size={14} strokeWidth={2} />
                  <span>开始结构化重塑</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 右栏：优化成果 (内部独立丝滑内滚) */}
        <div className="bg-mac-surface backdrop-blur-xl border border-mac-border rounded-2xl p-4 shadow-mac flex flex-col min-h-0 overflow-hidden">
          {/* 右栏 Header：标题、操作项与显眼的【重新生成】按钮 */}
          <div className="flex-shrink-0 flex items-center justify-between gap-2 mb-2 min-w-0">
            <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
              <span className="text-xs font-semibold text-mac-textPrimary flex items-center gap-1 shrink-0 whitespace-nowrap">
                <Sparkles size={14} strokeWidth={1.75} className="text-mac-accentBlue shrink-0" />
                <span>优化成果 (v{currentPrompt.versions.length || 1})</span>
              </span>
              {currentPrompt.versions.length > 0 && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-mac-accentGreen/10 text-mac-accentGreen font-semibold shrink-0 whitespace-nowrap">
                  96分
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none shrink min-w-0 justify-end">
              {/* 显眼的【重新生成】按钮 */}
              <button
                onClick={handleStartOptimize}
                disabled={isOptimizing || !draft.trim()}
                className="px-2 py-1 text-xs rounded-lg bg-mac-canvas border border-mac-border hover:bg-white text-mac-textPrimary hover:text-mac-accentBlue font-medium transition-all shadow-xs flex items-center gap-1 disabled:opacity-40 whitespace-nowrap shrink-0"
                title="基于当前草稿与框架推翻重来，重新生成"
              >
                <RotateCcw size={12.5} strokeWidth={2} className={isOptimizing ? 'animate-spin text-mac-accentBlue' : ''} />
                <span>重新生成</span>
              </button>

              {/* 变动透镜 (Diff 对比) */}
              <button
                onClick={() => setShowDiff(!showDiff)}
                disabled={!displayedOptimized}
                className={`px-2 py-1 text-xs rounded-lg border transition-all shadow-xs flex items-center gap-1 disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer ${
                  showDiff
                    ? 'bg-mac-accentBlue/10 border-mac-accentBlue/40 text-mac-accentBlue font-semibold'
                    : 'border-mac-border hover:bg-white text-mac-textSecondary hover:text-mac-textPrimary'
                }`}
                title="对比原始草稿与优化成果的具体增删条款 (快捷键 Cmd+D)"
              >
                <Columns2 size={12.5} strokeWidth={1.75} />
                <span>{showDiff ? '正文' : '透镜'}</span>
              </button>

              {/* 手动微调编辑按钮 */}
              {isEditing ? (
                <button
                  onClick={handleSaveEdit}
                  className="px-2 py-1 text-xs rounded-lg bg-mac-accentBlue text-white hover:bg-mac-accentBlueHover font-medium transition-all shadow-xs flex items-center gap-1 whitespace-nowrap shrink-0"
                  title="保存微调修改为新版本"
                >
                  <Check size={12.5} strokeWidth={2} />
                  <span>保存</span>
                </button>
              ) : (
                <button
                  onClick={handleStartEdit}
                  disabled={!displayedOptimized || isOptimizing}
                  className="px-2 py-1 text-xs rounded-lg border border-mac-border hover:bg-white text-mac-textSecondary hover:text-mac-textPrimary transition-all shadow-xs flex items-center gap-1 disabled:opacity-40 whitespace-nowrap shrink-0"
                  title="双击正文或点击编辑微调内容"
                >
                  <Pencil size={12.5} strokeWidth={1.75} />
                  <span>编辑</span>
                </button>
              )}

              {/* 复制按钮 */}
              <button
                onClick={handleCopyCurrent}
                disabled={!displayedOptimized}
                className="px-2 py-1 text-xs rounded-lg border border-mac-border hover:bg-white text-mac-textPrimary transition-all shadow-xs flex items-center gap-1 disabled:opacity-40 whitespace-nowrap shrink-0"
                title="复制最新提示词 (Cmd+Shift+C)"
              >
                {copied ? (
                  <>
                    <Check size={12.5} strokeWidth={2} className="text-mac-accentGreen" />
                    <span className="text-mac-accentGreen">已复制</span>
                  </>
                ) : (
                  <>
                    <Copy size={12.5} strokeWidth={1.75} />
                    <span>复制</span>
                  </>
                )}
              </button>

              {/* A/B 并发对比快捷入口 */}
              <button
                onClick={() => setActiveTab('ab_test')}
                className="px-2 py-1 text-xs rounded-lg bg-mac-accentGreen/15 hover:bg-mac-accentGreen/25 text-mac-accentGreen font-semibold transition-all flex items-center gap-1 border border-mac-accentGreen/20 shadow-xs whitespace-nowrap shrink-0"
                title="带入双轨 A/B 并发对比评测"
              >
                <Zap size={12.5} strokeWidth={2} />
                <span>A/B 对比</span>
              </button>
            </div>
          </div>

          {/* 右栏 Content：独立内部丝滑滚动到底部，顶栏与底栏完全固定 */}
          {showDiff ? (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <DiffViewer
                oldText={draft}
                newText={displayedOptimized || ''}
                oldTitle="原始草稿"
                newTitle={`优化成果 (${selectedFramework})`}
                className="h-full"
              />
            </div>
          ) : isEditing ? (
            <div className="flex-1 flex flex-col min-h-0">
              <textarea
                value={editText}
                autoFocus
                onChange={(e) => setEditText(e.target.value)}
                onBlur={handleSaveEdit}
                placeholder="在此直接微调优化后的提示词内容，失焦或点击保存自动存为新版本..."
                className="flex-1 w-full bg-white rounded-xl border border-mac-accentBlue/60 focus:ring-2 focus:ring-mac-accentBlue/20 p-3.5 text-xs text-mac-textPrimary font-mono leading-relaxed resize-none focus:outline-none shadow-inner overflow-y-auto min-h-0 select-text"
              />
            </div>
          ) : (
            <div
              onDoubleClick={handleStartEdit}
              title="双击直接进入编辑模式"
              className="flex-1 w-full bg-white/90 rounded-xl border border-mac-border p-3.5 text-xs text-mac-textPrimary font-mono leading-relaxed overflow-y-auto whitespace-pre-wrap select-text cursor-text min-h-0"
            >
              {displayedOptimized ? (
                displayedOptimized
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-mac-textMuted text-xs">
                  <Sparkles size={28} strokeWidth={1.5} className="text-mac-textMuted/40 mb-2" />
                  <span>暂无优化结果，请在左侧点击「开始结构化重塑」</span>
                </div>
              )}
            </div>
          )}

          {/* 右栏 Footer */}
          <div className="flex-shrink-0 mt-3 pt-2 border-t border-mac-border/60 flex items-center justify-between text-[11px] text-mac-textSecondary font-mono">
            {isEditing ? (
              <span className="text-mac-accentBlue font-medium">
                ● 正在手动编辑中，失焦或点击上方保存按钮即可存档
              </span>
            ) : (
              <span>
                Token: ~{Math.ceil((displayedOptimized?.length || 0) / 3)} · 双击正文直接编辑
              </span>
            )}
            <span>
              框架: {selectedFramework}
            </span>
          </div>
        </div>
      </div>

      {/* 3. 底部精简吸底微调栏 (Spotlight 智能输入条，彻底移除冗余对话历史卡片) */}
      <div className="flex-shrink-0 bg-mac-surface backdrop-blur-xl border border-mac-border rounded-xl p-2 px-3 shadow-mac flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          {/* 微调输入框附带麦克风语音输入 */}
          <div className="relative flex-1 flex items-center">
            <input
              type="text"
              value={feedbackInput}
              onChange={(e) => setFeedbackInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleFollowupIterate();
              }}
              placeholder="输入进一步调整要求，例如：“太长了，精简 50%”、“增加 2 个真实输入输出 Case”..."
              className="w-full pl-3 pr-9 py-1.5 text-xs bg-mac-canvas rounded-lg border border-mac-border focus:outline-none focus:ring-2 focus:ring-mac-accentBlue/30 focus:border-mac-accentBlue text-mac-textPrimary placeholder:text-mac-textMuted"
            />
            {/* 动态输入预览徽标 */}
            {feedbackVoice.isListening && feedbackVoice.interimTranscript && (
              <div className="absolute left-2 -top-8 z-20 flex items-center gap-1.5 px-2.5 py-1 bg-purple-50/95 border border-purple-200/90 text-purple-900 rounded-lg shadow-xs text-xs backdrop-blur-sm animate-fade-in pointer-events-none select-none max-w-[85%]">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-ping shrink-0" />
                <span className="text-[10px] font-bold text-purple-700 shrink-0">正在识别:</span>
                <span className="text-[11px] italic truncate text-purple-950 font-medium">
                  "{feedbackVoice.interimTranscript}"
                </span>
              </div>
            )}

            {/* 麦克风图标按钮 */}
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center">
              {feedbackVoice.isListening && (
                <span
                  className="absolute inset-0 rounded-lg bg-purple-500/25 pointer-events-none transition-transform duration-100 ease-out"
                  style={{
                    transform: `scale(${1 + (feedbackVoice.volume / 100) * 0.45})`,
                    opacity: Math.max(0.35, feedbackVoice.volume / 100),
                  }}
                />
              )}
              <button
                type="button"
                onClick={toggleFeedbackVoice}
                title={feedbackVoice.isListening ? `正在听写 (音量: ${feedbackVoice.volume}% · 点击停止)` : '点击进行语音输入'}
                className={`relative p-1.5 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                  feedbackVoice.isListening
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-mac-textSecondary hover:text-mac-textPrimary hover:bg-black/5'
                }`}
              >
                <Mic size={14} strokeWidth={feedbackVoice.isListening ? 2 : 1.75} className={feedbackVoice.isListening ? 'text-white' : ''} />
                {feedbackVoice.isListening && (
                  <div className="flex items-center gap-0.5 h-2.5 px-0.5">
                    <span
                      className="w-0.5 bg-white/90 rounded-full transition-all duration-75"
                      style={{ height: `${Math.max(2, Math.min(8, 2 + (feedbackVoice.volume * 0.06)))}px` }}
                    />
                    <span
                      className="w-0.5 bg-white rounded-full transition-all duration-75"
                      style={{ height: `${Math.max(3, Math.min(10, 3 + (feedbackVoice.volume * 0.1)))}px` }}
                    />
                    <span
                      className="w-0.5 bg-white/90 rounded-full transition-all duration-75"
                      style={{ height: `${Math.max(2, Math.min(7, 2 + (feedbackVoice.volume * 0.05)))}px` }}
                    />
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* 快捷微调常用胶囊 */}
          <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
            {QUICK_SUGGESTIONS.map((sug, idx) => (
              <button
                key={idx}
                disabled={isOptimizing}
                onClick={() => handleFollowupIterate(sug.prompt)}
                className="text-[11px] px-2 py-1 rounded-lg bg-black/[0.03] hover:bg-mac-accentBlue/10 hover:text-mac-accentBlue border border-transparent hover:border-mac-accentBlue/30 text-mac-textSecondary transition-all flex items-center gap-1 flex-shrink-0"
              >
                <span>{sug.label}</span>
              </button>
            ))}
          </div>

          {/* 提交微调按钮 */}
          <button
            onClick={() => handleFollowupIterate()}
            disabled={isOptimizing || !feedbackInput.trim()}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-mac-accentBlue hover:bg-mac-accentBlueHover disabled:opacity-50 rounded-lg shadow-xs transition-all flex items-center gap-1 flex-shrink-0"
          >
            <Send size={13} strokeWidth={2} />
            <span>微调</span>
          </button>
        </div>
      </div>
    </div>
  );
};
