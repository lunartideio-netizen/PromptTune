import React, { useState, useMemo } from 'react';
import { computeLineDiff, computeWordDiff, DiffType } from '../../utils/diffUtils';
import { Columns2, AlignLeft, Sparkles, Plus, Minus, Equal } from 'lucide-react';

interface DiffViewerProps {
  oldText: string;
  newText: string;
  oldTitle?: string;
  newTitle?: string;
  defaultMode?: 'split' | 'unified' | 'words';
  className?: string;
}

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

  // 计算词级 diff
  const wordDiffs = useMemo(() => {
    if (viewMode !== 'words') return [];
    return computeWordDiff(oldText || '', newText || '');
  }, [oldText, newText, viewMode]);

  // 分离 Split 模式下的左右行对齐数据
  const splitRows = useMemo(() => {
    if (viewMode !== 'split') return [];
    
    // 生成对齐行
    const rows: {
      left: { line?: number; text?: string; type: DiffType } | null;
      right: { line?: number; text?: string; type: DiffType } | null;
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
        // 检查下一项是否是 add，若是则作为修改配对显示
        const next = lineDiffs[i + 1];
        if (next && next.type === 'add') {
          rows.push({
            left: { line: leftLineNum++, text: item.value, type: 'del' },
            right: { line: rightLineNum++, text: next.value, type: 'add' },
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
    <div className={`flex flex-col bg-white/95 rounded-xl border border-mac-border shadow-xs overflow-hidden ${className}`}>
      {/* 1. Diff 顶栏控制器 */}
      <div className="flex-shrink-0 px-3 py-2 bg-mac-canvasAlt/60 border-b border-mac-border/80 flex items-center justify-between flex-wrap gap-2 text-xs">
        {/* 增删统计 Badge */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 font-mono text-[11px] tabular-nums">
            <span className="flex items-center gap-0.5 text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/80 font-semibold">
              <Plus size={10} strokeWidth={2.5} />
              {stats.addedLines} 行 (+{stats.addedChars} 字)
            </span>
            <span className="flex items-center gap-0.5 text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200/80 font-semibold">
              <Minus size={10} strokeWidth={2.5} />
              {stats.deletedLines} 行 (-{stats.deletedChars} 字)
            </span>
            <span className="text-mac-textMuted px-1">
              保持 {stats.unchangedLines} 行
            </span>
          </div>
        </div>

        {/* 视图切换按钮组 */}
        <div className="flex items-center bg-black/[0.04] p-0.5 rounded-lg border border-black/[0.06]">
          <button
            type="button"
            onClick={() => setViewMode('split')}
            className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all flex items-center gap-1 ${
              viewMode === 'split'
                ? 'bg-white text-mac-textPrimary shadow-xs font-semibold'
                : 'text-mac-textSecondary hover:text-mac-textPrimary'
            }`}
            title="左右分屏并排对照"
          >
            <Columns2 size={12} strokeWidth={2} />
            <span>并排对比</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('unified')}
            className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all flex items-center gap-1 ${
              viewMode === 'unified'
                ? 'bg-white text-mac-textPrimary shadow-xs font-semibold'
                : 'text-mac-textSecondary hover:text-mac-textPrimary'
            }`}
            title="单流连续内联对比"
          >
            <AlignLeft size={12} strokeWidth={2} />
            <span>内联对比</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('words')}
            className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all flex items-center gap-1 ${
              viewMode === 'words'
                ? 'bg-white text-mac-textPrimary shadow-xs font-semibold'
                : 'text-mac-textSecondary hover:text-mac-textPrimary'
            }`}
            title="字词级精细高亮"
          >
            <Sparkles size={12} strokeWidth={2} />
            <span>词级透镜</span>
          </button>
        </div>
      </div>

      {/* 2. 差异正文展示区域 */}
      <div className="flex-1 overflow-auto font-mono text-[11.5px] leading-relaxed select-text min-h-[160px]">
        {/* A. 左右并排模式 (Split) */}
        {viewMode === 'split' && (
          <div className="min-w-[600px] flex flex-col divide-y divide-mac-border/40">
            {/* Split Header */}
            <div className="grid grid-cols-2 bg-mac-canvas/80 text-[10px] text-mac-textSecondary font-semibold border-b border-mac-border/60">
              <div className="px-3 py-1.5 border-r border-mac-border/60 flex items-center justify-between">
                <span>{oldTitle}</span>
                <span className="text-mac-textMuted font-normal">原文本</span>
              </div>
              <div className="px-3 py-1.5 flex items-center justify-between text-emerald-800">
                <span>{newTitle}</span>
                <span className="text-emerald-600 font-normal">优化重塑</span>
              </div>
            </div>

            {/* Split Rows */}
            {splitRows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-2 divide-x divide-mac-border/50 hover:bg-black/[0.01]">
                {/* Left Cell */}
                <div
                  className={`flex items-start px-2 py-0.5 ${
                    row.left?.type === 'del'
                      ? 'bg-red-50/70 text-red-900 border-l-2 border-red-500'
                      : 'text-mac-textSecondary'
                  }`}
                >
                  <span className="w-8 shrink-0 text-right pr-2 text-[10px] text-mac-textMuted select-none tabular-nums font-mono">
                    {row.left?.line ?? ''}
                  </span>
                  <span className="whitespace-pre-wrap break-all flex-1">
                    {row.left?.text ?? ''}
                  </span>
                </div>

                {/* Right Cell */}
                <div
                  className={`flex items-start px-2 py-0.5 ${
                    row.right?.type === 'add'
                      ? 'bg-emerald-50/70 text-emerald-950 font-medium border-l-2 border-emerald-500'
                      : 'text-mac-textPrimary'
                  }`}
                >
                  <span className="w-8 shrink-0 text-right pr-2 text-[10px] text-mac-textMuted select-none tabular-nums font-mono">
                    {row.right?.line ?? ''}
                  </span>
                  <span className="whitespace-pre-wrap break-all flex-1">
                    {row.right?.text ?? ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* B. 单流内联模式 (Unified) */}
        {viewMode === 'unified' && (
          <div className="divide-y divide-mac-border/30">
            {lineDiffs.map((item, idx) => {
              const isAdd = item.type === 'add';
              const isDel = item.type === 'del';
              return (
                <div
                  key={idx}
                  className={`flex items-start px-2 py-0.5 ${
                    isAdd
                      ? 'bg-emerald-50/70 text-emerald-950 font-medium border-l-2 border-emerald-500'
                      : isDel
                      ? 'bg-red-50/70 text-red-900 line-through opacity-80 border-l-2 border-red-500'
                      : 'text-mac-textPrimary'
                  }`}
                >
                  <span className="w-6 shrink-0 text-center text-[10px] font-bold select-none">
                    {isAdd ? '+' : isDel ? '-' : ' '}
                  </span>
                  <span className="w-8 shrink-0 text-right pr-2 text-[10px] text-mac-textMuted select-none tabular-nums font-mono">
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
          <div className="p-3.5 whitespace-pre-wrap leading-relaxed">
            {wordDiffs.map((token, idx) => {
              if (token.type === 'add') {
                return (
                  <span
                    key={idx}
                    className="bg-emerald-100 text-emerald-950 px-0.5 rounded font-medium border border-emerald-300/60"
                  >
                    {token.value}
                  </span>
                );
              }
              if (token.type === 'del') {
                return (
                  <span
                    key={idx}
                    className="bg-red-100 text-red-800 line-through opacity-75 px-0.5 rounded border border-red-200/60"
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
