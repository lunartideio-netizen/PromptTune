import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { FrameworkType, PromptVariable, PromptVersion, OptimizationTurn } from '../../types';
import { CreateFrameworkModal } from './CreateFrameworkModal';
import { PromptAuditModal } from './PromptAuditModal';
import { PromptCompressorModal } from './PromptCompressorModal';
import { 
  streamChat, 
  ChatMessage, 
  MessageContentPart, 
  syncVariables, 
  substituteVariables,
  resolvePromptReferences, 
  extractSmartTitleFromDraft,
  isVisionModel
} from '../../services/llmService';
import { calculatePromptQuality } from '../../utils/promptUtils';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { fileToDataUrl, extractImagesFromPaste, extractImagesFromDrop } from '../../utils/imageUtils';
import { MentionAutocomplete } from '../common/MentionAutocomplete';
import { DiffViewer } from '../common/DiffViewer';
import { SelectionVariablePopover } from '../common/SelectionVariablePopover';
import { PromptSyntaxHighlighter } from '../common/PromptSyntaxHighlighter';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { 
  Sparkles, 
  Send, 
  Copy, 
  Check, 
  Loader2, 
  Key, 
  FileText, 
  Zap, 
  Lightbulb, 
  ShieldCheck, 
  ShieldAlert,
  Code2, 
  Brain, 
  Pencil, 
  RotateCcw, 
  Mic, 
  Image as ImageIcon, 
  X as XIcon, 
  Plus as PlusIcon, 
  Columns2,
  AlertTriangle,
  GitFork,
  Square,
} from 'lucide-react';
import { auditPrompt } from '../../utils/promptAuditUtils';

import confetti from 'canvas-confetti';

export const FRAMEWORKS: { id: FrameworkType; name: string; desc: string; badge: string; instruction?: string; isCustom?: boolean }[] = [
  { id: 'CO-STAR', name: 'CO-STAR', desc: 'Context, Objective, Style, Tone, Audience, Response', badge: '全面结构化' },
  { id: 'CRISPE', name: 'CRISPE', desc: 'Capacity, Role, Insight, Statement, Personality, Experiment', badge: '商业分析' },
  { id: 'FEW_SHOT_COT', name: 'Few-Shot & CoT', desc: '示例引导 + 思维链深度推理', badge: '逻辑严谨' },
  { id: 'ROLE_TASK_FORMAT', name: 'Role-Task-Format', desc: '轻量高效生产三元组', badge: '紧凑高效' },
  { id: 'STRICT_JSON', name: 'Strict JSON', desc: '强类型 Schema 约束与纯代码提取', badge: '代码/接口' },
  { id: 'FREEFORM', name: '自由深度精修', desc: '保持原有语序与风格，极致消除歧义与冗余', badge: '通用润色' },
];

export const QUICK_SUGGESTIONS = [
  { label: '双态免填协议', icon: Sparkles, prompt: '将提示词中所有死板的静态变量占位符重构成双态自适应承接协议（直接粘贴即用，未给内容先待命确认，给了内容直接处理）' },
  { label: '精简 40%', icon: Zap, prompt: '精简 40%，仅保留核心指令与边界约束' },
  { label: '补充 2 个示例', icon: Lightbulb, prompt: '补充 2 个正负对比的 Few-Shot 示例' },
  { label: '强化负向约束', icon: ShieldCheck, prompt: '强化负向约束 (Negative Prompts)，防幻觉' },
  { label: '严格 JSON 规范', icon: Code2, prompt: '要求输出符合严格 JSON 格式' },
  { label: '增加思考链', icon: Brain, prompt: '增加思考链标签 <thought>，要求先分析再输出' },
];

export interface PromptWorkspaceCoreProps {
  mode: 'prompt' | 'scratchpad';
  promptId?: string | null;
  title?: string;
  initialDraft: string;
  initialOptimized: string;
  initialFramework: FrameworkType;
  variables: PromptVariable[];
  versions: PromptVersion[];
  turns: OptimizationTurn[];
  systemContext?: string;
  domainRules?: string;
  headerExtra?: React.ReactNode;
  onDraftChange: (draft: string) => void;
  onOptimizedChange: (optimized: string) => void;
  onFrameworkChange: (framework: FrameworkType) => void;
  onSaveVersion: (version: PromptVersion) => Promise<void> | void;
  onAddTurn?: (turn: OptimizationTurn) => Promise<void> | void;
  onUpdateVariables: (variables: PromptVariable[]) => Promise<void> | void;
  onAutoTitle?: (title: string) => void;
}

