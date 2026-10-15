import React, { useState, useMemo } from 'react';
import { computeLineDiff, computeWordDiff, DiffType, DiffToken } from '../../utils/diffUtils';
import { Columns2, AlignLeft, Sparkles, Plus, Minus } from 'lucide-react';

interface DiffViewerProps {
  oldText: string;
  newText: string;
  oldTitle?: string;
  newTitle?: string;
  defaultMode?: 'split' | 'unified' | 'words';
  className?: string;
}

/**
 * 针对配对的单行做词级深度高亮 (Intra-line Word Diff)
 */
const LineWordDiff: React.FC<{
  type: 'del' | 'add';
  currentText: string;
  pairedText?: string;
}> = ({ type, currentText, pairedText }) => {
  if (!pairedText) {
    return <span className="whitespace-pre-wrap break-all flex-1">{currentText}</span>;
  }

  const tokens = useMemo(() => {
    return computeWordDiff(
      type === 'del' ? currentText : pairedText,
      type === 'del' ? pairedText : currentText
    );
  }, [type, currentText, pairedText]);

  return (
    <span className="whitespace-pre-wrap break-all flex-1">
      {tokens.map((tok, idx) => {
        if (type === 'del') {
          if (tok.type === 'del') {
            return (
              <mark
                key={idx}
                className="bg-red-200/90 dark:bg-rose-900/60 text-red-950 dark:text-rose-200 font-bold px-0.5 rounded shadow-2xs"
              >
                {tok.value}
              </mark>
            );
          }
          if (tok.type === 'eq') {
            return <span key={idx}>{tok.value}</span>;
          }
          return null;
        } else {
          if (tok.type === 'add') {
            return (
              <mark
                key={idx}
                className="bg-emerald-200/90 dark:bg-emerald-900/60 text-emerald-950 dark:text-emerald-200 font-bold px-0.5 rounded shadow-2xs"
              >
                {tok.value}
              </mark>
            );
          }
          if (tok.type === 'eq') {
            return <span key={idx}>{tok.value}</span>;
          }
          return null;
        }
      })}
    </span>
  );
};

