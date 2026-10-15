import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Check, Download, Terminal, Code, FileCode, ShieldCheck } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { generateExportCode, CodeExportLanguage } from '../../utils/codeGenUtils';
import { PromptVariable } from '../../types';

interface ExportCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  promptText: string;
  variables: PromptVariable[];
  systemContext?: string;
}

export const ExportCodeModal: React.FC<ExportCodeModalProps> = ({
  isOpen,
  onClose,
  title,
  promptText,
  variables,
  systemContext = '',
}) => {
  const { apiConfig } = useAppStore();
  const [selectedLang, setSelectedLang] = useState<CodeExportLanguage>('python');
  const [copied, setCopied] = useState(false);
  const [customModel, setCustomModel] = useState(apiConfig.model || 'gpt-4o');

  const code = useMemo(() => {
    return generateExportCode(selectedLang, {
      title: title || 'PromptTemplate',
      systemContext,
      promptText,
      variables,
      model: customModel,
      baseUrl: apiConfig.baseUrl || 'https://api.openai.com/v1',
      temperature: apiConfig.temperature ?? 0.7,
    });
  }, [selectedLang, title, systemContext, promptText, variables, customModel, apiConfig]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const extMap: Record<CodeExportLanguage, string> = {
      python: 'py',
      typescript: 'ts',
      langchain: 'py',
      curl: 'sh',
      promptfoo: 'yaml',
    };
    const filename = `${(title || 'prompt').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_')}.${extMap[selectedLang]}`;
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const tabs: { id: CodeExportLanguage; label: string; icon: React.ReactNode; ext: string }[] = [
    { id: 'python', label: 'Python (OpenAI)', icon: <FileCode size={14} />, ext: '.py' },
    { id: 'typescript', label: 'TypeScript (Node)', icon: <Code size={14} />, ext: '.ts' },
    { id: 'langchain', label: 'LangChain (LCEL)', icon: <FileCode size={14} />, ext: '.py' },
    { id: 'curl', label: 'cURL (Bash)', icon: <Terminal size={14} />, ext: '.sh' },
    { id: 'promptfoo', label: 'Promptfoo (CI/CD YAML)', icon: <ShieldCheck size={14} className="text-mac-accentGreen" />, ext: '.yaml' },
  ];

  return createPortal(
    <div 
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-[#1c1c21] border border-mac-border/80 dark:border-white/10 rounded-2xl shadow-2xl max-w-3xl w-full flex flex-col max-h-[85vh] overflow-hidden select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-mac-border/60 dark:border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-mac-accentBlue/10 text-mac-accentBlue">
              <Code size={18} strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-mac-textPrimary dark:text-zinc-100">导出生产级工程代码</h3>
              <p className="text-xs text-mac-textMuted dark:text-zinc-400">一键生成开箱即用的 SDK 调用代码，支持变量自动传参与上下文注入</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-mac-textMuted hover:text-mac-textPrimary dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Toolbar & Language Tabs */}
        <div className="px-6 py-3 bg-black/[0.02] dark:bg-white/[0.02] border-b border-mac-border/40 dark:border-white/10 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-1.5 p-1 bg-black/[0.04] dark:bg-white/[0.06] rounded-xl border border-mac-border/40 dark:border-white/10">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedLang(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                  selectedLang === tab.id
                    ? 'bg-white dark:bg-white/15 text-mac-accentBlue dark:text-blue-400 shadow-xs font-semibold'
                    : 'text-mac-textSecondary dark:text-zinc-400 hover:text-mac-textPrimary dark:hover:text-zinc-200'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-mac-textMuted dark:text-zinc-400">目标模型:</span>
            <input
              type="text"
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              className="text-xs px-2.5 py-1 rounded-lg border border-mac-border dark:border-white/10 bg-white dark:bg-zinc-800 text-mac-textPrimary dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-mac-accentBlue w-36 font-mono"
              placeholder="gpt-4o"
            />
          </div>
        </div>

        {/* Code View Body */}
        <div className="flex-1 overflow-auto p-4 bg-[#18181f] text-[#f8f8f2] font-mono text-xs leading-relaxed relative group select-text">
          <pre className="overflow-x-auto whitespace-pre">
            <code>{code}</code>
          </pre>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-mac-border/60 dark:border-white/10 bg-mac-surface dark:bg-[#1c1c21] flex items-center justify-between">
          <div className="text-xs text-mac-textMuted dark:text-zinc-400 flex items-center gap-2">
            <span>入参变量: {variables.length} 个</span>
            {systemContext.trim() && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-mac-accentPurple/10 text-mac-accentPurple dark:bg-purple-950/40 dark:text-purple-300">
                包含项目级上下文
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-xl border border-mac-border dark:border-white/10 text-mac-textPrimary dark:text-zinc-200 hover:bg-black/[0.04] dark:hover:bg-white/10 transition-all cursor-pointer"
            >
              <Download size={13} />
              <span>下载源码</span>
            </button>

            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-xl bg-mac-accentBlue text-white hover:brightness-105 active:scale-95 transition-all shadow-sm cursor-pointer"
            >
              {copied ? (
                <>
                  <Check size={14} className="text-white" />
                  <span>已复制到剪贴板</span>
                </>
              ) : (
                <>
                  <Copy size={14} />
                  <span>复制代码</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