export const PromptWorkspaceCore: React.FC<PromptWorkspaceCoreProps> = ({
  mode,
  promptId,
  title,
  initialDraft,
  initialOptimized,
  initialFramework,
  variables,
  versions,
  turns,
  systemContext = '',
  domainRules = '',
  headerExtra,
  onDraftChange,
  onOptimizedChange,
  onFrameworkChange,
  onSaveVersion,
  onAddTurn,
  onUpdateVariables,
  onAutoTitle,
}) => {
  const { 
    prompts, 
    skills, 
    apiConfig, 
    setActiveTab, 
    setIsSettingsOpen, 
    showToast,
    customFrameworks,
    deleteCustomFramework,
    createChildPrompt,
    archiveScratchpadToFolder,
  } = useAppStore();

  // 计算当前提示词的链路祖先上下文（按 parentPromptId 向上回溯）
  const chainAncestors = useMemo(() => {
    if (!promptId || mode !== 'prompt') return [];
    const result: { title: string; optimized: string }[] = [];
    const visited = new Set<string>();
    let currentId = promptId;
    // 先找到当前的 parent
    let current = prompts.find((p) => p.id === currentId);
    let parentId = current?.parentPromptId;
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = prompts.find((p) => p.id === parentId);
      if (!parent) break;
      result.unshift({ title: parent.title, optimized: parent.currentOptimized || parent.originalDraft || '' });
      parentId = parent.parentPromptId;
    }
    return result;
  }, [promptId, prompts, mode]);

  const [isCreateFrameworkOpen, setIsCreateFrameworkOpen] = useState(false);

  const allFrameworks = useMemo(() => {
    return [
      ...FRAMEWORKS,
      ...customFrameworks.map((cf) => ({
        id: cf.id,
        name: cf.name,
        desc: cf.desc,
        badge: cf.badge,
        instruction: cf.instruction,
        isCustom: true,
      })),
    ];
  }, [customFrameworks]);

  const draftTextareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const draftDebounceTimerRef = useRef<any>(null);

  const [draft, setDraft] = useState(initialDraft);
  const [selectedFramework, setSelectedFramework] = useState<FrameworkType>(initialFramework);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [liveStreamingText, setLiveStreamingText] = useState('');
  const [feedbackInput, setFeedbackInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [apiKeyError, setApiKeyError] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [syntaxHighlightEnabled, setSyntaxHighlightEnabled] = useState(true);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isCompressorOpen, setIsCompressorOpen] = useState(false);

  // 左右分栏自由拖拽调整
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const [leftWidthPercent, setLeftWidthPercent] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('prompttune_split_ratio');
      if (saved) {
        const val = parseFloat(saved);
        if (!isNaN(val) && val >= 20 && val <= 80) return val;
      }
    } catch {}
    return 50;
  });
  const [isResizing, setIsResizing] = useState(false);

  const handleSplitterMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const container = splitContainerRef.current;
    if (!container) return;

    // 拖动期间保护用户选择文本不被高亮干扰
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) return;
      const currentX = moveEvent.clientX - rect.left;
      const rawPercent = (currentX / rect.width) * 100;
      
      // 磁吸吸附机制：在 48% ~ 52% 范围内自动磁吸居中 50%
      let finalPercent = rawPercent;
      if (rawPercent >= 48 && rawPercent <= 52) {
        finalPercent = 50;
      }
      const clamped = Math.min(Math.max(finalPercent, 20), 80);
      setLeftWidthPercent(clamped);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      setLeftWidthPercent((curr) => {
        try {
          localStorage.setItem('prompttune_split_ratio', curr.toFixed(1));
        } catch {}
        return curr;
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // 语音输入 hooks
  const draftVoice = useVoiceInput();
  const feedbackVoice = useVoiceInput();

  const prevPromptIdRef = useRef(promptId);
  const lastSyncedDraftRef = useRef(initialDraft);

  // 1. 当且仅当切换提示词或工作区时，完全重置上下文
  useEffect(() => {
    prevPromptIdRef.current = promptId;
    lastSyncedDraftRef.current = initialDraft;
    setDraft(initialDraft);
    setSelectedFramework(initialFramework);
    setLiveStreamingText('');
    setApiKeyError(false);
    setIsEditing(false);
    setEditText('');
    setReferenceImages([]);
    return () => {
      abortControllerRef.current?.abort();
      if (draftDebounceTimerRef.current) {
        clearTimeout(draftDebounceTimerRef.current);
      }
    };
  }, [promptId]);

  // 2. 仅当外部主动变更 draft (如装配技能、恢复历史版本、清空草稿) 且非内部打字导致时同步
  useEffect(() => {
    if (initialDraft !== lastSyncedDraftRef.current) {
      lastSyncedDraftRef.current = initialDraft;
      setDraft(initialDraft);
    }
  }, [initialDraft]);

  // 3. 外部框架切换同步
  useEffect(() => {
    setSelectedFramework(initialFramework);
  }, [initialFramework]);

  // 4. 监听 Command Palette 等全局快捷动作
  useEffect(() => {
    const handleGlobalAction = (e: Event) => {
      const customEvent = e as CustomEvent<{ action: string }>;
      if (customEvent.detail?.action === 'open-compressor') {
        setIsCompressorOpen(true);
      } else if (customEvent.detail?.action === 'open-audit') {
        setIsAuditModalOpen(true);
      }
    };

    window.addEventListener('prompttune:action', handleGlobalAction);
    return () => window.removeEventListener('prompttune:action', handleGlobalAction);
  }, []);

  const isOllama = apiConfig.provider === 'ollama';
  const isLocal = isOllama || apiConfig.baseUrl.includes('localhost') || apiConfig.baseUrl.includes('127.0.0.1');
  const hasKey = Boolean(apiConfig.apiKey?.trim()) || isLocal;

  const handleDraftChangeInternal = (newVal: string) => {
    lastSyncedDraftRef.current = newVal;
    setDraft(newVal);
    onDraftChange(newVal);
    if (draftDebounceTimerRef.current) {
      clearTimeout(draftDebounceTimerRef.current);
    }
    draftDebounceTimerRef.current = setTimeout(() => {
      const nextVars = syncVariables(variables, newVal + '\n' + (initialOptimized || ''));
      onUpdateVariables(nextVars);
    }, 300);
  };

  const toggleDraftVoice = () => {
    draftVoice.toggleListening((finalChunk) => {
      setDraft((prev) => {
        const next = prev ? `${prev} ${finalChunk}` : finalChunk;
        handleDraftChangeInternal(next);
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

  const handleStartEdit = () => {
    if (isOptimizing) return;
    const baseText = initialOptimized || liveStreamingText || draft;
    setEditText(baseText);
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    setIsEditing(false);
    const trimmed = editText.trim();
    if (!trimmed || trimmed === initialOptimized) return;

    const quality = calculatePromptQuality(trimmed, selectedFramework);
    const newVersionNumber = (versions.length || 0) + 1;
    await onSaveVersion({
      version: newVersionNumber,
      promptText: trimmed,
      instruction: '手动微调修改',
      framework: selectedFramework,
      timestamp: Date.now(),
      tokenCount: Math.ceil(trimmed.length / 3),
      qualityScore: quality,
    });

    onOptimizedChange(trimmed);
    const nextVars = syncVariables(variables, draft + '\n' + trimmed);
    onUpdateVariables(nextVars);
  };

  const handleStopOptimization = () => {
    abortControllerRef.current?.abort();
    setIsOptimizing(false);
    if (liveStreamingText.trim()) {
      const partial = liveStreamingText.trim();
      onOptimizedChange(partial);
      const nextVars = syncVariables(variables, (draft || '') + '\n' + partial);
      onUpdateVariables(nextVars);
      showToast(`已停止生成，已为您妥善保留当前已输出的 ${partial.length} 字符断点成果`, 'info');
      setLiveStreamingText('');
    }
  };

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

    const activeFw = allFrameworks.find((f) => f.id === selectedFramework);
    const systemPromptParts = [
      `你是一名世界顶尖的提示词工程架构师。你的任务是将用户的原始草稿重构成结构清晰、表达精准、边界严格的工业级专业提示词。`,
      `目标工程重构框架：${activeFw?.name || selectedFramework} (${activeFw?.desc || ''})。${activeFw?.instruction ? `\n框架强制执行规范要求：${activeFw.instruction}` : ''}`,
    ];

    if (systemContext) {
      systemPromptParts.push(`\n【上级目录继承的全局背景与角色设定】：\n${systemContext}`);
    }
    if (domainRules) {
      systemPromptParts.push(`\n【上级目录继承的行业规则与边界约束】：\n${domainRules}`);
    }

    if (referenceImages.length > 0) {
      systemPromptParts.push(
        `\n【多模态视觉专家模式】：用户已提供参考图片（UI界面/设计稿/视觉意向）。请先严谨解构图片中的视觉层级、色彩搭配 (Hex/RGB)、排版间距、交互组件、字体层级与质感细节，并将提取的视觉特征、设计语义转化为结构化、高保真还原的精确提示词指引。`
      );
    }

    const userExplicitlyHasVars = /\{\{\s*[^@\s][^\}]*\}\}/.test(draft);
    const variableInstruction = userExplicitlyHasVars
      ? `用户草稿中已显式定义了模板变量，请规范保留对应的大括号变量占位符。`
      : `【关键交互准则 · 严禁生硬发明 Mustache 占位符】：除非用户草稿中已主动写有 {{变量}}，否则严禁自作聪明生成如 {{code_to_refactor}}、{{input_text}}、{{context}} 等未赋值的死板占位符！若该提示词需要接收用户后续输入（如代码、文本、业务数据），必须将其设计为“双态自适应交互协议”：\n1. 即时处理模式：若用户在发送指令时已直接附带了输入内容，跳过确认直接执行分析与处理；\n2. 待命就绪模式：若用户仅发送了提示词指令尚未附带内容，请指示 AI 仅简明回复一句话确认就绪（如：“专业架构师已就绪，请直接发送待优化的代码与业务要求”），并在用户后续发送内容后自动执行全部规则。\n确保用户复制提示词后直接粘贴进任何 AI 对话框均可丝滑开箱即用，无需用户手动寻找或修改任何占位符。`;

    systemPromptParts.push(`\n【核心输出规范】：直接输出优化后的完整提示词正文，严禁输出任何前后缀闲聊或外部解释。\n${variableInstruction}`);

    const resolvedDraft = resolvePromptReferences(draft, prompts, skills).resolvedText;
    // 注入提示词链路上下文（当前提示词有祖先节点时）
    if (chainAncestors.length > 0) {
      const chainCtx = chainAncestors
        .map((a, i) => '【链路第 ' + (i + 1) + ' 步 · ' + a.title + '】完整优化结果与规范：\n' + a.optimized)
        .join('\n\n');
      systemPromptParts.splice(1, 0, '\n【上游提示词链路全量上下文（强协同背景 · 绝对保真）】：\n当前提示词处于多步提示词工程链路的第 ' + (chainAncestors.length + 1) + ' 级节点。以下按执行顺序完整列出了前面 ' + chainAncestors.length + ' 级所有前置步骤的完整输出规范。请充分继承上游的业务设定、角色职责、输入输出 Schema 与核心约束，在此基础上对本次提示词进行紧密协同的设计与重构，确保多步工作流能够无缝衔接且上下文绝不丢失：\n\n' + chainCtx);
    }
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
      { role: 'system', content: systemPromptParts.join('\n') },
      { role: 'user', content: userContent },
    ];

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    // 智能标题自动重命名
    const isDefaultTitle = !title || title === '未命名提示词' || title === '新建提示词' || title.startsWith('新建');
    if (isDefaultTitle && draft.trim() && onAutoTitle) {
      const smartTitle = extractSmartTitleFromDraft(draft);
      onAutoTitle(smartTitle);
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

            const quality = calculatePromptQuality(telemetry.content, selectedFramework);
            const newVersionNumber = (versions.length || 0) + 1;
            await onSaveVersion({
              version: newVersionNumber,
              promptText: telemetry.content,
              instruction: `初始框架优化 (${selectedFramework})${referenceImages.length > 0 ? ' [含视觉参考图]' : ''}`,
              framework: selectedFramework,
              timestamp: Date.now(),
              tokenCount: telemetry.tokenCount,
              qualityScore: quality,
            });

            const detectedVars = syncVariables(variables, draft + '\n' + telemetry.content);
            onOptimizedChange(telemetry.content);
            onUpdateVariables(detectedVars);

            if (isDefaultTitle && draft.trim() && onAutoTitle) {
              onAutoTitle(extractSmartTitleFromDraft(draft));
            }

            setLiveStreamingText('');
          },
          onError: (err) => {
            setIsOptimizing(false);
            if (err === 'API_KEY_REQUIRED') {
              setApiKeyError(true);
              showToast('请先配置 API Key 或选择本地运行模式', 'error');
            } else {
              showToast(err || '生成失败，请检查模型与服务配置', 'error');
            }
          },
        },
        abortControllerRef.current.signal
      );
    } catch (err: any) {
      setIsOptimizing(false);
      showToast('优化请求失败: ' + (err?.message || '未知错误'), 'error');
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

    const currentBasePrompt = initialOptimized || draft;
    if (!currentBasePrompt) return;

    setIsOptimizing(true);
    setLiveStreamingText('');
    setFeedbackInput('');
    setIsEditing(false);

    const activeFw = allFrameworks.find((f) => f.id === selectedFramework);
    const systemPromptParts = [
      `你是一名世界顶尖的提示词工程架构师。用户的提示词已经有了前序优化版本。`,
      `你的任务是根据用户最新的【微调指令】，针对现有的提示词进行定向重构与迭代打磨。`,
      `目标工程重构框架：${activeFw?.name || selectedFramework} (${activeFw?.desc || ''})。${activeFw?.instruction ? `\n框架强制执行规范要求：${activeFw.instruction}` : ''}`,
    ];

    if (systemContext) {
      systemPromptParts.push(`\n【上级目录继承的全局背景与角色设定】：\n${systemContext}`);
    }
    if (domainRules) {
      systemPromptParts.push(`\n【上级目录继承的行业规则与边界约束】：\n${domainRules}`);
    }

    if (referenceImages.length > 0) {
      systemPromptParts.push(
        `\n【多模态视觉专家模式】：用户已提供参考图片（UI界面/设计稿/视觉意向）。请参照视觉参考图的设计系统、组件和色彩规范，确保微调迭代后的提示词保持高度保真。`
      );
    }

    const userExplicitlyHasVars = /\{\{\s*[^@\s][^\}]*\}\}/.test(draft) || /\{\{\s*[^@\s][^\}]*\}\}/.test(instruction);
    const variableInstruction = userExplicitlyHasVars
      ? `规范保留必要的大括号变量占位符。`
      : `【关键交互准则 · 严禁生硬发明 Mustache 占位符】：除非用户指令明确要求定义模板变量，否则严禁生成如 {{code_to_refactor}} 等未赋值的生硬占位符！输入承接必须设计为即时处理与待命就绪的双态自适应协议，确保用户复制后直接贴入任何 AI 对话框均可即刻开箱即用。`;

    systemPromptParts.push(`\n【核心输出规范】：直接输出微调修改后的完整提示词正文，不要输出多余解释或前后缀客套。\n${variableInstruction}`);

    const resolvedBasePrompt = resolvePromptReferences(currentBasePrompt, prompts, skills).resolvedText;
    // 注入提示词链路上下文
    if (chainAncestors.length > 0) {
      const chainCtx = chainAncestors
        .map((a, i) => '【链路第 ' + (i + 1) + ' 步 · ' + a.title + '】完整优化结果与规范：\n' + a.optimized)
        .join('\n\n');
      systemPromptParts.splice(1, 0, '\n【上游提示词链路全量上下文（强协同背景 · 绝对保真）】：\n当前提示词处于多步提示词工程链路的第 ' + (chainAncestors.length + 1) + ' 级节点。以下按执行顺序完整列出了前面 ' + chainAncestors.length + ' 级所有前置步骤的完整输出规范。请充分继承上游的业务设定、角色职责、输入输出 Schema 与核心约束，在此基础上对本次提示词进行紧密协同的设计与重构，确保多步工作流能够无缝衔接且上下文绝不丢失：\n\n' + chainCtx);
    }
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

    const historyTurnMessages: ChatMessage[] = (turns || []).slice(-6).map((t) => ({
      role: t.role,
      content: t.refinedPrompt || t.content,
    }));

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPromptParts.join('\n') },
      ...historyTurnMessages,
      { role: 'user', content: userContent },
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

            const quality = calculatePromptQuality(telemetry.content, selectedFramework);
            const newVersionNumber = (versions.length || 0) + 1;
            await onSaveVersion({
              version: newVersionNumber,
              promptText: telemetry.content,
              instruction,
              framework: selectedFramework,
              timestamp: Date.now(),
              tokenCount: telemetry.tokenCount,
              qualityScore: quality,
            });

            if (onAddTurn) {
              await onAddTurn({
                id: `turn-${Date.now()}-u`,
                role: 'user',
                content: instruction,
                timestamp: Date.now() - 500,
              });
              await onAddTurn({
                id: `turn-${Date.now()}-a`,
                role: 'assistant',
                content: telemetry.content,
                refinedPrompt: telemetry.content,
                timestamp: Date.now(),
                tokenCount: telemetry.tokenCount,
              });
            }

            const detectedVars = syncVariables(variables, draft + '\n' + telemetry.content);
            onOptimizedChange(telemetry.content);
            onUpdateVariables(detectedVars);

            setLiveStreamingText('');
          },
          onError: (err) => {
            setIsOptimizing(false);
            if (err === 'API_KEY_REQUIRED') {
              setApiKeyError(true);
              showToast('请先配置 API Key 或选择本地运行模式', 'error');
            } else {
              showToast(err || '微调失败，请检查服务连通性', 'error');
            }
          },
        },
        abortControllerRef.current.signal
      );
    } catch (err: any) {
      setIsOptimizing(false);
      showToast('微调请求失败: ' + (err?.message || '未知错误'), 'error');
    }
  };

  const displayedOptimized = liveStreamingText || initialOptimized;

  // 实时提示词健康体检与反模式安全审计分析报告
  const currentAuditText = displayedOptimized || draft || '';
  const currentAuditReport = useMemo(() => auditPrompt(currentAuditText), [currentAuditText]);

  const handleCopyCurrent = () => {
    if (!displayedOptimized) return;
    let textToCopy = displayedOptimized;

    // 若变量表中有用户已填写的非空值，自动代入变量
    if (variables && variables.length > 0) {
      const varMap: Record<string, string> = {};
      let hasFilled = false;
      for (const v of variables) {
        if (v.currentValue && v.currentValue.trim()) {
          varMap[v.name] = v.currentValue.trim();
          hasFilled = true;
        }
      }
      if (hasFilled) {
        textToCopy = substituteVariables(textToCopy, varMap);
      }
    }

    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    showToast('已复制到剪贴板，可直接粘贴至任何 AI 对话框开箱即用', 'success');
  };

  const handleAddVariableFromSelection = (name: string, defaultValue: string) => {
    if (!variables.some((v) => v.name === name)) {
      const next = [...variables, { name, defaultValue, currentValue: defaultValue }];
      onUpdateVariables(next);
    }
  };

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

  const latestScore = versions.length > 0 ? versions[versions.length - 1].qualityScore : null;
  const avgScore = latestScore
    ? Math.round((latestScore.clarity + latestScore.completeness + latestScore.structure) / 3)
    : 95;

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
            className="px-2.5 py-1 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 transition-colors text-xs flex-shrink-0 flex items-center gap-1 shadow-sm cursor-pointer"
          >
            配置密钥
          </button>
        </div>
      )}

      {/* 1. 精简架构选择栏 */}
      <div className="flex-shrink-0 flex items-center justify-between gap-2 px-3 py-1.5 bg-mac-surface backdrop-blur-xl border border-mac-border rounded-xl shadow-xs overflow-hidden">
        <div className="flex items-center gap-1.5 text-xs font-bold text-mac-textPrimary flex-shrink-0">
          <Sparkles size={13} strokeWidth={2} className="text-mac-accentBlue" />
          <span>优化架构</span>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none flex-1 justify-end py-0.5">
          {allFrameworks.map((fw) => {
            const isSelected = selectedFramework === fw.id;
            const isCustom = (fw as any).isCustom;
            return (
              <button
                key={fw.id}
                type="button"
                onClick={() => {
                  setSelectedFramework(fw.id);
                  onFrameworkChange(fw.id);
                }}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all flex items-center gap-1 flex-shrink-0 cursor-pointer ${
                  isSelected
                    ? 'bg-mac-accentBlue text-white shadow-xs font-semibold'
                    : 'text-mac-textSecondary hover:text-mac-textPrimary hover:bg-black/5'
                }`}
                title={`${fw.name}${fw.badge ? ` (${fw.badge})` : ''} — ${fw.desc}`}
              >
                <span>{fw.name}</span>

                {isCustom && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteCustomFramework(fw.id);
                      if (selectedFramework === fw.id) {
                        setSelectedFramework('CO-STAR');
                        onFrameworkChange('CO-STAR');
                      }
                    }}
                    className={`p-0.5 rounded transition-colors ml-0.5 ${
                      isSelected ? 'hover:bg-white/20 text-white/80 hover:text-white' : 'hover:bg-black/10 text-mac-textMuted hover:text-red-500'
                    }`}
                    title="删除此自定义框架"
                  >
                    <XIcon size={11} />
                  </span>
                )}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setIsCreateFrameworkOpen(true)}
            className="px-2 py-1 text-xs rounded-lg font-medium text-mac-accentPurple hover:bg-mac-accentPurple/10 border border-dashed border-mac-accentPurple/40 transition-all flex items-center gap-1 flex-shrink-0 cursor-pointer"
            title="添加自定义工程架构规范"
          >
            <PlusIcon size={12} strokeWidth={2} />
            <span>自定义</span>
          </button>
        </div>
      </div>

      {/* 2. 左右双栏：撑满剩余高度，支持自由拖拽分割 */}
      <div 
        ref={splitContainerRef}
        className={`flex-1 flex flex-col lg:flex-row gap-3 lg:gap-0 min-h-0 overflow-hidden relative ${
          isResizing ? 'cursor-col-resize select-none' : ''
        }`}
      >
        {/* 左栏：原始草稿需求 */}
        <div 
          style={{ flex: `0 0 ${leftWidthPercent}%` }}
          className="w-full lg:w-auto bg-mac-surface backdrop-blur-xl border border-mac-border rounded-2xl p-4 shadow-mac flex flex-col min-h-0 overflow-hidden"
        >
          {/* 左栏 Header */}
          <div className="flex-shrink-0 flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-mac-textPrimary flex items-center gap-1.5">
              <FileText size={14} strokeWidth={1.75} className="text-mac-textSecondary" />
              <span>原始草稿需求</span>
            </span>
            <div className="flex items-center gap-2">
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

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={referenceImages.length >= 3}
                className={`px-2 py-1 text-[11px] rounded-lg border transition-all flex items-center gap-1 font-medium ${
                  referenceImages.length > 0
                    ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800/60 text-indigo-700 dark:text-indigo-300 shadow-2xs'
                    : 'bg-mac-canvas border-mac-border text-mac-textSecondary hover:text-mac-textPrimary hover:bg-white dark:hover:bg-white/10'
                } disabled:opacity-40 cursor-pointer`}
                title="支持上传、拖拽或 Cmd+V 粘贴 1~3 张参考图"
              >
                <ImageIcon size={13} strokeWidth={1.75} className={referenceImages.length > 0 ? 'text-indigo-600 dark:text-indigo-400' : ''} />
                <span>上传参考图{referenceImages.length > 0 ? ` (${referenceImages.length}/3)` : ''}</span>
              </button>

              <span className="text-[11px] font-mono text-mac-textSecondary">
                {draft.length} 字符
              </span>
            </div>
          </div>

          {/* 上游链路指示条 */}
          {chainAncestors.length > 0 && (
            <div className="flex-shrink-0 mb-2.5 px-3 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs flex items-center justify-between">
              <div className="flex items-center gap-1.5 min-w-0">
                <GitFork size={13} className="text-purple-600 dark:text-purple-400 flex-shrink-0" />
                <span className="font-semibold text-purple-700 dark:text-purple-300 shrink-0">继承上游链路:</span>
                <span className="truncate text-purple-900 dark:text-purple-200 font-medium">
                  {chainAncestors.map((a) => a.title).join(' › ')}
                </span>
              </div>
              <span className="text-[10px] text-purple-600/90 dark:text-purple-400/90 font-mono flex-shrink-0 ml-2">
                已自动挂载上游完整上下文
              </span>
            </div>
          )}

          {/* 左栏输入区 */}
          <div 
            className={`flex-1 relative min-h-0 flex flex-col rounded-xl transition-all ${
              isDraggingOver ? 'ring-2 ring-indigo-500 bg-indigo-50/20 dark:bg-indigo-950/20' : ''
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
              onChange={(e) => handleDraftChangeInternal(e.target.value)}
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

            <MentionAutocomplete
              textareaRef={draftTextareaRef}
              value={draft}
              onSelect={(val) => {
                setDraft(val);
                handleDraftChangeInternal(val);
              }}
              currentPromptId={promptId}
            />

            <SelectionVariablePopover
              textareaRef={draftTextareaRef}
              value={draft}
              onChange={(newVal) => {
                setDraft(newVal);
                handleDraftChangeInternal(newVal);
              }}
              onAddVariable={handleAddVariableFromSelection}
            />

            {isDraggingOver && (
              <div className="absolute inset-0 bg-indigo-500/10 backdrop-blur-[1px] border-2 border-dashed border-indigo-500 rounded-xl flex items-center justify-center pointer-events-none z-10">
                <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-white/95 dark:bg-zinc-800/95 px-3 py-1.5 rounded-lg shadow-md flex items-center gap-1.5">
                  <ImageIcon size={14} strokeWidth={2} />
                  <span>释放鼠标以添加参考图 (最多 3 张)</span>
                </span>
              </div>
            )}

            {draftVoice.isListening && draftVoice.interimTranscript && (
              <div className="absolute left-3 bottom-2.5 z-10 max-w-[calc(100%-110px)] flex items-center gap-1.5 px-2.5 py-1 bg-purple-50/95 dark:bg-purple-950/90 border border-purple-200/90 dark:border-purple-800/80 text-purple-900 dark:text-purple-200 rounded-lg shadow-xs text-xs backdrop-blur-sm animate-fade-in pointer-events-none select-none">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-ping shrink-0" />
                <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300 shrink-0">正在识别:</span>
                <span className="text-[11px] italic truncate text-purple-950 dark:text-purple-100 font-medium">
                  "{draftVoice.interimTranscript}"
                </span>
              </div>
            )}

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
                    : 'bg-mac-surface dark:bg-white/[0.06] text-mac-textSecondary hover:text-mac-textPrimary hover:bg-black/5 dark:hover:bg-white/10 border-mac-border dark:border-white/10 shadow-xs'
                }`}
              >
                <Mic size={14} strokeWidth={draftVoice.isListening ? 2 : 1.75} className={draftVoice.isListening ? 'text-white' : ''} />
                {draftVoice.isListening ? (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-medium pr-0.5">聆听中</span>
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
                  <span className="text-[10px] text-mac-textMuted font-mono hidden sm:inline">⌥Space</span>
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
                  className="w-12 h-12 rounded-lg border border-dashed border-mac-border/80 dark:border-white/10 hover:border-indigo-400 bg-mac-surface dark:bg-white/[0.04] hover:bg-black/5 dark:hover:bg-white/10 flex flex-col items-center justify-center text-mac-textMuted hover:text-indigo-600 dark:hover:text-indigo-400 transition-all flex-shrink-0 cursor-pointer"
                  title="继续添加图片"
                >
                  <PlusIcon size={14} strokeWidth={2} />
                  <span className="text-[9px] mt-0.5">+图</span>
                </button>
              )}
              {!isVisionModel(apiConfig.model) && (
                <span className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 px-2 py-1 rounded-lg flex items-center gap-1 flex-shrink-0 ml-auto" title="当前模型无法识别视觉图片，发送时将自动剥离避免报错">
                  <AlertTriangle size={11} className="text-amber-500 flex-shrink-0" />
                  <span>当前模型不支持视觉，图片将自动略过</span>
                </span>
              )}
            </div>
          )}

          {/* 左栏 Footer */}
          <div className="flex-shrink-0 mt-3 pt-2 border-t border-mac-border/60 flex items-center justify-between">
            <span className="text-[11px] text-mac-textSecondary">
              支持 <code className="bg-black/5 dark:bg-white/10 px-1 py-0.5 rounded text-mac-accentPurple font-mono">{'{{variable}}'}</code> 自动提取
            </span>

            <button
              onClick={isOptimizing ? handleStopOptimization : handleStartOptimize}
              disabled={!isOptimizing && !draft.trim()}
              className={`px-4 py-2 text-xs font-bold text-white rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer ${
                isOptimizing
                  ? 'bg-rose-600 hover:bg-rose-500 active:scale-98 shadow-rose-500/20'
                  : 'bg-mac-accentBlue hover:bg-mac-accentBlueHover disabled:opacity-50'
              }`}
              title={isOptimizing ? '点击即可终止当前生成，并安全保留已生成的阶段性内容' : undefined}
            >
              {isOptimizing ? (
                <>
                  <Square size={13} fill="currentColor" strokeWidth={0} />
                  <span>停止生成 (保留断点)</span>
                </>
              ) : initialOptimized ? (
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

        {/* 自由拖拽分割线 Handle */}
        <div
          onMouseDown={handleSplitterMouseDown}
          onDoubleClick={() => {
            setLeftWidthPercent(50);
            try {
              localStorage.setItem('prompttune_split_ratio', '50');
            } catch {}
          }}
          className="hidden lg:flex items-center justify-center w-4 cursor-col-resize group shrink-0 relative z-30 select-none -mx-1"
          title="按住拖拽调节左右栏宽度 (双击快速复位 50:50 等宽)"
        >
          {/* 实时百分比浮动提示气泡 */}
          {isResizing && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none px-2.5 py-1 rounded-full bg-zinc-900/95 dark:bg-zinc-800/95 text-white text-[10px] font-mono font-semibold shadow-2xl border border-white/20 whitespace-nowrap z-50 flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-100">
              <span>{Math.round(leftWidthPercent)}%</span>
              <span className="opacity-40">|</span>
              <span>{Math.round(100 - leftWidthPercent)}%</span>
              {leftWidthPercent === 50 && (
                <span className="px-1 py-0.2 bg-mac-accentBlue/30 text-blue-300 rounded text-[9px]">居中</span>
              )}
            </div>
          )}

          {/* 拖拽把手指示条 */}
          <div className={`w-1.5 rounded-full transition-all duration-150 flex flex-col items-center justify-center gap-0.5 ${
            isResizing 
              ? 'bg-mac-accentBlue h-16 shadow-md' 
              : 'bg-black/15 dark:bg-white/20 group-hover:bg-mac-accentBlue/80 h-10 group-hover:h-14'
          }`}>
            <span className={`w-0.5 h-0.5 rounded-full ${isResizing ? 'bg-white' : 'bg-transparent group-hover:bg-white'}`} />
            <span className={`w-0.5 h-0.5 rounded-full ${isResizing ? 'bg-white' : 'bg-transparent group-hover:bg-white'}`} />
            <span className={`w-0.5 h-0.5 rounded-full ${isResizing ? 'bg-white' : 'bg-transparent group-hover:bg-white'}`} />
          </div>
        </div>

        {/* 右栏：优化成果 */}
        <div 
          style={{ flex: `1 1 0%` }}
          className="w-full lg:w-auto bg-mac-surface backdrop-blur-xl border border-mac-border rounded-2xl p-4 shadow-mac flex flex-col min-h-0 overflow-hidden"
        >
          {/* 右栏 Header：支持响应式弹性排列，绝不裁切遮挡右侧按钮 */}
          <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-y-1.5 gap-x-2 mb-2 min-w-0">
            <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
              <span className="text-xs font-semibold text-mac-textPrimary flex items-center gap-1 shrink-0 whitespace-nowrap">
                <Sparkles size={13.5} strokeWidth={1.75} className="text-mac-accentBlue shrink-0" />
                <span>优化成果 (v{versions.length || 1})</span>
              </span>

              {/* 实时健康体检与反模式安全审计徽章 (紧凑精致形态，省去冗长后缀) */}
              <button
                type="button"
                onClick={() => setIsAuditModalOpen(true)}
                className={`text-[10.5px] font-mono px-1.5 py-0.5 rounded-full font-bold shrink-0 whitespace-nowrap transition-all flex items-center gap-1 cursor-pointer shadow-2xs border ${
                  currentAuditReport.score >= 90
                    ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                    : currentAuditReport.score >= 75
                    ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30'
                    : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30'
                }`}
                title={`提示词健康体检得分: ${currentAuditReport.score}分 (等级 ${currentAuditReport.grade}) - 点击查看安全与反模式诊断详情`}
              >
                {currentAuditReport.score >= 90 ? (
                  <ShieldCheck size={11.5} strokeWidth={2.2} />
                ) : (
                  <ShieldAlert size={11.5} strokeWidth={2.2} />
                )}
                <span>{currentAuditReport.score}分</span>
                <span className="text-[9px] font-sans font-semibold opacity-85 px-1 py-0.2 rounded bg-black/[0.05] dark:bg-white/[0.08]">
                  {currentAuditReport.grade}
                </span>
              </button>
            </div>

            {/* 右侧动作工具栏：自适应弹性容器，小屏平滑容纳 */}
            <div className="flex items-center gap-1 shrink-0 flex-wrap sm:flex-nowrap">
              {headerExtra}

              {/* 视图切换分段器：透镜 / 高亮 */}
              <div className="flex items-center p-0.5 bg-black/[0.04] dark:bg-white/[0.06] rounded-lg border border-black/[0.04] dark:border-white/10 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowDiff(!showDiff)}
                  disabled={!displayedOptimized}
                  className={`px-1.5 py-0.5 text-xs rounded-md transition-all flex items-center gap-1 disabled:opacity-40 shrink-0 cursor-pointer ${
                    showDiff
                      ? 'bg-white dark:bg-white/15 text-mac-accentBlue dark:text-blue-300 shadow-2xs font-semibold'
                      : 'text-mac-textSecondary hover:text-mac-textPrimary'
                  }`}
                  title="对比原始草稿与优化成果的具体增删条款 (快捷键 Cmd+D)"
                >
                  <Columns2 size={12} strokeWidth={1.75} />
                  <span>{showDiff ? '正文' : '透镜'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSyntaxHighlightEnabled(!syntaxHighlightEnabled)}
                  disabled={!displayedOptimized || showDiff || isEditing}
                  className={`px-1.5 py-0.5 text-xs rounded-md transition-all flex items-center gap-1 disabled:opacity-40 shrink-0 cursor-pointer ${
                    syntaxHighlightEnabled
                      ? 'bg-white dark:bg-white/15 text-purple-600 dark:text-purple-300 shadow-2xs font-semibold'
                      : 'text-mac-textSecondary hover:text-mac-textPrimary'
                  }`}
                  title="切换变量与引用语法色彩高亮"
                >
                  <Code2 size={12} strokeWidth={1.75} />
                  <span>高亮</span>
                </button>
              </div>

              {/* 细分隔线 */}
              <div className="h-3 w-px bg-mac-border/80 dark:bg-white/10 shrink-0 mx-0.5" />

              {/* 快捷动作按钮组 (Icon Actions) */}
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={handleStartOptimize}
                  disabled={isOptimizing || !draft.trim()}
                  className="p-1 rounded-lg border border-mac-border dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10 text-mac-textSecondary hover:text-mac-accentBlue transition-all shadow-2xs disabled:opacity-40 shrink-0 cursor-pointer"
                  title="基于当前草稿与框架推翻重来，重新生成"
                >
                  <RotateCcw size={12} strokeWidth={2} className={isOptimizing ? 'animate-spin text-mac-accentBlue' : ''} />
                </button>

                {isEditing ? (
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    className="px-2 py-0.5 text-xs rounded-lg bg-mac-accentBlue text-white hover:bg-mac-accentBlueHover font-medium transition-all shadow-xs flex items-center gap-1 shrink-0 cursor-pointer"
                    title="保存微调修改为新版本"
                  >
                    <Check size={12} strokeWidth={2} />
                    <span>保存</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartEdit}
                    disabled={!displayedOptimized || isOptimizing}
                    className="p-1 rounded-lg border border-mac-border dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10 text-mac-textSecondary hover:text-mac-textPrimary transition-all shadow-2xs flex items-center justify-center disabled:opacity-40 shrink-0 cursor-pointer"
                    title="双击正文或点击编辑微调内容"
                  >
                    <Pencil size={12} strokeWidth={1.75} />
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleCopyCurrent}
                  disabled={!displayedOptimized}
                  className="p-1 rounded-lg border border-mac-border dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10 text-mac-textSecondary hover:text-mac-textPrimary transition-all shadow-2xs flex items-center justify-center disabled:opacity-40 shrink-0 cursor-pointer"
                  title="复制最新提示词 (Cmd+Shift+C)"
                >
                  {copied ? (
                    <Check size={12} strokeWidth={2} className="text-mac-accentGreen" />
                  ) : (
                    <Copy size={12} strokeWidth={1.75} />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('ab_test')}
                  className="p-1 rounded-lg border border-mac-border dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10 text-mac-textSecondary hover:text-mac-accentGreen transition-all shadow-2xs flex items-center justify-center shrink-0 cursor-pointer"
                  title="带入双轨 A/B 并发对比评测"
                >
                  <Zap size={12} strokeWidth={2} />
                </button>

                <button
                  type="button"
                  onClick={() => setIsCompressorOpen(true)}
                  disabled={!displayedOptimized || isOptimizing}
                  className="px-2 py-0.5 text-xs rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-medium transition-all shadow-2xs flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-40"
                  title="Token 智能瘦身透镜：无损剔除废话套话，极大削减 Token 消耗"
                >
                  <Zap size={11} strokeWidth={2.2} className="text-emerald-600 dark:text-emerald-400" />
                  <span>瘦身</span>
                </button>
              </div>

              {/* 细分隔线 */}
              <div className="h-3 w-px bg-mac-border/80 dark:bg-white/10 shrink-0 mx-0.5" />

              {/* 主工作流 CTA */}
              <button
                type="button"
                onClick={async () => {
                  if (mode === 'prompt' && promptId) {
                    await createChildPrompt(promptId);
                  } else if (mode === 'scratchpad') {
                    const newParentId = await archiveScratchpadToFolder(null);
                    await createChildPrompt(newParentId);
                  }
                }}
                className="px-2 py-0.5 text-xs rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium transition-all shadow-xs flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                title="以当前节点为前置上下文，新建下游链路子提示词"
              >
                <GitFork size={12} strokeWidth={2} />
                <span>继续链路</span>
              </button>
            </div>
          </div>

          {/* 右栏 Content */}
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
                className="flex-1 w-full bg-mac-canvas rounded-xl border border-mac-accentBlue/60 focus:ring-2 focus:ring-mac-accentBlue/20 p-3.5 text-xs text-mac-textPrimary font-mono leading-relaxed resize-none focus:outline-none shadow-inner overflow-y-auto min-h-0 select-text"
              />
            </div>
          ) : (
            <div
              onDoubleClick={handleStartEdit}
              title="双击直接进入编辑模式"
              className="flex-1 w-full bg-mac-canvas rounded-xl border border-mac-border dark:border-white/10 p-3.5 text-xs text-mac-textPrimary font-mono leading-relaxed overflow-y-auto whitespace-pre-wrap select-text cursor-text min-h-0"
            >
              {displayedOptimized ? (
                syntaxHighlightEnabled ? (
                  <PromptSyntaxHighlighter
                    content={displayedOptimized}
                    onDoubleClick={handleStartEdit}
                  />
                ) : (
                  displayedOptimized
                )
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

      {/* 3. 底部吸底微调栏 */}
      <div className="flex-shrink-0 bg-mac-surface backdrop-blur-xl border border-mac-border rounded-xl p-2 px-3 shadow-mac flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
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
            {feedbackVoice.isListening && feedbackVoice.interimTranscript && (
              <div className="absolute left-2 -top-8 z-20 flex items-center gap-1.5 px-2.5 py-1 bg-purple-50/95 dark:bg-purple-950/90 border border-purple-200/90 dark:border-purple-800/80 text-purple-900 dark:text-purple-200 rounded-lg shadow-xs text-xs backdrop-blur-sm animate-fade-in pointer-events-none select-none max-w-[85%]">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-ping shrink-0" />
                <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300 shrink-0">正在识别:</span>
                <span className="text-[11px] italic truncate text-purple-950 dark:text-purple-100 font-medium">
                  "{feedbackVoice.interimTranscript}"
                </span>
              </div>
            )}

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
                    : 'text-mac-textSecondary hover:text-mac-textPrimary hover:bg-black/5 dark:hover:bg-white/10'
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

          <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
            {QUICK_SUGGESTIONS.map((sug, idx) => (
              <button
                key={idx}
                disabled={isOptimizing}
                onClick={() => handleFollowupIterate(sug.prompt)}
                className="text-[11px] px-2 py-1 rounded-lg bg-black/[0.03] dark:bg-white/[0.06] hover:bg-mac-accentBlue/10 hover:text-mac-accentBlue border border-transparent hover:border-mac-accentBlue/30 text-mac-textSecondary dark:text-zinc-300 transition-all flex items-center gap-1 flex-shrink-0 cursor-pointer"
              >
                <span>{sug.label}</span>
              </button>
            ))}
          </div>

          <button
            onClick={() => handleFollowupIterate()}
            disabled={isOptimizing || !feedbackInput.trim()}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-mac-accentBlue hover:bg-mac-accentBlueHover disabled:opacity-50 rounded-lg shadow-xs transition-all flex items-center gap-1 flex-shrink-0 cursor-pointer"
          >
            <Send size={13} strokeWidth={2} />
            <span>微调</span>
          </button>
        </div>
      </div>

      {/* 创建自定义优化框架模态窗 (FEAT-5) */}
      <CreateFrameworkModal
        isOpen={isCreateFrameworkOpen}
        onClose={() => setIsCreateFrameworkOpen(false)}
        onCreated={(newId) => {
          setSelectedFramework(newId);
          onFrameworkChange(newId);
        }}
      />

      {/* 提示词深度健康体检与安全审计报告模态窗 */}
      <PromptAuditModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        promptText={displayedOptimized || draft}
        onApplyPatch={async (patched) => {
          onOptimizedChange(patched);
          await onSaveVersion({
            version: (versions.length || 0) + 1,
            promptText: patched,
            instruction: '安全体检加固补丁',
            framework: selectedFramework,
            timestamp: Date.now(),
            tokenCount: Math.ceil(patched.length / 3),
            qualityScore: { clarity: 98, completeness: 96, structure: 98 },
          });
          confetti({ particleCount: 35, spread: 65, origin: { y: 0.6 } });
        }}
      />

      {/* Token 智能瘦身透镜模态窗 */}
      <PromptCompressorModal
        isOpen={isCompressorOpen}
        onClose={() => setIsCompressorOpen(false)}
        originalText={displayedOptimized || draft}
        apiConfig={apiConfig}
        onApplyCompressed={async (compressed) => {
          onOptimizedChange(compressed);
          const nextVars = syncVariables(variables, (draft || '') + '\n' + compressed);
          await onUpdateVariables(nextVars);
          await onSaveVersion({
            version: (versions.length || 0) + 1,
            promptText: compressed,
            instruction: 'Token 无损智能瘦身',
            framework: selectedFramework,
            timestamp: Date.now(),
            tokenCount: Math.ceil(compressed.length / 3),
            qualityScore: { clarity: 99, completeness: 95, structure: 99 },
          });
          confetti({ particleCount: 40, spread: 65, origin: { y: 0.6 } });
          showToast('已成功采纳瘦身版本，并归档至版本历史', 'success');
        }}
      />
    </div>
  );
};
