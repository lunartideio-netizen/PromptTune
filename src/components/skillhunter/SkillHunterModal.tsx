import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { 
  X, 
  Sparkles, 
  Search, 
  GitBranch, 
  Check, 
  CheckCircle2,
  Loader2, 
  FolderPlus, 
  Mic, 
  Copy, 
  Zap, 
  ChevronRight,
  Rocket,
  Trash2,
  Pencil,
  BookOpen,
  Puzzle,
  RotateCw,
  Terminal,
  Cpu,
  Palette,
  BarChart3,
  PenLine,
  ShieldCheck,
  Code2,
  Globe,
  Brain,
  SlidersHorizontal,
  ShieldAlert,
  Workflow,
  LayoutGrid
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { 
  streamChat, 
  SKILL_DISTILLATION_SYSTEM_PROMPT, 
  MULTI_DIMENSIONAL_SKILL_SYNTHESIS_PROMPT,
  fetchOpenSourcePrompts,
  parsePartialJsonArray,
  syncVariables,
  OpenSourcePromptItem
} from '../../services/llmService';
import { getCachedSkillSearch, setCachedSkillSearch } from '../../services/db';
import { FrameworkType, SkillHunterResult, SkillCategory, SkillItem } from '../../types';
import { confirmAction } from '../../utils/dialog';

const POPULAR_DIRECTIONS = [
  { label: '前端 UI 设计', query: '前端 UI 设计', icon: Palette },
  { label: '高并发系统架构', query: '高并发系统架构', icon: Cpu },
  { label: '深入代码审查', query: '代码审查 Code Review', icon: Code2 },
  { label: '商业数据洞察', query: '商业数据分析', icon: BarChart3 },
  { label: '社交爆款文案', query: '小红书爆款文案', icon: PenLine },
  { label: 'Web 安全渗透', query: 'Web 安全渗透测试', icon: ShieldCheck },
];

const CATEGORIES: { id: SkillCategory; label: string; icon: React.ElementType }[] = [
  { id: 'all', label: '全部', icon: LayoutGrid },
  { id: 'coding', label: '编程架构', icon: Code2 },
  { id: 'design', label: '设计审美', icon: Palette },
  { id: 'business', label: '商业分析', icon: BarChart3 },
  { id: 'copywriting', label: '文案创意', icon: PenLine },
  { id: 'security', label: '安全运维', icon: ShieldCheck },
];

const CATEGORY_NAMES: Record<SkillCategory, string> = {
  all: '全部',
  coding: '编程架构',
  design: '设计审美',
  business: '商业分析',
  copywriting: '文案创意',
  security: '安全运维',
};

const CATEGORY_ICONS: Record<SkillCategory, React.ElementType | null> = {
  all: null,
  coding: Code2,
  design: Palette,
  business: BarChart3,
  copywriting: PenLine,
  security: ShieldCheck,
};

const SKELETON_SLOTS = [
  { label: '细分维度一 · 架构体系规划中...', hint: '正在解构分层架构、核心规范与领域模型' },
  { label: '细分维度二 · 交互动效推演中...', hint: '正在推演状态流转、微交互与边界响应机制' },
  { label: '细分维度三 · 规范防线构建中...', hint: '正在确立工程防御红线、性能优化与 a11y 约束' },
];

function detectSkillCategory(title: string, tags: string[] = [], desc: string = ''): SkillCategory {
  const text = `${title} ${tags.join(' ')} ${desc}`.toLowerCase();
  if (
    text.includes('ui') ||
    text.includes('ux') ||
    text.includes('前端') ||
    text.includes('设计') ||
    text.includes('视觉') ||
    text.includes('design') ||
    text.includes('css') ||
    text.includes('审美') ||
    text.includes('动效') ||
    text.includes('组件')
  ) {
    return 'design';
  }
  if (
    text.includes('文案') ||
    text.includes('小红书') ||
    text.includes('copywriting') ||
    text.includes('营销') ||
    text.includes('写作') ||
    text.includes('脚本') ||
    text.includes('公众号') ||
    text.includes('创意') ||
    text.includes('新媒体')
  ) {
    return 'copywriting';
  }
  if (
    text.includes('商业') ||
    text.includes('数据分析') ||
    text.includes('business') ||
    text.includes('财务') ||
    text.includes('运营') ||
    text.includes('增长') ||
    text.includes('金融') ||
    text.includes('市场')
  ) {
    return 'business';
  }
  if (
    text.includes('安全') ||
    text.includes('渗透') ||
    text.includes('security') ||
    text.includes('防御') ||
    text.includes('漏洞') ||
    text.includes('audit') ||
    text.includes('运维') ||
    text.includes('devops') ||
    text.includes('k8s') ||
    text.includes('docker')
  ) {
    return 'security';
  }
  return 'coding';
}

export const SkillHunterModal: React.FC = () => {
  const { 
    isSkillHunterOpen, 
    setIsSkillHunterOpen, 
    apiConfig, 
    createFolder, 
    createPrompt, 
    updatePrompt, 
    addPromptVersion,
    setActivePromptId,
    setActiveFolderId,
    skills,
    activeSkillCategory,
    setActiveSkillCategory,
    saveSkill,
    deleteSkill,
    applySkillToCurrent,
    assembleSkillToCurrent,
    cleanLegacySkillFolders,
    setActiveTab,
  } = useAppStore();

  // 保存技能成功 Toast 提示
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // 双 Tab 模式：'hunter' 全网 AI 猎手 | 'installed' 我的已装技能
  const [activeTabMode, setActiveTabMode] = useState<'hunter' | 'installed'>('hunter');

  // 猎手检索状态
  const [searchDirection, setSearchDirection] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isFromCache, setIsFromCache] = useState(false);
  const [cacheTime, setCacheTime] = useState<number | null>(null);
  const [activePhase, setActivePhase] = useState<'idle' | 'raw_search' | 'distill' | 'stream_json' | 'done'>('idle');
  const [statusLog, setStatusLog] = useState('');

  // 渐进式流式卡片与输出日志
  const [partialSkills, setPartialSkills] = useState<(SkillHunterResult | null)[]>([null, null, null]);
  const [liveStreamingText, setLiveStreamingText] = useState('');
  const [results, setResults] = useState<SkillHunterResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<SkillHunterResult | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 我的已装技能相关状态
  const [installedSearch, setInstalledSearch] = useState('');
  const [selectedInstalledSkill, setSelectedInstalledSkill] = useState<SkillItem | null>(null);
  const [isEditingInstalled, setIsEditingInstalled] = useState(false);
  const [editSkillForm, setEditSkillForm] = useState<SkillItem | null>(null);

  const voice = useVoiceInput();
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isSkillHunterOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 120);
      if (skills.length > 0 && !selectedInstalledSkill) {
        setSelectedInstalledSkill(skills[0]);
      }
    } else {
      voice.stopListening();
      setIsEditingInstalled(false);
      setEditSkillForm(null);
    }
  }, [isSkillHunterOpen]);

  useEffect(() => {
    if (skills.length > 0 && (!selectedInstalledSkill || !skills.some(s => s.id === selectedInstalledSkill.id))) {
      setSelectedInstalledSkill(skills[0]);
    }
  }, [skills]);

  if (!isSkillHunterOpen) return null;

  // 核心执行逻辑：本地秒级缓存优先 + 渐进式流式骨架逐个点亮 + 零无谓延时
  const handleHunt = async (queryText?: string, forceRefresh = false) => {
    const query = (queryText !== undefined ? queryText : searchDirection).trim();
    if (!query) return;

    setSearchDirection(query);

    // 第一优先级：检查本地持久化 Dexie 缓存（除非用户显式点击重新联网刷新）
    if (!forceRefresh) {
      const cached = await getCachedSkillSearch(query);
      if (cached && cached.results && cached.results.length > 0) {
        setIsFromCache(true);
        setCacheTime(cached.updatedAt);
        setResults(cached.results);
        setPartialSkills(cached.results);
        setSelectedResult(cached.results[0]);
        setIsSearching(false);
        setActivePhase('done');
        setStatusLog(`本地秒级命中已缓存的 ${cached.results.length} 个工业级技能条目`);
        return;
      }
    }

    // 未命中缓存或强制刷新：立即切入实时流式推演
    setIsSearching(true);
    setIsFromCache(false);
    setCacheTime(null);
    setResults([]);
    setSelectedResult(null);
    setPartialSkills([null, null, null]);
    setLiveStreamingText('');
    setActivePhase('raw_search');
    setStatusLog(`正在全网开源 Prompts 仓库实时检索与「${query}」匹配的条目...`);

    // Level 1: 真实开源 RAW 文件检索（原汁原味开源版）
    let rawMatches: OpenSourcePromptItem[] = [];
    try {
      rawMatches = await fetchOpenSourcePrompts(query, 12);
    } catch {
      rawMatches = [];
    }

    // 命中真实开源仓库提示词：100% 还原开源社区原文，绝不调用大模型过度包装（杜绝出现“架构师”等浮夸人设与双括号）
    // 命中真实开源仓库提示词：100% 还原开源社区原文，绝不调用大模型过度包装
    if (rawMatches.length > 0) {
      const pureSkills: SkillHunterResult[] = rawMatches.map((match, idx) => ({
        id: `hunted-raw-${Date.now()}-${idx}`,
        title: match.act, // 100% 原始开源名称
        dimension: '开源精选原版',
        repoName: match.repoName,
        repoUrl: match.repoUrl,
        techStack: ['开源原生', '真实条目'],
        description: match.prompt.length > 85 ? match.prompt.slice(0, 85) + '...' : match.prompt,
        rawContent: match.prompt,
        distilledPrompt: match.prompt, // 100% 真实开源 Prompt 原文
        framework: 'ROLE_TASK_FORMAT',
        tags: [query, match.act, '开源原版'],
        systemPersona: match.prompt,
        workflow: '开源社区经过数万开发者实测验证的高赞提示词，无需变量填空，直接复制或装配即可使用。',
        guardrails: '遵守该角色的开源设定与上下文指导。',
        variables: [],
      }));

      setResults(pureSkills);
      setPartialSkills(pureSkills);
      setSelectedResult(pureSkills[0]);
      setIsSearching(false);
      setActivePhase('done');
      setStatusLog(`开源库精准命中 ${pureSkills.length} 个与「${query}」相关的真实原生提示词`);

      await setCachedSkillSearch(query, pureSkills);
      return;
    }

    // 若开源库未直接收录该专有词（0 条命中），才启动 Level 2 高维多维 AI 动态衍生兜底
    const finalSkills: SkillHunterResult[] = [];
    const startIndex = 0;
    const neededCount = 3;
    setActivePhase('stream_json');
    setStatusLog(`正在紧扣「${query}」进行多维专家技能批量推演 (流式逐个点亮)...`);

      let accumulatedStreamText = '';

      try {
        await streamChat(
          [
            { role: 'system', content: MULTI_DIMENSIONAL_SKILL_SYNTHESIS_PROMPT },
            {
              role: 'user',
              content: `用户搜索的具体技术与业务方向：【${query}】\n请为该方向一次性生成 ${neededCount} 个不同细分技术维度、互补的顶级 AI 专家技能 JSON 数组。`,
            },
          ],
          apiConfig,
          {
            onChunk: (_c, acc) => {
              accumulatedStreamText = acc;
              setLiveStreamingText(acc);

              // 增量解析当前流中已闭合输出的每个完整对象
              const parsedItems = parsePartialJsonArray<any>(acc);

              if (parsedItems.length > 0) {
                setPartialSkills((prev) => {
                  const next = [...prev];
                  parsedItems.slice(0, neededCount).forEach((pItem, pIdx) => {
                    const targetSlot = startIndex + pIdx;
                    if (targetSlot < 3 && !next[targetSlot]) {
                      const newSkill: SkillHunterResult = {
                        id: `hunted-synth-${Date.now()}-${targetSlot}`,
                        title: pItem.title || `${query} · 权威专家模型 (${targetSlot + 1})`,
                        dimension: pItem.dimension || `维度 ${targetSlot + 1}`,
                        repoName: 'AI Engineered Specification',
                        repoUrl: 'https://github.com',
                        techStack: Array.isArray(pItem.techStack) && pItem.techStack.length > 0 ? pItem.techStack : [query, '生产规范', '工业架构'],
                        description: pItem.description || `针对 ${query} 领域的${pItem.dimension || '专业级'}专家体系`,
                        rawContent: pItem.distilledPrompt || '',
                        distilledPrompt: pItem.distilledPrompt || pItem.systemPersona || '',
                        framework: (pItem.framework as FrameworkType) || (targetSlot === 0 ? 'CO-STAR' : targetSlot === 1 ? 'CRISPE' : 'ROLE_TASK_FORMAT'),
                        tags: [query, pItem.dimension || 'Expert'],
                        systemPersona: pItem.systemPersona || `你是一位世界级权威的 ${query} 专家。`,
                        workflow: pItem.workflow || '1. 业务目标定义；2. 架构方案推演；3. 生产级高保真输出。',
                        guardrails: pItem.guardrails || '杜绝幻觉与空泛废话，严格遵守生产规范。',
                        variables: Array.isArray(pItem.variables) && pItem.variables.length > 0 ? pItem.variables : ['目标需求', '约束规范'],
                      };
                      next[targetSlot] = newSkill;
                      if (!selectedResult && targetSlot === 0) {
                        setSelectedResult(newSkill);
                      }
                    }
                  });
                  return next;
                });
              }
            },
            onDone: () => {},
            onError: () => {},
          }
        );

        // 最终兜底解析确认
        let finalArray: any[] = parsePartialJsonArray<any>(accumulatedStreamText);
        if (finalArray.length === 0) {
          const matchArr = accumulatedStreamText.match(/\[[\s\S]*\]/);
          if (matchArr) {
            try { finalArray = JSON.parse(matchArr[0]); } catch {}
          }
        }

        finalArray.slice(0, neededCount).forEach((item, idx) => {
          const targetSlot = startIndex + idx;
          if (targetSlot < 3) {
            const skillItem: SkillHunterResult = {
              id: `hunted-synth-${Date.now()}-${targetSlot}`,
              title: item.title || `${query} · 权威专家模型 (${targetSlot + 1})`,
              dimension: item.dimension || `维度 ${targetSlot + 1}`,
              repoName: 'AI Engineered Specification',
              repoUrl: 'https://github.com',
              techStack: Array.isArray(item.techStack) && item.techStack.length > 0 ? item.techStack : [query, '生产规范', '工业架构'],
              description: item.description || `针对 ${query} 领域的${item.dimension || '专业级'}专家体系`,
              rawContent: item.distilledPrompt || '',
              distilledPrompt: item.distilledPrompt || item.systemPersona || '',
              framework: (item.framework as FrameworkType) || (targetSlot === 0 ? 'CO-STAR' : targetSlot === 1 ? 'CRISPE' : 'ROLE_TASK_FORMAT'),
              tags: [query, item.dimension || 'Expert'],
              systemPersona: item.systemPersona || `你是一位世界级权威的 ${query} 专家。`,
              workflow: item.workflow || '1. 业务目标定义；2. 架构方案推演；3. 生产级高保真输出。',
              guardrails: item.guardrails || '杜绝幻觉与空泛废话，严格遵守生产规范。',
              variables: Array.isArray(item.variables) && item.variables.length > 0 ? item.variables : ['目标需求', '约束规范'],
            };
            finalSkills.push(skillItem);
          }
        });
      } catch (err: any) {
        console.error('Level 2 衍生异常:', err);
      }

    // 完成全部流式生成，入库 Dexie 缓存
    const completeSkills = finalSkills.filter(Boolean);
    if (completeSkills.length > 0) {
      setResults(completeSkills);
      setPartialSkills(completeSkills);
      if (!selectedResult) {
        setSelectedResult(completeSkills[0]);
      }
      await setCachedSkillSearch(query, completeSkills);
    }

    setIsSearching(false);
    setActivePhase('done');
    setStatusLog(`就绪！成功为「${query}」呈现 ${completeSkills.length} 个权威级垂直专家技能`);
  };

  // 动作 1: 直接应用（替换当前草稿并设置框架）
  const handleApplySkill = (skill: SkillHunterResult | SkillItem) => {
    const category = ('category' in skill ? skill.category : detectSkillCategory(skill.title, skill.tags, skill.description)) as SkillCategory;
    applySkillToCurrent({
      id: skill.id,
      title: skill.title,
      dimension: skill.dimension,
      category,
      framework: skill.framework,
      description: skill.description,
      systemPersona: skill.systemPersona,
      workflow: skill.workflow,
      guardrails: skill.guardrails,
      variables: skill.variables,
      distilledPrompt: skill.distilledPrompt,
      techStack: skill.techStack,
      sourceRepo: 'repoName' in skill ? skill.repoName : skill.sourceRepo,
      sourceStars: 'stars' in skill ? skill.stars : (skill as SkillItem).sourceStars,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    confetti({
      particleCount: 40,
      spread: 60,
      origin: { y: 0.6, x: 0.5 },
      colors: ['#4F46E5', '#7C3AED', '#EC4899', '#10B981'],
    });

    setActiveTab('optimize');
    setIsSkillHunterOpen(false);
  };

  // 动作 2: 一键装配（将专家人设与工作流上下文注入当前提示词中）
  const handleAssembleSkill = (skill: SkillHunterResult | SkillItem) => {
    const category = ('category' in skill ? skill.category : detectSkillCategory(skill.title, skill.tags, skill.description)) as SkillCategory;
    assembleSkillToCurrent({
      id: skill.id,
      title: skill.title,
      dimension: skill.dimension,
      category,
      framework: skill.framework,
      description: skill.description,
      systemPersona: skill.systemPersona,
      workflow: skill.workflow,
      guardrails: skill.guardrails,
      variables: skill.variables,
      distilledPrompt: skill.distilledPrompt,
      techStack: skill.techStack,
      sourceRepo: 'repoName' in skill ? skill.repoName : skill.sourceRepo,
      sourceStars: 'stars' in skill ? skill.stars : (skill as SkillItem).sourceStars,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    confetti({
      particleCount: 45,
      spread: 65,
      origin: { y: 0.6, x: 0.5 },
      colors: ['#8B5CF6', '#3B82F6', '#10B981'],
    });

    setActiveTab('optimize');
    setIsSkillHunterOpen(false);
  };

  // 动作 3: 保存到技能库 (纯净保存到 Dexie skills 表，彻底解耦项目资源库)
  const handleImportToLibrary = async (skill: SkillHunterResult) => {
    setImportingId(skill.id);
    try {
      const category = detectSkillCategory(skill.title, skill.tags, skill.description);
      const existing = skills.find(
        (s) => s.title.trim().toLowerCase() === skill.title.trim().toLowerCase()
      );

      const skillItem: SkillItem = {
        id: existing ? existing.id : `skill-${Date.now()}`,
        title: skill.title,
        dimension: skill.dimension,
        category,
        framework: skill.framework,
        description: skill.description,
        systemPersona: skill.systemPersona,
        workflow: skill.workflow,
        guardrails: skill.guardrails,
        variables: skill.variables,
        distilledPrompt: skill.distilledPrompt,
        techStack: skill.techStack,
        sourceRepo: skill.repoName,
        sourceStars: skill.stars,
        createdAt: existing ? existing.createdAt : Date.now(),
        updatedAt: Date.now(),
      };

      // 仅持久化至 Dexie 的 skills 表，严禁在左侧文件树中创建任何文件夹或提示词
      await saveSkill(skillItem);

      // 自动静默清理任何历史误建的以 Skill - 开头的文件夹与条目
      await cleanLegacySkillFolders();

      setSelectedInstalledSkill(skillItem);

      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.65, x: 0.65 },
        colors: ['#4F46E5', '#10B981', '#F59E0B'],
      });

      setSaveSuccessMsg(`已成功保存至「我的已装技能」！可在对应 Tab 查看，或在任意编辑器输入 @ 智能装配`);
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } catch (err: any) {
      alert('入库失败: ' + err.message);
    } finally {
      setImportingId(null);
    }
  };

  const handleCopySkill = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleDeleteInstalled = async (id: string, title: string) => {
    if (await confirmAction(`确定要彻底卸载并删除技能「${title}」吗？`)) {
      await deleteSkill(id);
      if (selectedInstalledSkill?.id === id) {
        const remaining = skills.filter((s) => s.id !== id);
        setSelectedInstalledSkill(remaining.length > 0 ? remaining[0] : null);
      }
    }
  };

  const handleSaveSkillEdit = async () => {
    if (!editSkillForm) return;
    await saveSkill(editSkillForm);
    setSelectedInstalledSkill(editSkillForm);
    setIsEditingInstalled(false);
  };

  // 严格根据分类筛选和搜索过滤已装技能
  const filteredInstalledSkills = skills.filter((skill) => {
    const matchCat = activeSkillCategory === 'all' || skill.category === activeSkillCategory;
    if (!matchCat) return false;
    if (!installedSearch.trim()) return true;
    const q = installedSearch.toLowerCase();
    return (
      skill.title.toLowerCase().includes(q) ||
      skill.description.toLowerCase().includes(q) ||
      skill.framework.toLowerCase().includes(q) ||
      skill.distilledPrompt.toLowerCase().includes(q) ||
      (skill.dimension && skill.dimension.toLowerCase().includes(q))
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-sm animate-fade-in p-4">
      {/* 弹窗核心容器：纯浅色燕麦风 Oatmeal (#FAF9F6 / #F4F2EB)，固定锁定 85vh */}
      <div className="bg-[#FAF9F6] border border-[#E5E2D9] rounded-2xl shadow-macModal w-full max-w-5xl max-h-[85vh] h-[85vh] flex flex-col overflow-hidden text-[#2C2A29]">
        {/* Header 顶栏 */}
        <div className="px-5 py-3 border-b border-[#E5E2D9] flex items-center justify-between bg-[#F4F2EB]/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-xs shrink-0">
              <Sparkles size={18} strokeWidth={2} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[#2C2A29]">
                  AI 技能中心 (AI Skill Hub)
                </h2>
              </div>
            </div>
          </div>

          {/* 双 Tab 模式切换器 */}
          <div className="flex items-center p-0.5 bg-black/5 rounded-xl border border-black/5 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTabMode('hunter')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                activeTabMode === 'hunter'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-[#6E6B65] hover:text-[#2C2A29]'
              }`}
            >
              <Sparkles size={13} strokeWidth={1.75} />
              <span>全网 AI 猎手</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTabMode('installed')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                activeTabMode === 'installed'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-[#6E6B65] hover:text-[#2C2A29]'
              }`}
            >
              <BookOpen size={13} strokeWidth={1.75} />
              <span>我的已装技能</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                activeTabMode === 'installed' ? 'bg-indigo-100 text-indigo-800 font-bold' : 'bg-black/10 text-[#6E6B65]'
              }`}>
                {skills.length}
              </span>
            </button>
          </div>

          <button
            onClick={() => setIsSkillHunterOpen(false)}
            className="p-1.5 rounded-lg text-[#6E6B65] hover:text-[#2C2A29] hover:bg-black/5 transition-colors cursor-pointer shrink-0"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        {/* 全局保存成功 Toast 胶囊 */}
        {saveSuccessMsg && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 bg-indigo-900/90 backdrop-blur-md text-white text-xs font-medium px-4 py-2 rounded-xl shadow-xl flex items-center gap-2 border border-indigo-400/30 animate-fade-in pointer-events-auto">
            <CheckCircle2 size={15} strokeWidth={2} className="text-emerald-400 shrink-0" />
            <span>{saveSuccessMsg}</span>
            <button
              onClick={() => { setActiveTabMode('installed'); setSaveSuccessMsg(null); }}
              className="ml-2 px-2 py-0.5 rounded-md bg-white/20 hover:bg-white/30 text-white font-semibold text-[11px] transition-colors"
            >
              查看技能 →
            </button>
          </div>
        )}

        {/* ----------------- TAB 1: 全网 AI 猎手 ----------------- */}
        {activeTabMode === 'hunter' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#FAF9F6]">
            {/* 搜索与语音输入区 */}
            <div className="p-4 border-b border-[#E5E2D9] bg-white/70 space-y-3 shrink-0">
              <div className="flex items-center gap-2">
                <div className="relative flex-1 flex items-center">
                  <Search size={16} strokeWidth={1.75} className="absolute left-3 text-[#6E6B65] pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="输入具体的业务或技术方向，如：“前端 UI 设计”、“分布式存储架构”、“小红书文案”..."
                    value={searchDirection}
                    onChange={(e) => setSearchDirection(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleHunt();
                    }}
                    className="w-full text-xs pl-9 pr-12 py-2.5 bg-white rounded-xl border border-[#DCD8CD] focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500 text-[#2C2A29] shadow-2xs"
                  />

                  {/* 语音听写正在识别预览徽标 */}
                  {voice.isListening && voice.interimTranscript && (
                    <div className="absolute left-9 -bottom-8 z-20 flex items-center gap-1.5 px-2.5 py-1 bg-purple-50/95 border border-purple-200/90 text-purple-900 rounded-lg shadow-xs text-xs backdrop-blur-sm animate-fade-in pointer-events-none select-none max-w-[85%]">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-ping shrink-0" />
                      <span className="text-[10px] font-bold text-purple-700 shrink-0">正在识别:</span>
                      <span className="text-[11px] italic truncate text-purple-950 font-medium">
                        "{voice.interimTranscript}"
                      </span>
                    </div>
                  )}

                  {/* 语音输入按钮 */}
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center">
                    {voice.isListening && (
                      <span
                        className="absolute inset-0 rounded-lg bg-purple-500/25 pointer-events-none transition-transform duration-100 ease-out"
                        style={{
                          transform: `scale(${1 + (voice.volume / 100) * 0.45})`,
                          opacity: Math.max(0.35, voice.volume / 100),
                        }}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        voice.toggleListening((finalChunk) => {
                          setSearchDirection((prev) => (prev ? `${prev} ${finalChunk}` : finalChunk));
                        });
                      }}
                      title={voice.isListening ? `正在听写 (音量: ${voice.volume}% · 点击停止)` : '点击开启语音输入'}
                      className={`relative p-1.5 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                        voice.isListening
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-[#6E6B65] hover:text-[#2C2A29] hover:bg-black/5'
                      }`}
                    >
                      <Mic size={14} strokeWidth={voice.isListening ? 2 : 1.75} className={voice.isListening ? 'text-white' : ''} />
                      {voice.isListening && (
                        <div className="flex items-center gap-0.5 h-2.5 px-0.5">
                          <span
                            className="w-0.5 bg-white/90 rounded-full transition-all duration-75"
                            style={{ height: `${Math.max(2, Math.min(8, 2 + (voice.volume * 0.06)))}px` }}
                          />
                          <span
                            className="w-0.5 bg-white rounded-full transition-all duration-75"
                            style={{ height: `${Math.max(3, Math.min(10, 3 + (voice.volume * 0.1)))}px` }}
                          />
                          <span
                            className="w-0.5 bg-white/90 rounded-full transition-all duration-75"
                            style={{ height: `${Math.max(2, Math.min(7, 2 + (voice.volume * 0.05)))}px` }}
                          />
                        </div>
                      )}
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => handleHunt()}
                  disabled={isSearching}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-xl shadow-xs transition-all flex items-center gap-1.5 flex-nowrap shrink-0 whitespace-nowrap cursor-pointer"
                >
                  {isSearching ? (
                    <>
                      <Loader2 size={14} strokeWidth={2} className="animate-spin" />
                      <span>正在提炼...</span>
                    </>
                  ) : (
                    <>
                      <Zap size={14} strokeWidth={2} />
                      <span>全网猎取 Skill</span>
                    </>
                  )}
                </button>
              </div>

              {/* 推荐垂直方向药丸 */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-[#6E6B65] mr-1 shrink-0 whitespace-nowrap">推荐垂直方向：</span>
                {POPULAR_DIRECTIONS.map((dir) => {
                  const Icon = dir.icon;
                  return (
                    <button
                      key={dir.label}
                      onClick={() => handleHunt(dir.query)}
                      className="px-2.5 py-1 text-[11px] rounded-lg bg-[#F4F2EB] hover:bg-indigo-50 text-[#6E6B65] hover:text-indigo-600 border border-[#E5E2D9] transition-all shadow-2xs font-medium cursor-pointer flex items-center gap-1 flex-nowrap shrink-0 whitespace-nowrap"
                    >
                      <Icon size={12} strokeWidth={1.75} className="text-indigo-600/70" />
                      <span>{dir.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 流水线状态条 */}
            {isSearching && (
              <div className="px-5 py-2 bg-indigo-50/70 border-b border-indigo-100/90 flex items-center justify-between text-xs animate-fade-in shrink-0">
                <div className="flex items-center gap-3">
                  <div className={`flex items-center gap-1.5 ${activePhase === 'raw_search' ? 'text-indigo-600 font-bold animate-pulse' : 'text-[#6E6B65]'}`}>
                    <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center">1</span>
                    <span>开源 RAW 匹配</span>
                  </div>
                  <ChevronRight size={12} strokeWidth={2} className="text-[#9E9B95]" />

                  <div className={`flex items-center gap-1.5 ${activePhase === 'distill' ? 'text-indigo-600 font-bold animate-pulse' : 'text-[#6E6B65]'}`}>
                    <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center">2</span>
                    <span>条目穿透抓取</span>
                  </div>
                  <ChevronRight size={12} strokeWidth={2} className="text-[#9E9B95]" />

                  <div className={`flex items-center gap-1.5 ${activePhase === 'stream_json' ? 'text-purple-600 font-bold animate-pulse' : 'text-[#6E6B65]'}`}>
                    <span className="w-4 h-4 rounded-full bg-purple-600 text-white text-[10px] flex items-center justify-center">3</span>
                    <span>多维流式推演</span>
                  </div>
                  <ChevronRight size={12} strokeWidth={2} className="text-[#9E9B95]" />

                  <div className="flex items-center gap-1.5 text-emerald-600 font-bold">
                    <span className="w-4 h-4 rounded-full bg-emerald-600 text-white text-[10px] flex items-center justify-center">4</span>
                    <span>逐个点亮就绪</span>
                  </div>
                </div>

                <span className="text-[11px] font-mono text-indigo-700 font-medium truncate max-w-md">
                  {statusLog}
                </span>
              </div>
            )}

            {/* 双栏内容区：左侧 360px 骨架/卡片独立滚动，右侧自适应弹性流式推理或预览 */}
            <div className="flex-1 flex overflow-hidden min-h-0">
              {isSearching || results.length > 0 ? (
                <>
                  {/* 左栏：技能卡片列表或 3 张动态微光骨架卡片 */}
                  <div className="w-80 md:w-[360px] border-r border-[#E5E2D9] overflow-y-auto p-3 space-y-2.5 bg-[#F4F2EB]/50 shrink-0 min-h-0">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#6E6B65] px-1 mb-0.5 flex items-center justify-between">
                      <span>{isSearching ? '正在渐进式流式推演 (逐个点亮)...' : `精选垂直技能 (${results.length})`}</span>
                      {isSearching && (
                        <span className="inline-flex items-center gap-1 text-indigo-600 text-[10px]">
                          <Loader2 size={10} className="animate-spin" />
                          <span>生成中</span>
                        </span>
                      )}
                    </div>

                    {/* 搜索中展示骨架槽位，搜索完成展示全部匹配的真实开源技能卡片 */}
                    {isSearching ? (
                      [0, 1, 2].map((idx) => {
                        const item = partialSkills[idx];
                        const skeletonInfo = SKELETON_SLOTS[idx];

                        if (!item) {
                          return (
                            <div
                              key={`skeleton-${idx}`}
                              className="p-3 rounded-xl border border-dashed border-[#DCD8CD] bg-white/60 relative overflow-hidden transition-all shadow-2xs"
                            >
                              <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-white/80 to-transparent pointer-events-none" />
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] font-semibold text-indigo-600/90 flex items-center gap-1.5 font-mono">
                                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping inline-block" />
                                  <span>{skeletonInfo.label}</span>
                                </span>
                                <span className="w-12 h-3.5 rounded bg-black/[0.06] animate-pulse" />
                              </div>
                              <p className="text-[11px] text-[#9E9B95] leading-relaxed mb-2.5">
                                {skeletonInfo.hint}
                              </p>
                              <div className="space-y-1.5 mb-2">
                                <div className="h-2.5 bg-black/[0.05] rounded w-4/5 animate-pulse" />
                                <div className="h-2.5 bg-black/[0.05] rounded w-3/5 animate-pulse" />
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-[#9E9B95] pt-1.5 border-t border-[#E5E2D9]/40">
                                <div className="h-2.5 w-16 bg-black/[0.04] rounded" />
                                <div className="h-2.5 w-10 bg-black/[0.04] rounded" />
                              </div>
                            </div>
                          );
                        }

                        const isSelected = selectedResult?.id === item.id;
                        return (
                          <div
                            key={item.id}
                            onClick={() => setSelectedResult(item)}
                            className={`p-3 rounded-xl border transition-all cursor-pointer animate-fade-in ${
                              isSelected
                                ? 'bg-white border-indigo-500 shadow-sm ring-1 ring-indigo-500/20'
                                : 'bg-white/85 hover:bg-white border-[#E5E2D9] hover:shadow-2xs'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-bold text-[#2C2A29] truncate flex-1">
                                {item.title}
                              </span>
                              {item.dimension && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 font-semibold border border-purple-200/60 ml-2 shrink-0">
                                  {item.dimension}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-[#6E6B65] line-clamp-2 leading-relaxed mb-2">
                              {item.description}
                            </p>
                            <div className="flex items-center justify-between text-[10px] text-[#9E9B95] pt-1.5 border-t border-[#E5E2D9]/60">
                              <span className="font-mono flex items-center gap-1 truncate max-w-[150px]">
                                <GitBranch size={12} strokeWidth={1.75} />
                                <span className="truncate">{item.repoName}</span>
                              </span>
                              <span className="px-1.5 py-0.2 bg-black/[0.04] rounded font-mono text-[#2C2A29]">
                                {item.framework}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      results.map((item) => {
                        const isSelected = selectedResult?.id === item.id;
                        return (
                          <div
                            key={item.id}
                            onClick={() => setSelectedResult(item)}
                            className={`p-3 rounded-xl border transition-all cursor-pointer animate-fade-in ${
                              isSelected
                                ? 'bg-white border-indigo-500 shadow-sm ring-1 ring-indigo-500/20'
                                : 'bg-white/85 hover:bg-white border-[#E5E2D9] hover:shadow-2xs'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-bold text-[#2C2A29] truncate flex-1">
                                {item.title}
                              </span>
                              {item.dimension && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200/60 ml-2 shrink-0">
                                  {item.dimension}
                                </span>
                              )}
                            </div>

                            <p className="text-[11px] text-[#6E6B65] line-clamp-2 leading-relaxed mb-2">
                              {item.description}
                            </p>

                            <div className="flex items-center justify-between text-[10px] text-[#9E9B95] pt-1.5 border-t border-[#E5E2D9]/60">
                              <span className="font-mono flex items-center gap-1 truncate max-w-[130px]">
                                <GitBranch size={12} strokeWidth={1.75} />
                                <span className="truncate">{item.repoName}</span>
                              </span>
                              <div className="flex items-center gap-1 overflow-hidden">
                                {item.techStack && item.techStack.length > 0 ? (
                                  item.techStack.slice(0, 2).map((tech) => (
                                    <span key={tech} className="px-1.5 py-0.2 bg-[#F4F2EB] text-[#6E6B65] rounded font-mono text-[9px] truncate max-w-[70px]">
                                      {tech}
                                    </span>
                                  ))
                                ) : (
                                  <span className="px-1.5 py-0.2 bg-black/[0.04] text-[#6E6B65] rounded font-mono text-[9px]">
                                    {item.framework}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* 右栏：若用户选定卡片则展示详情；若处于生成中且尚未选定卡片，则展示实时推理视窗 */}
                  {selectedResult ? (
                    <div className="flex-1 flex flex-col overflow-hidden bg-white min-h-0 animate-fade-in">
                      {/* 右栏 Header：标题 truncate，按钮 flex-nowrap shrink-0 严禁折行 */}
                      <div className="px-5 py-3 border-b border-[#E5E2D9] flex items-center justify-between gap-4 bg-[#F4F2EB]/30 shrink-0 min-w-0">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <h3 className="text-xs font-bold text-[#2C2A29] truncate max-w-[280px]">
                              {selectedResult.title}
                            </h3>
                            {selectedResult.dimension && (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-semibold border border-purple-200/60 shrink-0">
                                {selectedResult.dimension}
                              </span>
                            )}
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/5 text-[#6E6B65] shrink-0">
                              {selectedResult.framework}
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200/60 shrink-0">
                              {selectedResult.distilledPrompt.length} 字 · 工业规范
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span className="text-[11px] text-[#6E6B65]">来源：{selectedResult.repoName}</span>
                            {selectedResult.techStack && selectedResult.techStack.length > 0 && (
                              <div className="flex items-center gap-1">
                                {selectedResult.techStack.map((tech) => (
                                  <span key={tech} className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#F4F2EB] text-[#6E6B65] border border-[#E5E2D9]">
                                    {tech}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 操作栏：严格配置 flex-nowrap shrink-0 whitespace-nowrap */}
                        <div className="flex items-center gap-2 shrink-0 flex-nowrap">
                          {/* 复制正文 */}
                          <button
                            onClick={() => handleCopySkill(selectedResult.distilledPrompt, selectedResult.id)}
                            className="px-2.5 py-1.5 text-xs rounded-xl border border-[#DCD8CD] hover:bg-white text-[#2C2A29] transition-all flex items-center gap-1 shadow-2xs font-medium flex-nowrap shrink-0 whitespace-nowrap cursor-pointer"
                          >
                            {copiedId === selectedResult.id ? (
                              <>
                                <Check size={13} strokeWidth={2} className="text-emerald-600" />
                                <span className="text-emerald-600">已复制</span>
                              </>
                            ) : (
                              <>
                                <Copy size={13} strokeWidth={1.75} />
                                <span>复制正文</span>
                              </>
                            )}
                          </button>

                          {/* 一键装配 (注入系统人设与工作流上下文) */}
                          <button
                            onClick={() => handleAssembleSkill(selectedResult)}
                            className="px-3 py-1.5 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200/80 rounded-xl transition-all flex items-center gap-1 shadow-2xs flex-nowrap shrink-0 whitespace-nowrap cursor-pointer"
                            title="将此技能的角色设定与执行工作流作为上下文装配注入当前提示词中"
                          >
                            <Puzzle size={13} strokeWidth={1.75} />
                            <span>一键装配</span>
                          </button>

                          {/* 直接应用 (替换当前草稿) */}
                          <button
                            onClick={() => handleApplySkill(selectedResult)}
                            className="px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 rounded-xl transition-all flex items-center gap-1 shadow-2xs flex-nowrap shrink-0 whitespace-nowrap cursor-pointer"
                            title="一键将该技能完整正文载入当前提示词草稿"
                          >
                            <Rocket size={13} strokeWidth={1.75} />
                            <span>直接应用</span>
                          </button>

                          {/* 保存到技能库 (解耦独立持久化) */}
                          {skills.some((s) => s.title.trim().toLowerCase() === selectedResult.title.trim().toLowerCase()) ? (
                            <button
                              onClick={() => handleImportToLibrary(selectedResult)}
                              className="px-3.5 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 rounded-xl shadow-2xs transition-all flex items-center gap-1.5 flex-nowrap shrink-0 whitespace-nowrap cursor-pointer"
                              title="已在我的已装技能库中（点击重新同步覆盖）"
                            >
                              <Check size={13} strokeWidth={1.75} />
                              <span>已在技能库 (已就绪)</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleImportToLibrary(selectedResult)}
                              disabled={importingId === selectedResult.id}
                              className="px-3.5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl shadow-xs transition-all flex items-center gap-1.5 flex-nowrap shrink-0 whitespace-nowrap cursor-pointer"
                              title="保存至已装技能库（可在编辑提示词时输入 @ 快速调用）"
                            >
                              {importingId === selectedResult.id ? (
                                <>
                                  <Loader2 size={13} strokeWidth={1.75} className="animate-spin" />
                                  <span>保存中...</span>
                                </>
                              ) : (
                                <>
                                  <Zap size={13} strokeWidth={1.75} />
                                  <span>保存到技能库</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* 详细内容独立内滚区 */}
                      <div className="flex-1 p-4 overflow-y-auto space-y-3 min-h-0 bg-[#FAF9F6]/40 select-text">
                        <div className="p-3.5 bg-white rounded-xl border border-[#E5E2D9] shadow-2xs whitespace-pre-wrap font-mono text-xs leading-relaxed text-[#2C2A29]">
                          {selectedResult.distilledPrompt}
                        </div>

                        {/* 开源原版特色提示卡片 */}
                        {selectedResult.dimension === '开源高赞原版' ? (
                          <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200/60 text-indigo-950 text-[11px] font-sans flex items-start gap-2.5">
                            <Sparkles size={15} strokeWidth={1.75} className="text-indigo-600 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-bold block mb-0.5">开源社区原版提示词说明</span>
                              <p className="text-indigo-900 leading-relaxed">
                                本条目 100% 还原自全球高星开源项目 <strong className="font-semibold">{selectedResult.repoName}</strong>。未经过大模型任何主观包装或参数抽离，保留了数万开发者实测验证的纯净语境。可直接点击右上角【直接应用】载入草稿，或点击【一键装配】注入为当前提示词的角色上下文。
                              </p>
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* 元数据卡片 */}
                            <div className="grid grid-cols-2 gap-2 text-[11px] font-sans">
                              <div className="p-3 rounded-xl bg-purple-50/70 border border-purple-200/60 text-purple-950">
                                <span className="font-bold flex items-center gap-1.5 mb-1 text-purple-900">
                                  <Brain size={14} strokeWidth={1.75} className="text-purple-600 shrink-0" />
                                  <span>专家角色设定 (System Persona)</span>
                                </span>
                                <p className="text-purple-900 leading-snug">{selectedResult.systemPersona}</p>
                              </div>
                              <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/60 text-amber-950">
                                <span className="font-bold flex items-center gap-1.5 mb-1 text-amber-900">
                                  <ShieldAlert size={14} strokeWidth={1.75} className="text-amber-600 shrink-0" />
                                  <span>约束红线与安全边界 (Guardrails)</span>
                                </span>
                                <p className="text-amber-900 leading-snug">{selectedResult.guardrails}</p>
                              </div>
                            </div>

                            <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/60 text-emerald-950 text-[11px] font-sans">
                              <span className="font-bold flex items-center gap-1.5 mb-1 text-emerald-900">
                                <Workflow size={14} strokeWidth={1.75} className="text-emerald-600 shrink-0" />
                                <span>标准化执行工作流 (Workflow)</span>
                              </span>
                              <p className="text-emerald-900 leading-snug whitespace-pre-line">{selectedResult.workflow}</p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* 右侧实时推理视窗 (Live Streaming Thought Inspector) */
                    <div className="flex-1 flex flex-col overflow-hidden bg-[#FAF9F6] min-h-0 p-4">
                      {/* 呼吸灯阶段指示胶囊 */}
                      <div className="flex items-center gap-2 p-3 bg-white/90 border border-[#E5E2D9] rounded-xl shadow-2xs mb-3 text-xs shrink-0">
                        <div className={`px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all text-xs ${
                          activePhase === 'raw_search' ? 'bg-indigo-600 text-white font-bold shadow-xs' : 'bg-black/5 text-[#6E6B65]'
                        }`}>
                          <Globe size={12} className={activePhase === 'raw_search' ? 'animate-spin shrink-0' : 'shrink-0'} />
                          <span>检索开源知识库</span>
                        </div>
                        <ChevronRight size={12} className="text-[#9E9B95]" />

                        <div className={`px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all text-xs ${
                          activePhase === 'distill' ? 'bg-indigo-600 text-white font-bold shadow-xs' : 'bg-black/5 text-[#6E6B65]'
                        }`}>
                          <Brain size={12} className={activePhase === 'distill' ? 'animate-pulse shrink-0' : 'shrink-0'} />
                          <span>工业级逆向工程蒸馏</span>
                        </div>
                        <ChevronRight size={12} className="text-[#9E9B95]" />

                        <div className={`px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all text-xs ${
                          activePhase === 'stream_json' ? 'bg-purple-600 text-white font-bold shadow-xs' : 'bg-black/5 text-[#6E6B65]'
                        }`}>
                          <Zap size={12} className={activePhase === 'stream_json' ? 'animate-pulse shrink-0' : 'shrink-0'} />
                          <span>实时多维流式推演</span>
                        </div>
                      </div>

                      {/* 极客风流式文字视窗 */}
                      <div className="flex-1 flex flex-col bg-[#1E1E1E] text-[#D4D4D4] font-mono text-xs overflow-hidden rounded-xl border border-black/20 shadow-inner">
                        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-white/10 text-[11px] text-white/50 bg-[#252526] shrink-0">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F56]" />
                              <span className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]" />
                              <span className="w-2.5 h-2.5 rounded-full bg-[#27C93F]" />
                            </div>
                            <span className="font-sans text-[11px] text-white/80">Live Reasoning Inspector · {searchDirection}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="animate-pulse text-emerald-400 font-sans">● Streaming Tokens</span>
                            <span className="font-mono">{liveStreamingText.length} 字符</span>
                          </div>
                        </div>

                        <div className="flex-1 p-3.5 overflow-y-auto whitespace-pre-wrap leading-relaxed select-text font-mono text-[11px] text-emerald-300/90 scrollbar-none">
                          {liveStreamingText || '正在建立大模型流式推理通道，初始化专业维度分词向量...'}
                          <span className="inline-block w-2 h-3.5 bg-emerald-400 animate-pulse ml-0.5 align-middle" />
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[#6E6B65]">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-200/60 flex items-center justify-center text-indigo-600 mb-3 shadow-2xs">
                    <Sparkles size={26} strokeWidth={1.75} />
                  </div>
                  <h4 className="text-xs font-bold text-[#2C2A29] mb-1">
                    准备猎取全网高赞开源 Skill
                  </h4>
                  <p className="text-[11px] text-[#6E6B65] max-w-md leading-relaxed mb-4">
                    输入您所需的专业方向（如“前端 UI 设计”、“高并发微服务”、“代码审查”），系统支持本地秒级缓存命中与流式渐进点亮推演。
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ----------------- TAB 2: 我的已装技能 ----------------- */}
        {activeTabMode === 'installed' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#FAF9F6]">
            {/* 分类药丸与搜索区 */}
            <div className="p-3.5 border-b border-[#E5E2D9] bg-white/70 space-y-2.5 shrink-0">
              <div className="flex items-center justify-between gap-3">
                {/* 6 大标准分类筛选药丸 */}
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none flex-1">
                  {CATEGORIES.map((cat) => {
                    const isSelected = activeSkillCategory === cat.id;
                    const count = cat.id === 'all' 
                      ? skills.length 
                      : skills.filter(s => s.category === cat.id).length;
                    const Icon = cat.icon;

                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setActiveSkillCategory(cat.id)}
                        className={`px-3 py-1.5 text-xs rounded-xl font-medium transition-all flex items-center gap-1.5 flex-nowrap shrink-0 whitespace-nowrap cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-2xs font-semibold'
                            : 'bg-[#F4F2EB] text-[#6E6B65] hover:text-[#2C2A29] hover:bg-black/5 border border-[#E5E2D9]'
                        }`}
                      >
                        {Icon && <Icon size={13} strokeWidth={1.75} className={isSelected ? 'text-white' : 'text-[#6E6B65]'} />}
                        <span>{cat.label}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                          isSelected ? 'bg-white/25 text-white' : 'bg-black/5 text-[#6E6B65]'
                        }`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* 搜索框 */}
                <div className="relative w-56 flex items-center shrink-0">
                  <Search size={14} strokeWidth={1.75} className="absolute left-2.5 text-[#6E6B65] pointer-events-none" />
                  <input
                    type="text"
                    placeholder="在已装技能中搜索..."
                    value={installedSearch}
                    onChange={(e) => setInstalledSearch(e.target.value)}
                    className="w-full text-xs pl-8 pr-3 py-1.5 bg-white rounded-xl border border-[#DCD8CD] focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500 text-[#2C2A29] shadow-2xs"
                  />
                  {installedSearch && (
                    <button
                      onClick={() => setInstalledSearch('')}
                      className="absolute right-2 text-[#9E9B95] hover:text-[#2C2A29] cursor-pointer"
                    >
                      <X size={12} strokeWidth={2} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* 双栏内容区 */}
            <div className="flex-1 flex overflow-hidden min-h-0">
              {filteredInstalledSkills.length > 0 ? (
                <>
                  {/* 左栏：已装技能列表 */}
                  <div className="w-80 md:w-[360px] border-r border-[#E5E2D9] overflow-y-auto p-3 space-y-2 bg-[#F4F2EB]/50 shrink-0 min-h-0">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#6E6B65] px-1 mb-1">
                      {CATEGORY_NAMES[activeSkillCategory]} 技能 ({filteredInstalledSkills.length})
                    </div>

                    {filteredInstalledSkills.map((skill) => {
                      const isSelected = selectedInstalledSkill?.id === skill.id;
                      return (
                        <div
                          key={skill.id}
                          onClick={() => {
                            setSelectedInstalledSkill(skill);
                            setIsEditingInstalled(false);
                            setEditSkillForm(null);
                          }}
                          className={`p-3 rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-white border-indigo-500 shadow-sm ring-1 ring-indigo-500/20'
                              : 'bg-white/80 hover:bg-white border-[#E5E2D9] hover:shadow-2xs'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-bold text-[#2C2A29] truncate flex-1">
                              {skill.title}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200/60 ml-2 shrink-0">
                              {skill.framework}
                            </span>
                          </div>

                          <p className="text-[11px] text-[#6E6B65] line-clamp-2 leading-relaxed mb-2">
                            {skill.description}
                          </p>

                          <div className="flex items-center justify-between text-[10px] text-[#9E9B95] pt-1.5 border-t border-[#E5E2D9]/60">
                            <span className="font-mono flex items-center gap-1">
                              {CATEGORY_ICONS[skill.category] && (
                                React.createElement(CATEGORY_ICONS[skill.category]!, { size: 11, strokeWidth: 1.75, className: 'text-[#6E6B65]' })
                              )}
                              <span>{CATEGORY_NAMES[skill.category]}</span>
                            </span>
                            {skill.dimension && (
                              <span className="truncate max-w-[120px] font-mono text-purple-700 font-medium">
                                {skill.dimension}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 右栏：已装技能详情与三大核心动作 */}
                  {selectedInstalledSkill && (
                    <div className="flex-1 flex flex-col overflow-hidden bg-white min-h-0">
                      {/* 右栏 Header */}
                      <div className="px-5 py-3 border-b border-[#E5E2D9] flex items-center justify-between gap-4 bg-[#F4F2EB]/30 shrink-0 min-w-0">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <h3 className="text-xs font-bold text-[#2C2A29] truncate max-w-[280px]">
                              {selectedInstalledSkill.title}
                            </h3>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200/60 shrink-0">
                              {selectedInstalledSkill.framework}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/5 text-[#6E6B65] shrink-0 flex items-center gap-1">
                              {CATEGORY_ICONS[selectedInstalledSkill.category] && (
                                React.createElement(CATEGORY_ICONS[selectedInstalledSkill.category]!, { size: 11, strokeWidth: 1.75, className: 'text-[#6E6B65]' })
                              )}
                              <span>{CATEGORY_NAMES[selectedInstalledSkill.category]}</span>
                            </span>
                          </div>
                          <span className="text-[11px] text-[#6E6B65] truncate block mt-0.5">
                            {selectedInstalledSkill.dimension ? `定位维度：${selectedInstalledSkill.dimension} · ` : ''}
                            最后更新：{new Date(selectedInstalledSkill.updatedAt).toLocaleDateString()}
                          </span>
                        </div>

                        {/* 操作栏：严禁折行 */}
                        <div className="flex items-center gap-2 shrink-0 flex-nowrap">
                          {/* 复制正文 */}
                          <button
                            onClick={() => handleCopySkill(selectedInstalledSkill.distilledPrompt, selectedInstalledSkill.id)}
                            className="px-2.5 py-1.5 text-xs rounded-xl border border-[#DCD8CD] hover:bg-white text-[#2C2A29] transition-all flex items-center gap-1 shadow-2xs font-medium flex-nowrap shrink-0 whitespace-nowrap cursor-pointer"
                          >
                            {copiedId === selectedInstalledSkill.id ? (
                              <>
                                <Check size={13} strokeWidth={2} className="text-emerald-600" />
                                <span className="text-emerald-600">已复制</span>
                              </>
                            ) : (
                              <>
                                <Copy size={13} strokeWidth={1.75} />
                                <span>复制正文</span>
                              </>
                            )}
                          </button>

                          {/* 一键装配 */}
                          <button
                            onClick={() => handleAssembleSkill(selectedInstalledSkill)}
                            className="px-3 py-1.5 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200/80 rounded-xl transition-all flex items-center gap-1 shadow-2xs flex-nowrap shrink-0 whitespace-nowrap cursor-pointer"
                            title="将此技能的角色设定与执行工作流装配注入当前提示词中"
                          >
                            <Puzzle size={13} strokeWidth={1.75} />
                            <span>一键装配</span>
                          </button>

                          {/* 直接应用 */}
                          <button
                            onClick={() => handleApplySkill(selectedInstalledSkill)}
                            className="px-3.5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all flex items-center gap-1.5 flex-nowrap shrink-0 whitespace-nowrap cursor-pointer"
                            title="一键将该技能载入当前正在编辑的提示词草稿"
                          >
                            <Rocket size={13} strokeWidth={1.75} />
                            <span>直接应用</span>
                          </button>

                          {/* 编辑正文 / 保存 */}
                          {isEditingInstalled ? (
                            <button
                              onClick={handleSaveSkillEdit}
                              className="px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 rounded-xl transition-all flex items-center gap-1 flex-nowrap shrink-0 whitespace-nowrap cursor-pointer"
                            >
                              <Check size={13} strokeWidth={1.75} />
                              <span>保存修改</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setEditSkillForm({ ...selectedInstalledSkill });
                                setIsEditingInstalled(true);
                              }}
                              className="px-2.5 py-1.5 text-xs font-medium text-[#2C2A29] hover:bg-black/5 border border-[#DCD8CD] rounded-xl transition-all flex items-center gap-1 flex-nowrap shrink-0 whitespace-nowrap cursor-pointer"
                              title="在线修改此技能提示词与参数"
                            >
                              <Pencil size={13} strokeWidth={1.75} />
                              <span>编辑技能</span>
                            </button>
                          )}

                          {/* 卸载/删除 */}
                          <button
                            onClick={() => handleDeleteInstalled(selectedInstalledSkill.id, selectedInstalledSkill.title)}
                            className="p-1.5 text-[#6E6B65] hover:text-rose-600 hover:bg-rose-50 rounded-xl border border-[#DCD8CD] transition-all flex items-center justify-center flex-nowrap shrink-0 whitespace-nowrap cursor-pointer"
                            title="从本地技能库彻底卸载删除"
                          >
                            <Trash2 size={13} strokeWidth={1.75} />
                          </button>
                        </div>
                      </div>

                      {/* 技能正文区 */}
                      <div className="flex-1 p-4 overflow-y-auto space-y-3 min-h-0 bg-[#FAF9F6]/40 select-text">
                        {isEditingInstalled && editSkillForm ? (
                          <div className="space-y-3 bg-white p-4 rounded-xl border border-[#E5E2D9] shadow-2xs font-sans text-xs">
                            <div>
                              <label className="block text-[11px] font-bold text-[#6E6B65] mb-1">
                                技能标题
                              </label>
                              <input
                                type="text"
                                value={editSkillForm.title}
                                onChange={(e) => setEditSkillForm({ ...editSkillForm, title: e.target.value })}
                                className="w-full text-xs p-2 rounded-lg border border-[#DCD8CD] focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[11px] font-bold text-[#6E6B65] mb-1">
                                  技能分类
                                </label>
                                <select
                                  value={editSkillForm.category}
                                  onChange={(e) => setEditSkillForm({ ...editSkillForm, category: e.target.value as SkillCategory })}
                                  className="w-full text-xs p-2 rounded-lg border border-[#DCD8CD] bg-white focus:outline-none"
                                >
                                  {CATEGORIES.filter(c => c.id !== 'all').map(c => (
                                    <option key={c.id} value={c.id}>{c.label}</option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-[11px] font-bold text-[#6E6B65] mb-1">
                                  优化框架
                                </label>
                                <select
                                  value={editSkillForm.framework}
                                  onChange={(e) => setEditSkillForm({ ...editSkillForm, framework: e.target.value as FrameworkType })}
                                  className="w-full text-xs p-2 rounded-lg border border-[#DCD8CD] bg-white focus:outline-none"
                                >
                                  <option value="CO-STAR">CO-STAR</option>
                                  <option value="CRISPE">CRISPE</option>
                                  <option value="FEW_SHOT_COT">Few-Shot & CoT</option>
                                  <option value="ROLE_TASK_FORMAT">Role-Task-Format</option>
                                  <option value="STRICT_JSON">Strict JSON</option>
                                  <option value="FREEFORM">自由深度精修</option>
                                </select>
                              </div>
                            </div>

                            <div>
                              <label className="block text-[11px] font-bold text-[#6E6B65] mb-1">
                                细分维度标签
                              </label>
                              <input
                                type="text"
                                value={editSkillForm.dimension || ''}
                                onChange={(e) => setEditSkillForm({ ...editSkillForm, dimension: e.target.value })}
                                placeholder="如：组件系统规范、状态流转"
                                className="w-full text-xs p-2 rounded-lg border border-[#DCD8CD] focus:outline-none"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-bold text-[#6E6B65] mb-1">
                                技能简介
                              </label>
                              <input
                                type="text"
                                value={editSkillForm.description}
                                onChange={(e) => setEditSkillForm({ ...editSkillForm, description: e.target.value })}
                                className="w-full text-xs p-2 rounded-lg border border-[#DCD8CD] focus:outline-none"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-bold text-[#6E6B65] mb-1">
                                完整提示词正文
                              </label>
                              <textarea
                                rows={8}
                                value={editSkillForm.distilledPrompt}
                                onChange={(e) => setEditSkillForm({ ...editSkillForm, distilledPrompt: e.target.value })}
                                className="w-full text-xs p-2.5 rounded-lg border border-[#DCD8CD] font-mono leading-relaxed focus:outline-none"
                              />
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                              <button
                                type="button"
                                onClick={() => setIsEditingInstalled(false)}
                                className="px-3 py-1.5 text-xs rounded-lg border border-[#DCD8CD] hover:bg-black/5"
                              >
                                取消
                              </button>
                              <button
                                type="button"
                                onClick={handleSaveSkillEdit}
                                className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-2xs"
                              >
                                保存并生效
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="p-3.5 bg-white rounded-xl border border-[#E5E2D9] shadow-2xs whitespace-pre-wrap font-mono text-xs leading-relaxed text-[#2C2A29]">
                              {selectedInstalledSkill.distilledPrompt}
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-[11px] font-sans">
                              <div className="p-3 rounded-xl bg-purple-50/70 border border-purple-200/60 text-purple-950">
                                <span className="font-bold flex items-center gap-1.5 mb-1 text-purple-900">
                                  <Brain size={14} strokeWidth={1.75} className="text-purple-600 shrink-0" />
                                  <span>专家角色设定 (System Persona)</span>
                                </span>
                                <p className="text-purple-900 leading-snug">{selectedInstalledSkill.systemPersona}</p>
                              </div>
                              <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/60 text-amber-950">
                                <span className="font-bold flex items-center gap-1.5 mb-1 text-amber-900">
                                  <ShieldAlert size={14} strokeWidth={1.75} className="text-amber-600 shrink-0" />
                                  <span>约束红线与安全边界 (Guardrails)</span>
                                </span>
                                <p className="text-amber-900 leading-snug">{selectedInstalledSkill.guardrails}</p>
                              </div>
                            </div>

                            <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/60 text-emerald-950 text-[11px] font-sans">
                              <span className="font-bold flex items-center gap-1.5 mb-1 text-emerald-900">
                                <Workflow size={14} strokeWidth={1.75} className="text-emerald-600 shrink-0" />
                                <span>标准化执行工作流 (Workflow)</span>
                              </span>
                              <p className="text-emerald-900 leading-snug whitespace-pre-line">{selectedInstalledSkill.workflow}</p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[#6E6B65]">
                  <div className="w-14 h-14 rounded-2xl bg-[#F4F2EB] border border-[#E5E2D9] flex items-center justify-center text-indigo-600 mb-3 shadow-2xs">
                    <BookOpen size={26} strokeWidth={1.75} />
                  </div>
                  <h4 className="text-xs font-bold text-[#2C2A29] mb-1">
                    当前分类下暂无已装技能
                  </h4>
                  <p className="text-[11px] text-[#6E6B65] max-w-md leading-relaxed mb-4">
                    您可以切换分类筛选药丸，或点击「全网 AI 猎手」输入真实技术方向一键蒸馏入库。
                  </p>
                  <button
                    onClick={() => setActiveTabMode('hunter')}
                    className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles size={14} strokeWidth={2} />
                    <span>前往全网 AI 猎手</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
