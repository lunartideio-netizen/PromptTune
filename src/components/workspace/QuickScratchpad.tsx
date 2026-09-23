import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { FrameworkType } from '../../types';
import { streamChat, ChatMessage, MessageContentPart, resolvePromptReferences, extractSmartTitleFromDraft } from '../../services/llmService';
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
  RotateCcw, 
  FolderPlus, 
  Loader2, 
  Key,
  Zap,
  Lightbulb,
  ShieldCheck,
  Code2,
  Brain,
  FileText,
  Pencil,
  ArrowRight,
  Mic,
  Image as ImageIcon,
  X as XIcon,
  Plus as PlusIcon,
  Columns2
} from 'lucide-react';
import confetti from 'canvas-confetti';

const FRAMEWORKS: { id: FrameworkType; name: string; desc: string; badge: string }[] = [
  { id: 'CO-STAR', name: 'CO-STAR', desc: '上下文/目标/风格/受众/响应', badge: '全面结构化' },
  { id: 'CRISPE', name: 'CRISPE', desc: '角色/背景/陈述/实验', badge: '商业分析' },
  { id: 'FEW_SHOT_COT', name: 'Few-Shot & CoT', desc: '少样本示例 + 思维链推理', badge: '逻辑严谨' },
  { id: 'ROLE_TASK_FORMAT', name: 'Role-Task-Format', desc: '角色与任务紧凑格式', badge: '紧凑高效' },
  { id: 'STRICT_JSON', name: 'Strict JSON', desc: '严格类型 Schema 输出', badge: '代码/接口' },
  { id: 'FREEFORM', name: '自由深度精修', desc: '消除歧义与冗余', badge: '通用润色' },
];

