import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, 
  Sparkles, 
  ArrowLeftRight, 
  Code2, 
  History, 
  Plus, 
  Settings, 
  Compass, 
  PanelLeft, 
  FileText, 
  CornerDownLeft,
  X,
  Zap,
  ShieldAlert,
  Link,
  SunMoon,
  Network,
  GitBranch
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

interface CommandItem {
  id: string;
  category: '提示词' | '视图导航' | '快捷操作';
  title: string;
  subtitle?: string;
  badge?: string;
  icon: React.ReactNode;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const {
    prompts,
    folders,
    activePromptId,
    setActivePromptId,
    setIsScratchpadActive,
    setActiveTab,
    createPrompt,
    setIsSettingsOpen,
    setIsSkillHunterOpen,
    toggleSidebarCollapsed,
    toggleTheme,
    showToast,
  } = useAppStore();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 打开时自动聚焦并清空输入
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const activePrompt = useMemo(
    () => prompts.find((p) => p.id === activePromptId),
    [prompts, activePromptId]
  );

  // 聚合所有命令条目
  const allItems: CommandItem[] = useMemo(() => {
    const items: CommandItem[] = [];

    // 1. 提示词项
    prompts.forEach((p) => {
      const folder = folders.find((f) => f.id === p.folderId);
      items.push({
        id: `prompt-${p.id}`,
        category: '提示词',
        title: p.title || '未命名提示词',
        subtitle: folder ? `文件夹: ${folder.name}` : '根目录',
        badge: p.framework,
        icon: <FileText size={15} className="text-mac-accentBlue" />,
        action: () => {
          setActivePromptId(p.id);
          setIsScratchpadActive(false);
          onClose();
        },
      });
    });

    // 2. 视图切换
    items.push(
      {
        id: 'nav-optimize',
        category: '视图导航',
        title: '切换到「结构优化」视图',
        subtitle: '优化提示词结构、多轮对话与透镜对比',
        icon: <Sparkles size={15} className="text-mac-accentBlue" />,
        action: () => {
          setActiveTab('optimize');
          onClose();
        },
      },
      {
        id: 'nav-ab-test',
        category: '视图导航',
        title: '切换到「双轨 A/B 对比」视图',
        subtitle: '横向对比不同模型与提示词版本的生成效果',
        icon: <ArrowLeftRight size={15} className="text-mac-accentGreen" />,
        action: () => {
          setActiveTab('ab_test');
          onClose();
        },
      },
      {
        id: 'nav-variables',
        category: '视图导航',
        title: '切换到「模板变量与批量矩阵」视图',
        subtitle: '提取 {{variable}} 入参变量并进行批量数据集并发评测',
        icon: <Code2 size={15} className="text-mac-accentPurple" />,
        action: () => {
          setActiveTab('variables');
          onClose();
        },
      },
      {
        id: 'nav-versions',
        category: '视图导航',
        title: '切换到「版本历史时光机」视图',
        subtitle: '查看、回滚与比对提示词历史迭代版本',
        icon: <History size={15} className="text-mac-accentAmber" />,
        action: () => {
          setActiveTab('versions');
          onClose();
        },
      }
    );

    // 3. 快捷操作
    items.push(
      {
        id: 'action-compress',
        category: '快捷操作',
        title: '启动 Token 智能瘦身透镜',
        subtitle: '无损压缩提示词冗余废话，削减高达 50%~90% 的 API 开销',
        badge: '极客推荐',
        icon: <Zap size={15} className="text-emerald-500" />,
        action: () => {
          setActiveTab('optimize');
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('prompttune:action', { detail: { action: 'open-compressor' } }));
          }, 60);
          onClose();
        },
      },
      {
        id: 'action-audit',
        category: '快捷操作',
        title: '启动提示词健康体检与反模式静态审计',
        subtitle: '静态扫描冲突约束、泄露隐患与模糊表述并给出加固方案',
        badge: '安全门禁',
        icon: <ShieldAlert size={15} className="text-indigo-500" />,
        action: () => {
          setActiveTab('optimize');
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('prompttune:action', { detail: { action: 'open-audit' } }));
          }, 60);
          onClose();
        },
      },
      {
        id: 'action-export-code',
        category: '快捷操作',
        title: '导出生产级工程代码与 CI/CD 配置',
        subtitle: '生成 Python / TypeScript / LangChain / Promptfoo YAML',
        icon: <Code2 size={15} className="text-mac-accentBlue" />,
        action: () => {
          window.dispatchEvent(new CustomEvent('prompttune:action', { detail: { action: 'open-export-code' } }));
          onClose();
        },
      },
      {
        id: 'action-open-dag',
        category: '快捷操作',
        title: '查看工程模块依赖拓扑图谱 (DAG)',
        subtitle: '全景可视化模块装配流向、环路死锁排查与多步链路层级分析',
        badge: '架构拓扑',
        icon: <Network size={15} className="text-indigo-500" />,
        action: () => {
          window.dispatchEvent(new CustomEvent('prompttune:action', { detail: { action: 'open-dag' } }));
          onClose();
        },
      },
      {
        id: 'action-git-sync',
        category: '快捷操作',
        title: '打包导出 Git 团队规范文件树 (Prompt as Code)',
        subtitle: '序列化全局提示词为标准 YAML FrontMatter + .prompt.md 文件包',
        badge: '团队协同',
        icon: <GitBranch size={15} className="text-purple-500" />,
        action: () => {
          window.dispatchEvent(new CustomEvent('prompttune:action', { detail: { action: 'export-git-tree' } }));
          onClose();
        },
      },
      {
        id: 'action-copy-ref',
        category: '快捷操作',
        title: '复制当前提示词模块引用语法',
        subtitle: activePrompt ? `生成并复制 {{@${activePrompt.title}}}，可在其他提示词中模块化装配` : '请先选择提示词',
        badge: '模块化引用',
        icon: <Link size={15} className="text-purple-500" />,
        action: () => {
          if (activePrompt) {
            navigator.clipboard.writeText(`{{@${activePrompt.title}}}`);
            showToast(`已复制引用代码: {{@${activePrompt.title}}}`, 'success');
          } else {
            showToast('当前未选中任何提示词', 'error');
          }
          onClose();
        },
      },
      {
        id: 'action-toggle-theme',
        category: '快捷操作',
        title: '切换界面外观主题 (深色 / 浅色)',
        subtitle: '快速在 macOS 深邃暗夜与明亮质感之间切换',
        icon: <SunMoon size={15} className="text-amber-500" />,
        action: () => {
          toggleTheme();
          showToast('已切换界面主题', 'info');
          onClose();
        },
      },
      {
        id: 'action-new-prompt',
        category: '快捷操作',
        title: '新建提示词',
        subtitle: '在当前目录或根目录新建提示词工程',
        icon: <Plus size={15} className="text-mac-accentBlue" />,
        action: () => {
          createPrompt(null, '新建提示词');
          onClose();
        },
      },
      {
        id: 'action-scratchpad',
        category: '快捷操作',
        title: '打开单次草稿独立优化台',
        subtitle: '无需保存直接进行快速单次优化',
        icon: <Sparkles size={15} className="text-amber-500" />,
        action: () => {
          setIsScratchpadActive(true);
          onClose();
        },
      },
      {
        id: 'action-skillhunter',
        category: '快捷操作',
        title: '打开 SkillHunter 提示词猎手',
        subtitle: '检索 GitHub 高星项目并提炼提示词沉淀',
        icon: <Compass size={15} className="text-indigo-500" />,
        action: () => {
          setIsSkillHunterOpen(true);
          onClose();
        },
      },
      {
        id: 'action-settings',
        category: '快捷操作',
        title: '系统偏好设置与 API 配置',
        subtitle: '配置 OpenAI, DeepSeek, Ollama 等模型接口',
        icon: <Settings size={15} className="text-gray-400" />,
        action: () => {
          setIsSettingsOpen(true);
          onClose();
        },
      },
      {
        id: 'action-toggle-sidebar',
        category: '快捷操作',
        title: '折叠 / 展开侧边栏',
        subtitle: '快捷键: Cmd + B',
        icon: <PanelLeft size={15} className="text-gray-400" />,
        action: () => {
          toggleSidebarCollapsed();
          onClose();
        },
      }
    );

    return items;
  }, [
    prompts, 
    folders, 
    activePrompt,
    activePromptId, 
    setActivePromptId, 
    setIsScratchpadActive, 
    setActiveTab, 
    createPrompt, 
    setIsSettingsOpen, 
    setIsSkillHunterOpen, 
    toggleSidebarCollapsed, 
    toggleTheme,
    showToast,
    onClose
  ]);

  // 模糊匹配过滤
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter((item) => {
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchSub = item.subtitle?.toLowerCase().includes(q);
      const matchBadge = item.badge?.toLowerCase().includes(q);
      const matchCategory = item.category.toLowerCase().includes(q);
      return matchTitle || matchSub || matchBadge || matchCategory;
    });
  }, [allItems, query]);

  // 键盘操作响应 (上下键、回车、Esc)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1 < filteredItems.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filteredItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  // 滚动条随选中项滚动
  useEffect(() => {
    if (listRef.current) {
      const selectedEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`) as HTMLElement;
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center pt-[15vh] px-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-[#1c1c21] border border-mac-border/80 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-[580px] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150 ring-1 ring-black/5 dark:ring-white/10 select-none"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Spotlight Search Header */}
        <div className="flex items-center px-4 py-3.5 border-b border-mac-border/50 dark:border-white/10 gap-3">
          <Search size={18} className="text-mac-textMuted dark:text-zinc-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="搜索提示词、切换工作区视图或执行快捷指令..."
            className="flex-1 bg-transparent text-sm text-mac-textPrimary dark:text-zinc-100 placeholder:text-mac-textMuted dark:placeholder:text-zinc-500 focus:outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="p-1 rounded-md text-mac-textMuted hover:text-mac-textPrimary dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
            >
              <X size={14} />
            </button>
          ) : (
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-black/5 dark:bg-white/10 text-mac-textMuted dark:text-zinc-400 border border-mac-border/40 dark:border-white/10">
              ESC
            </kbd>
          )}
        </div>

        {/* Results List */}
        <div 
          ref={listRef}
          className="max-h-[380px] overflow-y-auto p-2 space-y-1 select-none scrollbar-none"
        >
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-xs text-mac-textMuted dark:text-zinc-500">
              没有找到与 "{query}" 匹配的操作或提示词
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const isSelected = index === selectedIndex;
              // Show category separator when category changes
              const isFirstInCategory = index === 0 || filteredItems[index - 1].category !== item.category;

              return (
                <React.Fragment key={item.id}>
                  {isFirstInCategory && (
                    <div className="px-2.5 pt-2.5 pb-1 text-[10px] font-semibold text-mac-textMuted dark:text-zinc-500 uppercase tracking-wider">
                      {item.category}
                    </div>
                  )}
                  <div
                    data-index={index}
                    onClick={() => item.action()}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer text-xs transition-colors ${
                      isSelected
                        ? 'bg-mac-accentBlue text-white shadow-xs font-medium'
                        : 'text-mac-textPrimary dark:text-zinc-200 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`p-1.5 rounded-lg flex-shrink-0 ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-black/5 dark:bg-white/5'
                      }`}>
                        {item.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{item.title}</div>
                        {item.subtitle && (
                          <div className={`text-[11px] truncate ${
                            isSelected ? 'text-white/80' : 'text-mac-textMuted dark:text-zinc-400'
                          }`}>
                            {item.subtitle}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0 pl-2">
                      {item.badge && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                          isSelected 
                            ? 'bg-white/25 text-white' 
                            : 'bg-black/5 dark:bg-white/10 text-mac-textMuted dark:text-zinc-400'
                        }`}>
                          {item.badge}
                        </span>
                      )}
                      {isSelected && (
                        <CornerDownLeft size={13} className="text-white/80" />
                      )}
                    </div>
                  </div>
                </React.Fragment>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2 border-t border-mac-border/40 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] flex items-center justify-between text-[11px] text-mac-textMuted dark:text-zinc-400">
          <div className="flex items-center gap-3">
            <span>↑↓ 导航</span>
            <span>↵ 确认执行</span>
            <span>ESC 关闭</span>
          </div>
          <span className="font-mono text-[10px]">PromptTune Spotlight</span>
        </div>
      </div>
    </div>
  );
};
