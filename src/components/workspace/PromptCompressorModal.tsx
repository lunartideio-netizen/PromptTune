import React, { useState, useEffect, useRef } from 'react';
import { 
  Zap, 
  X, 
  Check, 
  Copy, 
  RotateCcw, 
  Loader2, 
  TrendingDown, 
  DollarSign, 
  ShieldCheck,
  AlertCircle,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { DiffViewer } from '../common/DiffViewer';
import { 
  calculateTokenSavings, 
  generateCompressorPrompt, 
  TokenSavingsReport 
} from '../../utils/promptCompressorUtils';
import { streamChat } from '../../services/llmService';
import { APIConfig } from '../../types';
import confetti from 'canvas-confetti';

interface PromptCompressorModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalText: string;
  apiConfig: APIConfig;
  onApplyCompressed: (compressedText: string) => void;
}

export const PromptCompressorModal: React.FC<PromptCompressorModalProps> = ({
  isOpen,
  onClose,
  originalText,
  apiConfig,
  onApplyCompressed,
}) => {
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressedText, setCompressedText] = useState('');
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const startCompression = async () => {
    if (!originalText.trim()) return;
    setIsCompressing(true);
    setCompressedText('');
    setErrorMsg(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const compressorPrompt = generateCompressorPrompt(originalText);

    try {
      await streamChat(
        [
          { role: 'user', content: compressorPrompt }
        ],
        apiConfig,
        {
          onChunk: (_chunk, accumulated) => {
            setCompressedText(accumulated);
          },
          onDone: () => {
            setIsCompressing(false);
            confetti({
              particleCount: 40,
              spread: 60,
              origin: { y: 0.5, x: 0.5 },
            });
          },
          onError: (err) => {
            setIsCompressing(false);
            setErrorMsg(err || '压缩请求失败，请检查网络或模型配置');
          },
        },
        abortController.signal
      );
    } catch (err: any) {
      setIsCompressing(false);
      setErrorMsg(err?.message || '发起压缩失败');
    }
  };

  useEffect(() => {
    if (isOpen) {
      setCompressedText('');
      setErrorMsg(null);
      startCompression();
    }
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [isOpen, originalText]);

  if (!isOpen) return null;

  const savingsReport: TokenSavingsReport = calculateTokenSavings(
    originalText,
    compressedText || originalText,
    apiConfig.model || 'gpt-4o'
  );

  const handleApply = () => {
    if (!compressedText.trim()) return;
    onApplyCompressed(compressedText.trim());
    onClose();
  };

  const handleCopy = async () => {
    if (!compressedText.trim()) return;
    await navigator.clipboard.writeText(compressedText.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div 
        className="bg-mac-surface dark:bg-zinc-900 border border-mac-border dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-4xl h-[86vh] min-h-[580px] flex flex-col overflow-hidden animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-mac-border dark:border-white/10 flex items-center justify-between shrink-0 bg-mac-canvas/50">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Zap size={16} strokeWidth={2.2} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-mac-textPrimary">Token 智能瘦身透镜</h3>
                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  无损语义压缩
                </span>
              </div>
              <p className="text-[11px] text-mac-textSecondary">消除无效口癖与套话，100% 捍卫约束与变量，极致节省 API 开销</p>
            </div>
          </div>

          <button
            onClick={() => {
              abortControllerRef.current?.abort();
              onClose();
            }}
            className="p-1 rounded-lg text-mac-textSecondary hover:text-mac-textPrimary hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* 核心指标看板 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-4 bg-mac-canvasAlt/40 dark:bg-white/[0.02] border-b border-mac-border dark:border-white/10 shrink-0">
          {/* 原文 Tokens */}
          <div className="p-2.5 rounded-xl bg-mac-surface dark:bg-white/[0.04] border border-mac-border dark:border-white/10 flex flex-col justify-center min-h-[60px]">
            <span className="text-[10px] text-mac-textMuted uppercase font-medium">原始 Token 消耗</span>
            <span className="text-base font-bold font-mono text-mac-textPrimary mt-0.5 tabular-nums">
              {savingsReport.originalTokens} <span className="text-[11px] font-normal text-mac-textMuted">Tok</span>
            </span>
          </div>

          {/* 瘦身后 Tokens */}
          <div className="p-2.5 rounded-xl bg-mac-surface dark:bg-white/[0.04] border border-mac-border dark:border-white/10 flex flex-col justify-center min-h-[60px]">
            <span className="text-[10px] text-mac-textMuted uppercase font-medium">瘦身后消耗</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                {savingsReport.compressedTokens}
              </span>
              <span className="text-[11px] font-normal text-mac-textMuted font-mono">Tok</span>
            </div>
          </div>

          {/* 压缩比率 */}
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col justify-center min-h-[60px]">
            <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1">
              <TrendingDown size={12} />
              <span>Token 缩减率</span>
            </span>
            <span className="text-base font-black font-mono text-emerald-600 dark:text-emerald-400 mt-0.5 tabular-nums">
              {savingsReport.savingRatePercent > 0 ? `-${savingsReport.savingRatePercent}%` : '--'}
            </span>
          </div>

          {/* 节省费用估算 */}
          <div className="p-2.5 rounded-xl bg-mac-surface dark:bg-white/[0.04] border border-mac-border dark:border-white/10 flex flex-col justify-center min-h-[60px]">
            <span className="text-[10px] text-mac-textMuted font-medium flex items-center gap-0.5">
              <DollarSign size={11} className="text-amber-500" />
              <span>万次调用节省</span>
            </span>
            <div className="flex items-baseline gap-1 mt-0.5 truncate tabular-nums">
              <span className="text-xs font-bold font-mono text-mac-textPrimary">
                ¥{savingsReport.estimatedCostSavedPer10kCallsCny}
              </span>
              <span className="text-[10px] font-mono text-mac-textMuted">
                (${savingsReport.estimatedCostSavedPer10kCallsUsd})
              </span>
            </div>
          </div>
        </div>

        {/* 检出的冗余特征词 */}
        {savingsReport.redundantPhrasesDetected.length > 0 && (
          <div className="px-5 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-2 shrink-0 flex-wrap">
            <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 shrink-0 flex items-center gap-1">
              <AlertCircle size={12} />
              <span>识别到冗余特征:</span>
            </span>
            {savingsReport.redundantPhrasesDetected.map((phrase, idx) => (
              <span 
                key={idx}
                className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-900 dark:text-amber-200 font-medium"
              >
                {phrase}
              </span>
            ))}
          </div>
        )}

        {/* 错误提示 */}
        {errorMsg && (
          <div className="m-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between shrink-0">
            <span>{errorMsg}</span>
            <button
              onClick={startCompression}
              className="px-2 py-1 bg-rose-500 text-white rounded-lg text-[10px] font-bold hover:bg-rose-600 transition-colors cursor-pointer"
            >
              重试
            </button>
          </div>
        )}

        {/* 内容区域：Diff 差异透镜比对 */}
        <div className="flex-1 min-h-0 p-4 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-2 shrink-0">
            <span className="text-xs font-semibold text-mac-textPrimary flex items-center gap-1.5">
              <span>瘦身变动透镜 (红色删除废话，绿色精炼指令)</span>
            </span>
            {isCompressing && (
              <span className="text-[11px] text-mac-accentBlue flex items-center gap-1.5 font-medium animate-pulse">
                <Loader2 size={12} className="animate-spin" />
                <span>AI 正在编译并极致压缩中...</span>
              </span>
            )}
          </div>

          <div className="flex-1 min-h-0 rounded-xl overflow-hidden flex flex-col">
            {compressedText ? (
              <DiffViewer 
                oldText={originalText} 
                newText={compressedText} 
                className="h-full w-full"
              />
            ) : isCompressing ? (
              <div className="flex-1 bg-mac-canvas rounded-xl border border-mac-border dark:border-white/10 flex flex-col items-center justify-center text-mac-textMuted p-8">
                <Loader2 size={24} className="animate-spin text-emerald-500 mb-2" />
                <span className="text-xs font-medium">正在分析语义结构与废话特征...</span>
              </div>
            ) : (
              <div className="flex-1 bg-mac-canvas rounded-xl border border-mac-border dark:border-white/10 flex items-center justify-center text-mac-textMuted text-xs">
                暂无压缩结果
              </div>
            )}
          </div>
        </div>

        {/* Footer 操作栏 */}
        <div className="px-5 py-3 border-t border-mac-border dark:border-white/10 bg-mac-canvas/50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={startCompression}
              disabled={isCompressing}
              className="px-3 py-1.5 rounded-xl border border-mac-border dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10 text-xs text-mac-textPrimary font-medium transition-all flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
            >
              <RotateCcw size={12} />
              <span>重新压缩</span>
            </button>

            <button
              type="button"
              onClick={handleCopy}
              disabled={!compressedText || isCompressing}
              className="px-3 py-1.5 rounded-xl border border-mac-border dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10 text-xs text-mac-textPrimary font-medium transition-all flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
            >
              {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
              <span>{copied ? '已复制' : '复制结果'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                abortControllerRef.current?.abort();
                onClose();
              }}
              className="px-3.5 py-1.5 rounded-xl border border-mac-border dark:border-white/10 text-xs text-mac-textSecondary hover:text-mac-textPrimary transition-all cursor-pointer"
            >
              取消
            </button>

            <button
              type="button"
              onClick={handleApply}
              disabled={!compressedText.trim() || isCompressing || compressedText.trim() === originalText.trim()}
              className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
            >
              <Check size={13} strokeWidth={2.5} />
              <span>采纳并替换为瘦身后版本</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