const QUICK_SUGGESTIONS = [
  { label: '精简 40%', icon: Zap, prompt: '精简 40%，仅保留核心指令与关键边界' },
  { label: '补充 2 个示例', icon: Lightbulb, prompt: '补充 2 个正负对比的 Few-Shot 示例' },
  { label: '强化负向约束', icon: ShieldCheck, prompt: '强化负向约束 (Negative Prompts)，杜绝幻觉' },
  { label: '严格 JSON 结构', icon: Code2, prompt: '要求输出符合严格标准的合法 JSON 格式' },
  { label: '增加思考链', icon: Brain, prompt: '增加思考链标签 <thought>，要求先分析再输出' },
];

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
    syncScratchpadVariables,
    scratchpadVariables,
    setScratchpadVariables,
    clearScratchpad,
    archiveScratchpadToFolder,
    folders,
    prompts,
    skills,
    apiConfig,
    setIsSettingsOpen,
    setActiveTab
  } = useAppStore();

  const draftTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [isOptimizing, setIsOptimizing] = useState(false);
  const [liveStreamingText, setLiveStreamingText] = useState('');
  const [feedbackInput, setFeedbackInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [targetFolderId, setTargetFolderId] = useState<string | null>(null);
  const [archiveTitle, setArchiveTitle] = useState('');
  const [apiKeyError, setApiKeyError] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 语音输入
  const draftVoice = useVoiceInput();
  const feedbackVoice = useVoiceInput();

  const toggleDraftVoice = () => {
    draftVoice.toggleListening((finalChunk) => {
      const current = useAppStore.getState().scratchpadDraft;
      const next = current ? `${current} ${finalChunk}` : finalChunk;
      setScratchpadDraft(next);
    });
  };

  const toggleFeedbackVoice = () => {
    feedbackVoice.toggleListening((finalChunk) => {
      setFeedbackInput((prev) => (prev ? `${prev} ${finalChunk}` : finalChunk));
    });
  };

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

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

  const isOllama = apiConfig.provider === 'ollama';
  const isLocal = isOllama || apiConfig.baseUrl.includes('localhost') || apiConfig.baseUrl.includes('127.0.0.1');
  const hasKey = Boolean(apiConfig.apiKey?.trim()) || isLocal;

  const handleStartEdit = () => {
    if (isOptimizing) return;
    const baseText = scratchpadOptimized || liveStreamingText || scratchpadDraft;
    setEditText(baseText);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    setIsEditing(false);
    const trimmed = editText.trim();
    if (!trimmed || trimmed === scratchpadOptimized) return;
    setScratchpadOptimized(trimmed);
    addScratchpadVersion({
      version: (scratchpadVersions.length || 0) + 1,
      promptText: trimmed,
      instruction: '手动修改微调',
      framework: scratchpadFramework,
      timestamp: Date.now(),
      tokenCount: Math.ceil(trimmed.length / 3),
      qualityScore: { clarity: 98, completeness: 95, structure: 98 },
    });
  };

  const handleStartOptimize = async () => {
    if (!scratchpadDraft.trim()) return;
    setApiKeyError(false);

    if (!hasKey) {
      setApiKeyError(true);
      return;
    }

    setIsOptimizing(true);
    setLiveStreamingText('');
    setIsEditing(false);

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    const systemPromptParts = [
      `你是一名世界顶尖的提示词工程架构师。你的任务是将用户的原始草稿提示词重构成高质量、清晰、边界明确、具备生产可用性的专业提示词。`,
      `当前指定优化框架：${scratchpadFramework}。`,
    ];

    if (referenceImages.length > 0) {
      systemPromptParts.push(
        `\n【多模态视觉专家模式】：用户已提供参考图片（UI界面/设计稿/视觉意向）。请先严谨解构图片中的视觉层级、色彩搭配 (Hex/RGB)、排版间距、交互组件、字体层级与质感细节，并将提取的视觉特征、设计语义转化为结构化、高保真还原的精确提示词指引。`
      );
    }

    systemPromptParts.push(`\n请直接输出重构后的提示词正文，不要输出无意义客套。保留并规范必要的 {{variable_name}} 占位符。`);

    const resolvedDraft = resolvePromptReferences(scratchpadDraft, prompts, skills).resolvedText;
    let userContent: string | MessageContentPart[] = `请基于 ${scratchpadFramework} 框架优化以下原始草稿：\n\n${resolvedDraft}`;
    if (referenceImages.length > 0) {
      userContent = [
        {
          type: 'text',
          text: `请结合附带的 ${referenceImages.length} 张视觉参考图（解构其设计规范、布局层级与色彩），基于 ${scratchpadFramework} 框架对以下原始草稿进行结构化重构优化：\n\n${resolvedDraft}`,
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

    try {
      await streamChat(
        messages,
        apiConfig,
        {
          onChunk: (_chunk, acc) => {
            setLiveStreamingText(acc);
          },
          onDone: (telemetry) => {
            if (!telemetry.isDone || telemetry.error) return;
            setIsOptimizing(false);
            setScratchpadOptimized(telemetry.content);

            confetti({
              particleCount: 40,
              spread: 60,
              origin: { y: 0.7, x: 0.8 },
              colors: ['#0A84FF', '#34C759', '#FF6B4A', '#FF9F0A'],
            });

            addScratchpadTurn({
              id: `sturn-${Date.now()}-u`,
              role: 'user',
              content: `使用 ${scratchpadFramework} 优化草稿`,
              timestamp: Date.now() - 1000,
            });
            addScratchpadTurn({
              id: `sturn-${Date.now()}-a`,
              role: 'assistant',
              content: telemetry.content,
              timestamp: Date.now(),
              tokenCount: telemetry.tokenCount,
            });

            addScratchpadVersion({
              version: (scratchpadVersions.length || 0) + 1,
              promptText: telemetry.content,
              instruction: `初始架构优化 (${scratchpadFramework})`,
              framework: scratchpadFramework,
              timestamp: Date.now(),
              tokenCount: telemetry.tokenCount,
              qualityScore: { clarity: 95, completeness: 92, structure: 97 },
            });

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

  const handleFollowupIterate = async (customInstruction?: string) => {
    const instruction = customInstruction || feedbackInput.trim();
    if (!instruction) return;
    setApiKeyError(false);

    if (!hasKey) {
      setApiKeyError(true);
      return;
    }

    const currentBasePrompt = scratchpadOptimized || scratchpadDraft;
    if (!currentBasePrompt) return;

    setIsOptimizing(true);
    setLiveStreamingText('');
    setFeedbackInput('');
    setIsEditing(false);

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    const systemPromptParts = [
      `你是一名世界顶尖的提示词工程架构师。请针对现有提示词，严格执行用户的微调指令并重新优化生成。`,
      `当前指定优化框架：${scratchpadFramework}。`,
    ];

    if (referenceImages.length > 0) {
      systemPromptParts.push(
        `\n【多模态视觉专家模式】：用户已提供参考图片（UI界面/设计稿/视觉意向）。请参照视觉参考图的设计系统、组件和色彩规范，确保微调迭代后的提示词保持高度保真。`
      );
    }

    systemPromptParts.push(`\n请直接输出重构修改后的完整提示词正文，不要输出多余解释或寒暄。`);

    const resolvedBasePrompt = resolvePromptReferences(currentBasePrompt, prompts, skills).resolvedText;
    let userContent: string | MessageContentPart[] = `【当前提示词】：\n${resolvedBasePrompt}\n\n【微调修改要求】：\n${instruction}\n\n请输出重塑后的完整提示词：`;
    if (referenceImages.length > 0) {
      userContent = [
        {
          type: 'text',
          text: `【当前提示词】：\n${resolvedBasePrompt}\n\n【微调修改要求】：\n${instruction}\n\n（附带 ${referenceImages.length} 张视觉参考图，请保持视觉特征统一）\n\n请输出重塑后的完整提示词：`,
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

    try {
      await streamChat(
        messages,
        apiConfig,
        {
          onChunk: (_chunk, acc) => {
            setLiveStreamingText(acc);
          },
          onDone: (telemetry) => {
            if (!telemetry.isDone || telemetry.error) return;
            setIsOptimizing(false);
            setScratchpadOptimized(telemetry.content);

            confetti({
              particleCount: 30,
              spread: 50,
              origin: { y: 0.7, x: 0.8 },
              colors: ['#0A84FF', '#34C759', '#FF9F0A'],
            });

            addScratchpadTurn({
              id: `sturn-${Date.now()}-u`,
              role: 'user',
              content: instruction,
              timestamp: Date.now() - 500,
            });
            addScratchpadTurn({
              id: `sturn-${Date.now()}-a`,
              role: 'assistant',
              content: telemetry.content,
              timestamp: Date.now(),
              tokenCount: telemetry.tokenCount,
            });

            addScratchpadVersion({
              version: (scratchpadVersions.length || 0) + 1,
              promptText: telemetry.content,
              instruction,
              framework: scratchpadFramework,
              timestamp: Date.now(),
              tokenCount: telemetry.tokenCount,
              qualityScore: { clarity: 97, completeness: 95, structure: 98 },
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

  const displayedOptimized = liveStreamingText || scratchpadOptimized;

  const [showDiff, setShowDiff] = useState(false);

  const handleCopy = () => {
    if (!displayedOptimized) return;
    navigator.clipboard.writeText(displayedOptimized);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // 划词快速转变量处理
  const handleAddVariableFromSelection = (name: string, defaultValue: string) => {
    const existing = scratchpadVariables || [];
    if (!existing.some((v) => v.name === name)) {
      setScratchpadVariables([...existing, { name, defaultValue, currentValue: defaultValue }]);
    }
  };

  // 全局 macOS 快捷键体系 (Cmd+Enter 优化, Cmd+Shift+C 复制, Cmd+D 切换 Diff)
  useKeyboardShortcuts({
    onOptimize: () => {
      if (isOptimizing) {
        abortControllerRef.current?.abort();
        setIsOptimizing(false);
      } else if (scratchpadDraft.trim()) {
        handleStartOptimize();
      }
    },
    onCopy: handleCopy,
    onToggleDiff: () => {
      if (displayedOptimized) {
        setShowDiff((prev) => !prev);
      }
    },
  });

  const handleArchiveConfirm = async () => {
    const smartFallback = extractSmartTitleFromDraft(scratchpadDraft);
    const title = archiveTitle.trim() || smartFallback;
    await archiveScratchpadToFolder(targetFolderId, title);
    setShowArchiveDialog(false);
    clearScratchpad();
  };

  return (
    <div className="h-full flex flex-col overflow-hidden p-4 md:p-5 max-w-7xl mx-auto w-full gap-3 select-none">
      {/* API Key Missing Guide Banner */}
      {apiKeyError && (
        <div className="flex-shrink-0 bg-amber-50/90 border border-amber-200/90 rounded-xl p-2.5 shadow-sm animate-fade-in flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-amber-900">
            <Key size={14} strokeWidth={1.75} className="text-amber-600 flex-shrink-0" />
            <span>未配置 API Key，请先在设置中填写密钥或使用本地 OpenCodeX / Ollama。</span>
          </div>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 flex items-center gap-1 flex-shrink-0"
          >
            配置密钥
          </button>
        </div>
      )}

      {/* 1. 精简极窄单行架构选择栏 (~36px) */}
      <div className="flex-shrink-0 flex items-center justify-between gap-2 px-3 py-1.5 bg-mac-surface backdrop-blur-xl border border-mac-border rounded-xl shadow-xs overflow-hidden">
        <div className="flex items-center gap-1.5 text-xs font-bold text-mac-textPrimary flex-shrink-0">
          <Sparkles size={13} strokeWidth={2} className="text-mac-accentBlue" />
          <span>优化架构</span>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none flex-1 justify-end">
          {FRAMEWORKS.map((fw) => {
            const isSelected = scratchpadFramework === fw.id;
            return (
              <button
                key={fw.id}
                onClick={() => setScratchpadFramework(fw.id)}
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
        {/* 左栏：原始需求草稿 */}
        <div className="bg-mac-surface backdrop-blur-xl border border-mac-border rounded-2xl p-4 shadow-mac flex flex-col min-h-0 overflow-hidden">
          <div className="flex-shrink-0 flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-mac-textPrimary flex items-center gap-1.5">
              <FileText size={14} strokeWidth={1.75} className="text-mac-textSecondary" />
              <span>原始需求草稿</span>
            </span>

            <div className="flex items-center gap-2">
              {/* 隐藏的图片选择器 */}
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
                {scratchpadDraft.length} 字
              </span>
              {scratchpadDraft && (
                <button
                  onClick={clearScratchpad}
                  title="清空草稿"
                  className="p-1 rounded text-mac-textSecondary hover:text-mac-textPrimary hover:bg-black/5 transition-colors cursor-pointer"
                >
                  <RotateCcw size={13} strokeWidth={1.75} />
                </button>
              )}
            </div>
          </div>

          {/* 输入框区域：支持 Cmd+V 截图粘贴与外部拖拽 */}
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
              value={scratchpadDraft}
              onChange={(e) => setScratchpadDraft(e.target.value)}
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
              placeholder="在此输入您的草稿或要求，支持 @ 唤起已装技能与提示词，支持 {{variable}} 变量；支持拖拽或 Cmd+V 直接粘贴参考图 (按 Option+Space 语音听写)..."
              className="flex-1 w-full bg-mac-canvas rounded-xl border border-mac-border p-3.5 pb-10 text-xs text-mac-textPrimary font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-mac-accentBlue/30 focus:border-mac-accentBlue resize-none overflow-y-auto min-h-0 select-text"
            />

            {/* @ 智能联想唤起浮层 */}
            <MentionAutocomplete
              textareaRef={draftTextareaRef}
              value={scratchpadDraft}
              onSelect={(val) => {
                setScratchpadDraft(val);
              }}
            />

            {/* 划词设为变量悬浮气泡 */}
            <SelectionVariablePopover
              textareaRef={draftTextareaRef}
              value={scratchpadDraft}
              onChange={setScratchpadDraft}
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

          {/* 缩略图预览栏 */}
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

          <div className="flex-shrink-0 mt-3 pt-2 border-t border-mac-border/60 flex items-center justify-between">
            <span className="text-[11px] text-mac-textSecondary">
              支持 <code className="bg-black/5 px-1 py-0.5 rounded text-mac-accentPurple font-mono">{'{{variable}}'}</code> 变量
            </span>

            <button
              onClick={handleStartOptimize}
              disabled={isOptimizing || !scratchpadDraft.trim()}
              className="px-4 py-2 text-xs font-bold text-white bg-mac-accentBlue hover:bg-mac-accentBlueHover disabled:opacity-50 rounded-xl shadow-sm transition-all flex items-center gap-1.5"
            >
              {isOptimizing ? (
                <>
                  <Loader2 size={14} strokeWidth={2} className="animate-spin" />
                  <span>智能重构中...</span>
                </>
              ) : scratchpadOptimized ? (
                <>
                  <RotateCcw size={14} strokeWidth={2} />
                  <span>重新优化 (全新重塑)</span>
                </>
              ) : (
                <>
                  <Sparkles size={14} strokeWidth={2} />
                  <span>开始优化</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 右栏：结构化优化成果 (内部独立丝滑内滚) */}
        <div className="bg-mac-surface backdrop-blur-xl border border-mac-border rounded-2xl p-4 shadow-mac flex flex-col min-h-0 overflow-hidden">
          {/* 右栏 Header：标题、操作项与显眼的【重新生成】按钮 */}
          <div className="flex-shrink-0 flex items-center justify-between gap-2 mb-2 min-w-0">
            <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
              <span className="text-xs font-semibold text-mac-textPrimary flex items-center gap-1 shrink-0 whitespace-nowrap">
                <Sparkles size={14} strokeWidth={1.75} className="text-mac-accentBlue shrink-0" />
                <span>优化成果 (v{scratchpadVersions.length || 1})</span>
              </span>
              {scratchpadVersions.length > 0 && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-mac-accentGreen/10 text-mac-accentGreen font-semibold shrink-0 whitespace-nowrap">
                  96分
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none shrink min-w-0 justify-end">
              {/* 显眼的【重新生成】按钮 */}
              <button
                onClick={handleStartOptimize}
                disabled={isOptimizing || !scratchpadDraft.trim()}
                className="px-2 py-1 text-xs rounded-lg bg-mac-canvas border border-mac-border hover:bg-white text-mac-textPrimary hover:text-mac-accentBlue font-medium transition-all shadow-xs flex items-center gap-1 disabled:opacity-40 whitespace-nowrap shrink-0"
                title="基于当前草稿与框架重新生成"
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

              {/* 手动微调编辑 */}
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
                onClick={handleCopy}
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
                onClick={() => {
                  syncScratchpadVariables();
                  setActiveTab('ab_test');
                }}
                className="px-2 py-1 text-xs rounded-lg bg-mac-accentGreen/15 hover:bg-mac-accentGreen/25 text-mac-accentGreen font-semibold transition-all flex items-center gap-1 shadow-xs border border-mac-accentGreen/20 whitespace-nowrap shrink-0"
                title="带入当前草稿与优化结果进行双轨真机测试"
              >
                <Zap size={12.5} strokeWidth={2} />
                <span>A/B 对比</span>
              </button>

              {scratchpadOptimized && (
                <button
                  onClick={() => {
                    const smartTitle = extractSmartTitleFromDraft(scratchpadDraft);
                    setArchiveTitle(smartTitle);
                    setShowArchiveDialog(true);
                  }}
                  className="px-2 py-1 text-xs font-medium text-mac-accentGreen hover:bg-mac-accentGreen/10 rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
                  title="归档保存到文件夹"
                >
                  <FolderPlus size={12.5} strokeWidth={1.75} />
                  <span>归档</span>
                </button>
              )}
            </div>
          </div>

          {/* 右栏 Content：独立内部丝滑滚动到底部，顶栏与底栏完全固定 */}
          {showDiff ? (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <DiffViewer
                oldText={scratchpadDraft}
                newText={displayedOptimized || ''}
                oldTitle="原始草稿"
                newTitle={`优化成果 (${scratchpadFramework})`}
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
                placeholder="在此直接微调优化后的提示词内容，失焦或点击保存自动记录新版本快照..."
                className="flex-1 w-full bg-white rounded-xl border border-mac-accentBlue/60 focus:ring-2 focus:ring-mac-accentBlue/20 p-3.5 text-xs text-mac-textPrimary font-mono leading-relaxed resize-none focus:outline-none shadow-inner overflow-y-auto min-h-0 select-text"
              />
            </div>
          ) : (
            <div
              onDoubleClick={handleStartEdit}
              title="双击直接进入手动编辑模式"
              className="flex-1 w-full bg-white/90 rounded-xl border border-mac-border p-3.5 text-xs text-mac-textPrimary font-mono leading-relaxed overflow-y-auto whitespace-pre-wrap select-text cursor-text min-h-0"
            >
              {displayedOptimized ? (
                displayedOptimized
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-mac-textMuted text-xs">
                  <Sparkles size={28} strokeWidth={1.5} className="text-mac-textMuted/40 mb-2" />
                  <span>优化结果将在此呈现（双击正文可手动微调）</span>
                </div>
              )}
            </div>
          )}

          <div className="flex-shrink-0 mt-3 pt-2 border-t border-mac-border/60 flex items-center justify-between text-[11px] text-mac-textSecondary font-mono">
            {isEditing ? (
              <span className="text-mac-accentBlue font-medium">
                ● 正在手动编辑中，失焦或点击保存自动存为新版本
              </span>
            ) : (
              <span>
                Token: ~{Math.ceil((displayedOptimized?.length || 0) / 3)} · 双击正文直接编辑
              </span>
            )}
            <span>
              框架: {scratchpadFramework}
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
              placeholder="输入继续微调要求..."
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

          {/* 发送微调按钮 */}
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

      {/* 归档弹窗 */}
      {showArchiveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-fade-in p-4">
          <div className="bg-white border border-mac-border rounded-2xl shadow-macModal w-full max-w-sm p-5 space-y-4">
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
                className="w-full text-xs px-3 py-2 bg-mac-canvas rounded-xl border border-mac-border focus:outline-none focus:ring-1 focus:ring-mac-accentGreen text-mac-textPrimary"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-mac-textPrimary mb-1">
                选择目录
              </label>
              <select
                value={targetFolderId || ''}
                onChange={(e) => setTargetFolderId(e.target.value ? e.target.value : null)}
                className="w-full text-xs px-3 py-2 bg-mac-canvas rounded-xl border border-mac-border focus:outline-none focus:ring-1 focus:ring-mac-accentGreen text-mac-textPrimary"
              >
                <option value="">根目录 (未归类)</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-mac-border/60">
              <button
                onClick={() => setShowArchiveDialog(false)}
                className="px-3 py-1.5 text-xs text-mac-textSecondary hover:text-mac-textPrimary hover:bg-black/5 rounded-lg"
              >
                取消
              </button>
              <button
                onClick={handleArchiveConfirm}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-mac-accentGreen hover:bg-mac-accentGreen/90 rounded-lg shadow-sm"
              >
                确认归档
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