export const DiffViewer: React.FC<DiffViewerProps> = ({
  oldText,
  newText,
  oldTitle = '原始版本',
  newTitle = '新版本 / 优化成果',
  defaultMode = 'split',
  className = '',
}) => {
  const [viewMode, setViewMode] = useState<'split' | 'unified' | 'words'>(defaultMode);

  // 计算行级 diff 与统计
  const { diffs: lineDiffs, stats } = useMemo(() => {
    return computeLineDiff(oldText || '', newText || '');
  }, [oldText, newText]);

  // 计算全文词级 diff
  const wordDiffs = useMemo(() => {
    if (viewMode !== 'words') return [];
    return computeWordDiff(oldText || '', newText || '');
  }, [oldText, newText, viewMode]);

  // 分离 Split 模式下的左右行对齐数据
  const splitRows = useMemo(() => {
    if (viewMode !== 'split') return [];
    
    const rows: {
      left: { line?: number; text?: string; type: DiffType; pairedText?: string } | null;
      right: { line?: number; text?: string; type: DiffType; pairedText?: string } | null;
    }[] = [];

    let leftLineNum = 1;
    let rightLineNum = 1;

    let i = 0;
    while (i < lineDiffs.length) {
      const item = lineDiffs[i];

      if (item.type === 'eq') {
        rows.push({
          left: { line: leftLineNum++, text: item.value, type: 'eq' },
          right: { line: rightLineNum++, text: item.value, type: 'eq' },
        });
        i++;
      } else if (item.type === 'del') {
        const next = lineDiffs[i + 1];
        if (next && next.type === 'add') {
          rows.push({
            left: { line: leftLineNum++, text: item.value, type: 'del', pairedText: next.value },
            right: { line: rightLineNum++, text: next.value, type: 'add', pairedText: item.value },
          });
          i += 2;
        } else {
          rows.push({
            left: { line: leftLineNum++, text: item.value, type: 'del' },
            right: null,
          });
          i++;
        }
      } else if (item.type === 'add') {
        rows.push({
          left: null,
          right: { line: rightLineNum++, text: item.value, type: 'add' },
        });
        i++;
      }
    }

    return rows;
  }, [lineDiffs, viewMode]);

  return (
    <div className={`flex flex-col bg-white/95 dark:bg-zinc-900 rounded-xl border border-mac-border dark:border-white/10 shadow-xs overflow-hidden ${className}`}>
      {/* 1. Diff 顶栏控制器 */}
      <div className="flex-shrink-0 h-10 px-3 bg-mac-canvasAlt/60 dark:bg-white/[0.03] border-b border-mac-border/80 dark:border-white/10 flex items-center justify-between flex-nowrap gap-2 text-xs overflow-hidden select-none">
        {/* 增删统计 Badge */}
        <div className="flex items-center gap-2 shrink-0 min-w-0 overflow-hidden">
          <div className="flex items-center gap-1 font-mono text-[11px] tabular-nums whitespace-nowrap">
            <span className="flex items-center gap-0.5 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-200/80 dark:border-emerald-800/40 font-semibold shrink-0">
              <Plus size={10} strokeWidth={2.5} />
              {stats.addedLines} 行 (+{stats.addedChars} 字)
            </span>
            <span className="flex items-center gap-0.5 text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.5 rounded border border-rose-200/80 dark:border-rose-800/40 font-semibold shrink-0">
              <Minus size={10} strokeWidth={2.5} />
              {stats.deletedLines} 行 (-{stats.deletedChars} 字)
            </span>
            <span className="text-mac-textMuted dark:text-zinc-500 px-1 shrink-0 hidden md:inline">
              保持 {stats.unchangedLines} 行
            </span>
          </div>
        </div>

        {/* 视图切换按钮组 */}
        <div className="flex items-center bg-black/[0.04] dark:bg-white/[0.06] p-0.5 rounded-lg border border-black/[0.06] dark:border-white/10 shrink-0 whitespace-nowrap">
          <button
            type="button"
            onClick={() => setViewMode('split')}
            className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all flex items-center gap-1 cursor-pointer ${
              viewMode === 'split'
                ? 'bg-white dark:bg-zinc-800 text-mac-textPrimary dark:text-zinc-100 shadow-xs font-semibold'
                : 'text-mac-textSecondary dark:text-zinc-400 hover:text-mac-textPrimary dark:hover:text-zinc-200'
            }`}
            title="左右分屏并排对照 (支持行内词级精准高亮)"
          >
            <Columns2 size={12} strokeWidth={2} />
            <span>并排对比</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('unified')}
            className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all flex items-center gap-1 cursor-pointer ${
              viewMode === 'unified'
                ? 'bg-white dark:bg-zinc-800 text-mac-textPrimary dark:text-zinc-100 shadow-xs font-semibold'
                : 'text-mac-textSecondary dark:text-zinc-400 hover:text-mac-textPrimary dark:hover:text-zinc-200'
            }`}
            title="单流连续内联对比"
          >
            <AlignLeft size={12} strokeWidth={2} />
            <span>内联对比</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('words')}
            className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all flex items-center gap-1 cursor-pointer ${
              viewMode === 'words'
                ? 'bg-white dark:bg-zinc-800 text-mac-textPrimary dark:text-zinc-100 shadow-xs font-semibold'
                : 'text-mac-textSecondary dark:text-zinc-400 hover:text-mac-textPrimary dark:hover:text-zinc-200'
            }`}
            title="字词级精细高亮"
          >
            <Sparkles size={12} strokeWidth={2} />
            <span>词级透镜</span>
          </button>
        </div>
      </div>

      {/* 2. 差异正文展示区域 */}
      <div 
        className="flex-1 overflow-auto font-mono text-[11.5px] leading-relaxed select-text min-h-[160px]"
        style={{ overflowAnchor: 'none' }}
      >
        {/* A. 左右并排模式 (Split) */}
        {viewMode === 'split' && (
          <div className="min-w-[600px] flex flex-col divide-y divide-mac-border/40 dark:divide-white/5">
            {/* Split Header */}
            <div className="grid grid-cols-2 bg-mac-canvas/80 dark:bg-zinc-800/60 text-[10px] text-mac-textSecondary dark:text-zinc-400 font-semibold border-b border-mac-border/60 dark:border-white/10">
              <div className="px-3 py-1.5 border-r border-mac-border/60 dark:border-white/10 flex items-center justify-between">
                <span>{oldTitle}</span>
                <span className="text-mac-textMuted dark:text-zinc-500 font-normal">原文本</span>
              </div>
              <div className="px-3 py-1.5 flex items-center justify-between text-emerald-800 dark:text-emerald-300">
                <span>{newTitle}</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-normal">优化重塑</span>
              </div>
            </div>

            {/* Split Rows */}
            {splitRows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-2 divide-x divide-mac-border/50 dark:divide-white/5 hover:bg-black/[0.01] dark:hover:bg-white/[0.01]">
                {/* Left Cell */}
                <div
                  className={`flex items-start px-2 py-0.5 ${
                    row.left?.type === 'del'
                      ? 'bg-red-50/70 dark:bg-rose-950/20 text-red-900 dark:text-rose-300 border-l-2 border-red-500'
                      : 'text-mac-textSecondary dark:text-zinc-400'
                  }`}
                >
                  <span className="w-8 shrink-0 text-right pr-2 text-[10px] text-mac-textMuted dark:text-zinc-500 select-none tabular-nums font-mono">
                    {row.left?.line ?? ''}
                  </span>
                  {row.left?.type === 'del' && row.left.pairedText ? (
                    <LineWordDiff
                      type="del"
                      currentText={row.left.text ?? ''}
                      pairedText={row.left.pairedText}
                    />
                  ) : (
                    <span className="whitespace-pre-wrap break-all flex-1">
                      {row.left?.text ?? ''}
                    </span>
                  )}
                </div>

                {/* Right Cell */}
                <div
                  className={`flex items-start px-2 py-0.5 ${
                    row.right?.type === 'add'
                      ? 'bg-emerald-50/70 dark:bg-emerald-950/20 text-emerald-950 dark:text-emerald-200 font-medium border-l-2 border-emerald-500'
                      : 'text-mac-textPrimary dark:text-zinc-200'
                  }`}
                >
                  <span className="w-8 shrink-0 text-right pr-2 text-[10px] text-mac-textMuted dark:text-zinc-500 select-none tabular-nums font-mono">
                    {row.right?.line ?? ''}
                  </span>
                  {row.right?.type === 'add' && row.right.pairedText ? (
                    <LineWordDiff
                      type="add"
                      currentText={row.right.text ?? ''}
                      pairedText={row.right.pairedText}
                    />
                  ) : (
                    <span className="whitespace-pre-wrap break-all flex-1">
                      {row.right?.text ?? ''}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* B. 单流内联模式 (Unified) */}
        {viewMode === 'unified' && (
          <div className="divide-y divide-mac-border/30 dark:divide-white/5">
            {lineDiffs.map((item, idx) => {
              const isAdd = item.type === 'add';
              const isDel = item.type === 'del';
              return (
                <div
                  key={idx}
                  className={`flex items-start px-2 py-0.5 ${
                    isAdd
                      ? 'bg-emerald-50/70 dark:bg-emerald-950/20 text-emerald-950 dark:text-emerald-200 font-medium border-l-2 border-emerald-500'
                      : isDel
                      ? 'bg-red-50/70 dark:bg-rose-950/20 text-red-900 dark:text-rose-300 line-through opacity-80 border-l-2 border-red-500'
                      : 'text-mac-textPrimary dark:text-zinc-200'
                  }`}
                >
                  <span className="w-6 shrink-0 text-center text-[10px] font-bold select-none">
                    {isAdd ? '+' : isDel ? '-' : ' '}
                  </span>
                  <span className="w-8 shrink-0 text-right pr-2 text-[10px] text-mac-textMuted dark:text-zinc-500 select-none tabular-nums font-mono">
                    {item.lineA || item.lineB || ''}
                  </span>
                  <span className="whitespace-pre-wrap break-all flex-1">
                    {item.value}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* C. 词级高亮模式 (Words) */}
        {viewMode === 'words' && (
          <div className="p-3.5 whitespace-pre-wrap leading-relaxed text-mac-textPrimary dark:text-zinc-200">
            {wordDiffs.map((token, idx) => {
              if (token.type === 'add') {
                return (
                  <span
                    key={idx}
                    className="bg-emerald-100 dark:bg-emerald-950/60 text-emerald-950 dark:text-emerald-200 px-0.5 rounded font-medium border border-emerald-300/60 dark:border-emerald-700/60"
                  >
                    {token.value}
                  </span>
                );
              }
              if (token.type === 'del') {
                return (
                  <span
                    key={idx}
                    className="bg-red-100 dark:bg-rose-950/60 text-red-800 dark:text-rose-300 line-through opacity-75 px-0.5 rounded border border-red-200/60 dark:border-rose-800/60"
                  >
                    {token.value}
                  </span>
                );
              }
              return <span key={idx}>{token.value}</span>;
            })}
          </div>
        )}
      </div>
    </div>
  );
};
