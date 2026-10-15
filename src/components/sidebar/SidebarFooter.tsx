import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Cpu, Settings, Sun, Moon, Monitor, Check, Sparkles, ChevronUp, Loader2 } from 'lucide-react';
import { fetchAvailableModels } from '../../services/llmService';

export const SidebarFooter: React.FC = () => {
  const { apiConfig, updateAPIConfig, setIsSettingsOpen, theme, toggleTheme, showToast } = useAppStore();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [remoteModels, setRemoteModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部自动关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  // 打开快捷菜单时自动拉取或同步当前端点的可用模型
  const handleToggleMenu = async () => {
    const nextState = !isMenuOpen;
    setIsMenuOpen(nextState);
    if (nextState && remoteModels.length === 0 && apiConfig.baseUrl) {
      setIsLoadingModels(true);
      try {
        const res = await fetchAvailableModels(apiConfig);
        if (res.success && res.models.length > 0) {
          setRemoteModels(res.models);
        }
      } catch (err) {
        console.warn('[SidebarFooter] 拉取快捷模型列表失败:', err);
      } finally {
        setIsLoadingModels(false);
      }
    }
  };

  // 快捷切换模型并即时持久化
  const handleQuickSelectModel = async (selectedModel: string) => {
    try {
      await updateAPIConfig({ ...apiConfig, model: selectedModel });
      showToast(`已切换主模型为: ${selectedModel}`, 'success');
    } catch (err) {
      console.error('[SidebarFooter] 保存模型失败:', err);
    } finally {
      setIsMenuOpen(false);
    }
  };

  // 汇总展示列表：完全忠实于远端端点真实返回的可用模型，杜绝混入未经端点支持的静态假模型
  const displayModels = React.useMemo(() => {
    const list: string[] = [];
    if (apiConfig.model) {
      list.push(apiConfig.model);
    }
    if (remoteModels.length > 0) {
      remoteModels.forEach((m) => {
        if (!list.includes(m)) list.push(m);
      });
    }
    return list;
  }, [apiConfig.model, remoteModels]);

  const isRealFromEndpoint = remoteModels.length > 0;

  return (
    <div className="p-2.5 border-t border-mac-border/60 dark:border-white/10 bg-white/40 dark:bg-black/20 relative" ref={menuRef}>
      {/* 快捷模型切换悬浮菜单 */}
      {isMenuOpen && (
        <div className="absolute bottom-full left-2.5 right-2.5 mb-2 bg-white/95 dark:bg-[#1c1c21]/95 backdrop-blur-xl border border-mac-border/80 dark:border-white/10 rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150 select-none">
          <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-mac-border/40 dark:border-white/10 mb-1.5">
            <span className="text-[11px] font-semibold text-mac-textPrimary dark:text-zinc-200 flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isRealFromEndpoint ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
              <span>{isRealFromEndpoint ? `端点真实模型 (${remoteModels.length})` : '当前配置主模型'}</span>
            </span>
            {isLoadingModels && <Loader2 size={11} className="animate-spin text-mac-textMuted" />}
          </div>

          <div className="max-h-56 overflow-y-auto space-y-0.5 pr-0.5">
            {displayModels.length === 0 ? (
              <div className="py-4 text-center text-xs text-mac-textMuted font-sans">
                暂未获取到模型，请先检查端点设置
              </div>
            ) : (
              displayModels.map((m) => {
                const isSelected = apiConfig.model === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleQuickSelectModel(m)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left text-xs font-mono transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-mac-accentBlue text-white font-semibold shadow-xs'
                        : 'text-mac-textPrimary dark:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                  >
                    <span className="truncate max-w-[190px]">{m}</span>
                    {isSelected && <Check size={13} strokeWidth={2.5} className="shrink-0" />}
                  </button>
                );
              })
            )}
          </div>

          <div className="pt-1.5 mt-1.5 border-t border-mac-border/40 dark:border-white/10">
            <button
              type="button"
              onClick={() => {
                setIsMenuOpen(false);
                setIsSettingsOpen(true);
              }}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] text-mac-textSecondary hover:text-mac-accentBlue dark:text-zinc-400 dark:hover:text-blue-400 font-sans font-medium hover:bg-black/[0.03] dark:hover:bg-white/[0.04] rounded-lg transition-colors cursor-pointer"
            >
              <Settings size={12} />
              <span>打开完整 API 与端点设置...</span>
            </button>
          </div>
        </div>
      )}

      {/* 底部状态胶囊 */}
      <div 
        onClick={handleToggleMenu}
        className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] hover:bg-black/[0.05] dark:hover:bg-white/[0.06] transition-colors cursor-pointer border border-mac-border/50 dark:border-white/10 text-mac-textSecondary dark:text-zinc-400 hover:text-mac-textPrimary dark:hover:text-zinc-200 group"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Cpu size={14} strokeWidth={1.75} className="text-mac-accentBlue flex-shrink-0" />
          <span className="text-xs font-mono font-medium text-mac-textPrimary dark:text-zinc-200 truncate max-w-[125px]" title={apiConfig.model}>
            {apiConfig.model || 'gpt-4o'}
          </span>
          <ChevronUp size={12} className={`text-mac-textMuted transition-transform ${isMenuOpen ? 'rotate-180' : ''}`} />
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleTheme();
            }}
            title={`外观主题: ${theme === 'dark' ? '深色模式' : theme === 'light' ? '浅色模式' : '跟随系统 (自动)'} (点击切换)`}
            className="p-1 rounded-lg text-mac-textSecondary hover:text-mac-textPrimary hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            {theme === 'dark' ? (
              <Moon size={14} strokeWidth={1.75} className="text-purple-400" />
            ) : theme === 'light' ? (
              <Sun size={14} strokeWidth={1.75} className="text-amber-500" />
            ) : (
              <Monitor size={14} strokeWidth={1.75} className="text-mac-accentBlue" />
            )}
          </button>

          <button 
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsSettingsOpen(true);
            }}
            title="模型与 API 设置"
            className="p-1 rounded-lg text-mac-textSecondary group-hover:text-mac-textPrimary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <Settings size={15} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </div>
  );
};

