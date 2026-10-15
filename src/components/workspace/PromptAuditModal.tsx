import React, { useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  ShieldCheck, 
  ShieldAlert, 
  AlertTriangle, 
  Info, 
  Sparkles, 
  CheckCircle2, 
  Wand2, 
  ArrowUpRight 
} from 'lucide-react';
import { auditPrompt, normalizeVariables, wrapVariablesWithDelimiters, AuditIssue } from '../../utils/promptAuditUtils';

interface PromptAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  promptText: string;
  onApplyPatch: (newText: string) => void;
}

export const PromptAuditModal: React.FC<PromptAuditModalProps> = ({
  isOpen,
  onClose,
  promptText,
  onApplyPatch,
}) => {
  const report = useMemo(() => auditPrompt(promptText), [promptText]);

  const handleApplySingleIssue = (issue: AuditIssue) => {
    if (issue.patchType === 'append' && issue.patchText) {
      const patched = promptText.trim() + issue.patchText;
      onApplyPatch(patched);
    } else if (issue.patchType === 'replace_variables') {
      const normalized = normalizeVariables(promptText);
      onApplyPatch(normalized);
    } else if (issue.patchType === 'wrap_variables_with_delimiters') {
      const wrapped = wrapVariablesWithDelimiters(promptText);
      onApplyPatch(wrapped);
    }
  };

  const handleApplyAllPatches = () => {
    let current = promptText;
    for (const issue of report.issues) {
      if (issue.patchType === 'append' && issue.patchText) {
        current = current.trim() + issue.patchText;
      } else if (issue.patchType === 'replace_variables') {
        current = normalizeVariables(current);
      } else if (issue.patchType === 'wrap_variables_with_delimiters') {
        current = wrapVariablesWithDelimiters(current);
      }
    }
    onApplyPatch(current);
  };

  const hasFixableIssues = report.issues.some((i) => i.patchText || i.patchType === 'replace_variables' || i.patchType === 'wrap_variables_with_delimiters');

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const gradeColors = {
    S: 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300',
    A: 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300',
    B: 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300',
    C: 'bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-950/40 dark:text-orange-300',
    D: 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300',
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in select-none"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-2xl bg-white dark:bg-zinc-900 border border-mac-border/80 dark:border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 px-5 py-4 border-b border-mac-border/60 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-mac-accentBlue/10 flex items-center justify-center text-mac-accentBlue">
              <ShieldCheck size={18} strokeWidth={2} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-mac-textPrimary dark:text-zinc-100">
                  提示词健康体检与安全审计报告
                </h3>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border font-bold ${gradeColors[report.grade]}`}>
                  等级 {report.grade}
                </span>
              </div>
              <p className="text-[11px] text-mac-textSecondary dark:text-zinc-400">
                基于生产级防越狱隔离、反模式识别与边界鲁棒性深度检测
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-mac-textSecondary hover:text-mac-textPrimary rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Overview Score & Metrics */}
        <div className="flex-shrink-0 p-5 bg-black/[0.02] dark:bg-white/[0.02] border-b border-mac-border/40 dark:border-white/10">
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 items-center">
            {/* Total Score Badge */}
            <div className="sm:col-span-2 flex items-center gap-3 bg-white dark:bg-zinc-800/80 p-3.5 rounded-xl border border-mac-border/60 dark:border-white/10 shadow-xs">
              <div className="text-3xl font-black font-mono text-mac-accentBlue tracking-tight">
                {report.score}
                <span className="text-xs font-normal text-mac-textSecondary dark:text-zinc-400 ml-1">/100</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-mac-textPrimary dark:text-zinc-200">
                  {report.score >= 90 ? '卓越级架构' : report.score >= 80 ? '良好规范' : '建议加固'}
                </div>
                <div className="text-[11px] text-mac-textSecondary dark:text-zinc-400 truncate">
                  发现 {report.issues.length} 项优化点 · {report.passedChecks.length} 项合格
                </div>
              </div>
            </div>

            {/* 4 Dimension Bars */}
            <div className="sm:col-span-3 grid grid-cols-2 gap-2.5">
              <div>
                <div className="flex justify-between text-[11px] mb-1 font-medium text-mac-textPrimary dark:text-zinc-300">
                  <span>安全防越狱</span>
                  <span className="font-mono text-mac-accentBlue">{report.metrics.security}%</span>
                </div>
                <div className="h-1.5 w-full bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 rounded-full transition-all duration-300"
                    style={{ width: `${report.metrics.security}%` }} 
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1 font-medium text-mac-textPrimary dark:text-zinc-300">
                  <span>指令明确度</span>
                  <span className="font-mono text-purple-600">{report.metrics.clarity}%</span>
                </div>
                <div className="h-1.5 w-full bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-purple-500 rounded-full transition-all duration-300"
                    style={{ width: `${report.metrics.clarity}%` }} 
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1 font-medium text-mac-textPrimary dark:text-zinc-300">
                  <span>边界鲁棒性</span>
                  <span className="font-mono text-emerald-600">{report.metrics.robustness}%</span>
                </div>
                <div className="h-1.5 w-full bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                    style={{ width: `${report.metrics.robustness}%` }} 
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1 font-medium text-mac-textPrimary dark:text-zinc-300">
                  <span>格式严谨性</span>
                  <span className="font-mono text-amber-600">{report.metrics.format}%</span>
                </div>
                <div className="h-1.5 w-full bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-amber-500 rounded-full transition-all duration-300"
                    style={{ width: `${report.metrics.format}%` }} 
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
          {/* Issues Section */}
          {report.issues.length > 0 ? (
            <div>
              <div className="text-xs font-bold text-mac-textPrimary dark:text-zinc-200 mb-2.5 flex items-center gap-1.5">
                <AlertTriangle size={13} className="text-amber-500" />
                <span>待加固项与优化建议 ({report.issues.length})</span>
              </div>
              <div className="space-y-2.5">
                {report.issues.map((issue) => (
                  <div 
                    key={issue.id}
                    className="p-3.5 rounded-xl border border-mac-border/70 dark:border-white/10 bg-white dark:bg-zinc-800/50 shadow-xs flex flex-col gap-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {issue.severity === 'critical' ? (
                          <ShieldAlert size={15} className="text-rose-500 shrink-0" />
                        ) : issue.severity === 'warning' ? (
                          <AlertTriangle size={15} className="text-amber-500 shrink-0" />
                        ) : (
                          <Info size={15} className="text-blue-500 shrink-0" />
                        )}
                        <span className="text-xs font-bold text-mac-textPrimary dark:text-zinc-100">
                          {issue.title}
                        </span>
                      </div>

                      {(issue.patchText || issue.patchType === 'replace_variables') && (
                        <button
                          type="button"
                          onClick={() => handleApplySingleIssue(issue)}
                          className="px-2 py-0.5 text-[11px] rounded-lg bg-mac-accentBlue/10 hover:bg-mac-accentBlue text-mac-accentBlue hover:text-white font-medium transition-all flex items-center gap-1 shrink-0 cursor-pointer shadow-2xs"
                        >
                          <Wand2 size={11} />
                          <span>一键修复补丁</span>
                        </button>
                      )}
                    </div>

                    <p className="text-xs text-mac-textSecondary dark:text-zinc-400 leading-relaxed">
                      {issue.description}
                    </p>

                    <div className="text-[11px] text-mac-accentPurple bg-purple-500/5 dark:bg-purple-950/20 border border-purple-500/10 p-2 rounded-lg font-mono">
                      💡 建议: {issue.suggestion}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-300 flex items-center gap-2 text-xs">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>当前提示词架构极其完善，未发现严重反模式或安全漏洞！</span>
            </div>
          )}

          {/* Passed Checks Section */}
          {report.passedChecks.length > 0 && (
            <div className="pt-2">
              <div className="text-xs font-bold text-mac-textPrimary dark:text-zinc-200 mb-2 flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-emerald-500" />
                <span>已通过合规指标 ({report.passedChecks.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {report.passedChecks.map((check, idx) => (
                  <div 
                    key={idx}
                    className="p-2.5 rounded-lg bg-black/[0.02] dark:bg-white/[0.02] border border-mac-border/50 dark:border-white/5 text-[11px] text-mac-textSecondary dark:text-zinc-300 flex items-center gap-2"
                  >
                    <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                    <span className="truncate">{check}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 py-3 border-t border-mac-border/60 dark:border-white/10 bg-black/[0.01] dark:bg-zinc-900 flex items-center justify-between">
          <span className="text-[11px] text-mac-textSecondary dark:text-zinc-400 font-mono">
            提示词安全协议 v1.2 · 自动防护
          </span>

          <div className="flex items-center gap-2">
            {hasFixableIssues && (
              <button
                type="button"
                onClick={handleApplyAllPatches}
                className="px-3 py-1.5 text-xs rounded-xl bg-mac-accentBlue text-white hover:bg-mac-accentBlueHover font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles size={13} />
                <span>一键修复全部可用补丁</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-xl border border-mac-border dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 text-mac-textPrimary dark:text-zinc-200 font-medium transition-all cursor-pointer"
            >
              完成
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
