import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Coins, 
  AlertTriangle, 
  ChevronDown, 
  Check, 
  X, 
  Search, 
  Sparkles, 
  SlidersHorizontal 
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { 
  calculateTokenCostReport, 
  MODEL_RATES, 
  ModelRate, 
  ModelRateCategory 
} from '../../utils/costUtils';

interface TokenCostPopoverProps {
  systemText: string;
  templateText: string;
  variableText: string;
}

export const TokenCostPopover: React.FC<TokenCostPopoverProps> = ({
  systemText,
  templateText,
  variableText,
}) => {
  const { apiConfig } = useAppStore();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedModelKey, setSelectedModelKey] = useState<string>(() => {
    return apiConfig.model || 'deepseek-chat';
  });
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // 自定义费率模式
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customInputRate, setCustomInputRate] = useState<string>('1.00');
  const [customOutputRate, setCustomOutputRate] = useState<string>('2.00');

  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 当全局配置切换模型时同步更新
  useEffect(() => {
    if (apiConfig.model) {
      setSelectedModelKey(apiConfig.model);
    }
  }, [apiConfig.model]);

  // 当打开搜索框时自动聚焦
  useEffect(() => {
    if (isModelPickerOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 60);
    } else {
      setSearchQuery('');
    }
  }, [isModelPickerOpen]);

  // 点击外部自动关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsModelPickerOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const customOverride: Partial<ModelRate> | undefined = useMemo(() => {
    if (!isCustomMode) return undefined;
    const inputNum = parseFloat(customInputRate) || 0;
    const outputNum = parseFloat(customOutputRate) || 0;
    return {
      name: `自定义费率 ($${inputNum}/$${outputNum})`,
      category: '开源与低成本',
      inputPerMillionUsd: inputNum,
      outputPerMillionUsd: outputNum,
      maxContext: 65536,
    };
  }, [isCustomMode, customInputRate, customOutputRate]);

  const report = useMemo(() => {
    return calculateTokenCostReport(
      systemText, 
      templateText, 
      variableText, 
      selectedModelKey,
      7.25,
      customOverride
    );
  }, [systemText, templateText, variableText, selectedModelKey, customOverride]);

  const sysPercent = report.totalTokens > 0 ? (report.systemTokens / report.totalTokens) * 100 : 0;
  const tplPercent = report.totalTokens > 0 ? (report.templateTokens / report.totalTokens) * 100 : 0;
  const varPercent = report.totalTokens > 0 ? (report.variableTokens / report.totalTokens) * 100 : 0;

  // 过滤模型列表
  const filteredModels = useMemo(() => {
    const list = Object.values(MODEL_RATES);
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.id && m.id.toLowerCase().includes(q)) ||
        m.category.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  // 分类顺序
  const categories: ModelRateCategory[] = [
    '开源与低成本',
    '轻量高性价比',
    '顶级旗舰推理',
    '本地免费',
  ];

  return (
    <div className="relative inline-block" ref={popoverRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        data-tauri-drag-region="false"
        style={{ WebkitAppRegion: 'no-drag' } as any}
        className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border transition-all shadow-xs cursor-pointer ${
          report.isCritical
            ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-300 dark:border-red-800/60'
            : report.isWarning
            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-800/60'
            : 'bg-mac-surface dark:bg-white/[0.05] hover:bg-black/[0.03] dark:hover:bg-white/10 text-mac-textSecondary hover:text-mac-textPrimary border-mac-border dark:border-white/10'
        }`}
        title="查看 Token 开销拆解与生产费率看板"
      >
        <Coins size={13} className={report.isWarning ? 'text-amber-500' : 'text-mac-accentAmber'} />
        <span className="font-mono font-medium">{report.totalTokens} Tok</span>
        <span className="text-[11px] text-mac-textMuted font-mono hidden sm:inline">
          ≈ ${report.costPerCallUsd < 0.0001 ? '<0.0001' : report.costPerCallUsd.toFixed(4)}
        </span>
        {report.isWarning && <AlertTriangle size={12} className="text-amber-500" />}
      </button>

      {/* Popover Dropdown Card (Expanded to w-[360px] to prevent compression) */}
      {isOpen && (
        <div 
          className="absolute right-0 top-full mt-2 w-[360px] bg-white dark:bg-[#1c1c21] rounded-2xl shadow-2xl border border-mac-border/80 dark:border-white/10 p-4 z-50 text-xs animate-in fade-in zoom-in-95 duration-150 select-none"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header Row: Title & Close Button */}
          <div className="flex items-center justify-between border-b border-mac-border/50 dark:border-white/10 pb-2.5 mb-2.5">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex-shrink-0">
                <Coins size={15} />
              </div>
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-mac-textPrimary dark:text-zinc-100 text-xs">Token & 成本分析</h4>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-mac-accentBlue/10 text-mac-accentBlue font-mono font-semibold">
                  {report.totalTokens} Tok
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setIsModelPickerOpen(false);
              }}
              className="p-1 text-mac-textMuted hover:text-mac-textPrimary dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 rounded-md transition-colors cursor-pointer"
              title="关闭看板"
            >
              <X size={14} />
            </button>
          </div>

          {/* Model Selector Bar (Full-Width, Uncompressed) */}
          <div className="mb-3">
            <div className="flex items-center justify-between text-[11px] mb-1 text-mac-textMuted dark:text-zinc-400">
              <span>测算计费模型</span>
              <span className="font-mono text-[10px] text-mac-textSecondary dark:text-zinc-300">
                输入: ${report.rateInfo.inputPerMillionUsd}/1M · 输出: ${report.rateInfo.outputPerMillionUsd}/1M
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsModelPickerOpen(!isModelPickerOpen)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-mac-canvas dark:bg-white/[0.04] hover:bg-black/[0.04] dark:hover:bg-white/[0.08] border border-mac-border/70 dark:border-white/10 transition-all text-left cursor-pointer group shadow-2xs"
            >
              <div className="flex items-center gap-2 min-w-0 pr-1">
                <Sparkles size={13} className="text-mac-accentBlue flex-shrink-0" />
                <span className="font-medium text-mac-textPrimary dark:text-zinc-100 truncate text-xs">
                  {report.rateInfo.name}
                </span>
                <span className="text-[9px] px-1.5 py-0.5 rounded font-mono shrink-0 bg-black/[0.05] dark:bg-white/[0.08] text-mac-textMuted dark:text-zinc-400">
                  {report.rateInfo.category}
                </span>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0 text-mac-textMuted group-hover:text-mac-textPrimary dark:group-hover:text-zinc-200 transition-colors">
                <span className="text-[10px] font-mono font-semibold text-mac-accentBlue">
                  {report.rateInfo.isFree ? '免费 $0' : `$${report.rateInfo.inputPerMillionUsd}/1M`}
                </span>
                <ChevronDown 
                  size={13} 
                  className={`transition-transform duration-200 ${isModelPickerOpen ? 'rotate-180' : ''}`} 
                />
              </div>
            </button>

            {/* Controlled Searchable Dropdown (Fixed max-height, never overflows screen) */}
            {isModelPickerOpen && (
              <div className="mt-1.5 bg-white dark:bg-[#242429] border border-mac-border/80 dark:border-white/10 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                {/* Search Header */}
                <div className="p-2 border-b border-mac-border/50 dark:border-white/10 flex items-center gap-1.5 bg-black/[0.01] dark:bg-white/[0.02]">
                  <Search size={13} className="text-mac-textMuted flex-shrink-0 ml-1" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜索模型名称或分类 (如 deepseek, 4o, claude)..."
                    className="w-full text-xs bg-transparent border-none outline-none text-mac-textPrimary dark:text-zinc-100 placeholder:text-mac-textMuted/60 font-sans"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="p-0.5 text-mac-textMuted hover:text-mac-textPrimary rounded cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Scrollable Model List (max-h-48, scrollbar inside, zero screen overflow) */}
                <div className="max-h-48 overflow-y-auto divide-y divide-mac-border/30 dark:divide-white/[0.05]">
                  {/* Current Active App Model Link (if custom / not in list) */}
                  {apiConfig.model && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedModelKey(apiConfig.model);
                        setIsCustomMode(false);
                        setIsModelPickerOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 flex items-center justify-between text-xs transition-colors cursor-pointer ${
                        selectedModelKey === apiConfig.model && !isCustomMode
                          ? 'bg-mac-accentBlue/10 dark:bg-mac-accentBlue/20 text-mac-accentBlue font-medium'
                          : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.05] text-mac-textPrimary dark:text-zinc-200'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <Sparkles size={11} className="text-purple-500 flex-shrink-0" />
                        <span className="truncate">当前端点主模型 ({apiConfig.model})</span>
                      </div>
                      {selectedModelKey === apiConfig.model && !isCustomMode && (
                        <Check size={12} className="text-mac-accentBlue flex-shrink-0 ml-1" />
                      )}
                    </button>
                  )}

                  {/* Grouped Model Rates */}
                  {categories.map((cat) => {
                    const group = filteredModels.filter((m) => m.category === cat);
                    if (group.length === 0) return null;

                    return (
                      <div key={cat} className="py-1">
                        <div className="px-3 py-0.5 text-[9px] font-bold text-mac-textMuted/80 dark:text-zinc-400 tracking-wider">
                          {cat}
                        </div>
                        {group.map((m) => {
                          const isSelected = !isCustomMode && (selectedModelKey === m.id || selectedModelKey === m.name);
                          return (
                            <button
                              key={m.id || m.name}
                              type="button"
                              onClick={() => {
                                setSelectedModelKey(m.id || m.name);
                                setIsCustomMode(false);
                                setIsModelPickerOpen(false);
                              }}
                              className={`w-full text-left px-3 py-1.5 flex items-center justify-between text-xs transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-mac-accentBlue/10 dark:bg-mac-accentBlue/20 text-mac-accentBlue font-medium'
                                  : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.05] text-mac-textPrimary dark:text-zinc-200'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 truncate pr-2">
                                <span className="truncate">{m.name}</span>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[10px] font-mono text-mac-textMuted dark:text-zinc-400">
                                  {m.isFree ? '免费' : `$${m.inputPerMillionUsd}/M`}
                                </span>
                                {isSelected && (
                                  <Check size={12} className="text-mac-accentBlue" />
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}

                  {filteredModels.length === 0 && (
                    <div className="p-3 text-center text-xs text-mac-textMuted">
                      未找到匹配的模型，可在下方使用自定义费率
                    </div>
                  )}
                </div>

                {/* Custom Rate Toggle Bar */}
                <div className="p-2 border-t border-mac-border/50 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomMode(true);
                      setIsModelPickerOpen(false);
                    }}
                    className={`w-full py-1 px-2 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      isCustomMode
                        ? 'bg-mac-accentBlue text-white font-medium shadow-xs'
                        : 'hover:bg-black/5 dark:hover:bg-white/10 text-mac-textSecondary dark:text-zinc-300'
                    }`}
                  >
                    <SlidersHorizontal size={12} />
                    <span>自定义基准费率 (中转 / 私有折扣)</span>
                  </button>
                </div>
              </div>
            )}

            {/* Custom Rate Inline Inputs (if active) */}
            {isCustomMode && (
              <div className="mt-2 p-2.5 rounded-xl bg-mac-accentBlue/5 dark:bg-mac-accentBlue/10 border border-mac-accentBlue/30 text-xs space-y-1.5 animate-fade-in">
                <div className="flex items-center justify-between text-[11px] text-mac-accentBlue font-medium">
                  <span>自定义 Token 单价 (美元 / 100万 tokens)</span>
                  <button
                    type="button"
                    onClick={() => setIsCustomMode(false)}
                    className="text-[10px] underline hover:text-mac-accentBlueHover cursor-pointer"
                  >
                    恢复预设
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-mac-textMuted dark:text-zinc-400 mb-0.5">输入单价 ($/1M)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={customInputRate}
                      onChange={(e) => setCustomInputRate(e.target.value)}
                      className="w-full text-xs px-2 py-1 bg-white dark:bg-zinc-800 rounded-lg border border-mac-border dark:border-white/10 font-mono text-mac-textPrimary"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-mac-textMuted dark:text-zinc-400 mb-0.5">输出预估 ($/1M)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={customOutputRate}
                      onChange={(e) => setCustomOutputRate(e.target.value)}
                      className="w-full text-xs px-2 py-1 bg-white dark:bg-zinc-800 rounded-lg border border-mac-border dark:border-white/10 font-mono text-mac-textPrimary"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Token Breakdown Visual Progress Bar */}
          <div className="space-y-1.5 mb-3">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-mac-textMuted dark:text-zinc-400 font-medium">Token 结构拆解</span>
              <span className="font-mono font-semibold text-mac-textPrimary dark:text-zinc-100">{report.totalTokens} tokens</span>
            </div>

            <div className="h-2 w-full rounded-full bg-black/5 dark:bg-white/10 overflow-hidden flex">
              <div 
                style={{ width: `${sysPercent}%` }} 
                className="bg-emerald-500 transition-all duration-300" 
                title={`系统上下文: ${report.systemTokens} tokens`}
              />
              <div 
                style={{ width: `${tplPercent}%` }} 
                className="bg-blue-500 transition-all duration-300" 
                title={`提示词模板: ${report.templateTokens} tokens`}
              />
              <div 
                style={{ width: `${varPercent}%` }} 
                className="bg-purple-500 transition-all duration-300" 
                title={`入参变量: ${report.variableTokens} tokens`}
              />
            </div>

            {/* Legend */}
            <div className="grid grid-cols-3 gap-1 pt-1 text-[10px] text-mac-textMuted dark:text-zinc-400">
              <div className="flex items-center gap-1.5 truncate">
                <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                <span className="truncate">系统 {report.systemTokens}</span>
              </div>
              <div className="flex items-center gap-1.5 truncate">
                <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                <span className="truncate">模板 {report.templateTokens}</span>
              </div>
              <div className="flex items-center gap-1.5 truncate">
                <span className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0" />
                <span className="truncate">变量 {report.variableTokens}</span>
              </div>
            </div>
          </div>

          {/* Context Window Indicator */}
          <div className="p-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-mac-border/50 dark:border-white/10 space-y-1 mb-3">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-mac-textMuted dark:text-zinc-400">上下文窗口容量预警</span>
              <span className="font-mono text-mac-textSecondary dark:text-zinc-300">
                {report.totalTokens} / {(report.rateInfo.maxContext / 1024).toFixed(0)}k
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
              <div 
                style={{ width: `${Math.min(100, (report.totalTokens / report.rateInfo.maxContext) * 100)}%` }} 
                className={`h-full rounded-full transition-all duration-300 ${
                  report.isCritical ? 'bg-red-500' : report.isWarning ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
              />
            </div>
          </div>

          {/* Cost Estimates Matrix */}
          <div className="space-y-1.5 mb-2">
            <div className="text-[11px] font-medium text-mac-textSecondary dark:text-zinc-300 flex items-center justify-between">
              <span>调用规模预估成本</span>
              <span className="text-[10px] text-mac-textMuted dark:text-zinc-400 font-mono">美元 ($) / 人民币 (¥)</span>
            </div>

            <div className="divide-y divide-mac-border/40 dark:divide-white/10 border border-mac-border/50 dark:border-white/10 rounded-xl overflow-hidden text-[11px]">
              <div className="flex items-center justify-between px-3 py-1.5 bg-black/[0.01] dark:bg-white/[0.02]">
                <span className="text-mac-textSecondary dark:text-zinc-300">单次推理</span>
                <span className="font-mono font-medium text-mac-textPrimary dark:text-zinc-100">
                  ${report.costPerCallUsd < 0.0001 ? '<0.0001' : report.costPerCallUsd.toFixed(4)}
                  <span className="text-mac-textMuted dark:text-zinc-400 text-[10px] ml-1">
                    (¥{report.costPerCallCny.toFixed(3)})
                  </span>
                </span>
              </div>

              <div className="flex items-center justify-between px-3 py-1.5 bg-black/[0.01] dark:bg-white/[0.02]">
                <span className="text-mac-textSecondary dark:text-zinc-300">1 万次并发</span>
                <span className="font-mono font-medium text-mac-textPrimary dark:text-zinc-100">
                  ${(report.costPer100kUsd / 10).toFixed(2)}
                  <span className="text-mac-textMuted dark:text-zinc-400 text-[10px] ml-1">
                    (¥{(report.costPer100kCny / 10).toFixed(1)})
                  </span>
                </span>
              </div>

              <div className="flex items-center justify-between px-3 py-1.5 bg-amber-500/[0.03] dark:bg-amber-500/[0.08]">
                <span className="text-mac-textSecondary dark:text-amber-200 font-medium">10 万次批量</span>
                <span className="font-mono font-bold text-mac-accentAmber">
                  ${report.costPer100kUsd.toFixed(2)}
                  <span className="text-mac-textMuted dark:text-zinc-400 text-[10px] ml-1 font-normal">
                    (¥{report.costPer100kCny.toFixed(0)})
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
