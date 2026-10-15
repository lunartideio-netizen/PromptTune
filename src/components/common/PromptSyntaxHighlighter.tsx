import React, { useMemo, useState } from 'react';
import { Copy, Check, Code, Link } from 'lucide-react';
import { tokenizePromptSyntax, splitPromptBlocks, PromptBlock } from '../../utils/syntaxHighlightUtils';
import { useAppStore } from '../../store/useAppStore';

interface PromptSyntaxHighlighterProps {
  content: string;
  onDoubleClick?: () => void;
  className?: string;
}

// 独立可一键复制的代码块子卡片
const CodeBlockCard: React.FC<{ code: string; lang: string }> = ({ code, lang }) => {
  const [copied, setCopied] = useState(false);
  const codeTokens = useMemo(() => tokenizePromptSyntax(code), [code]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div 
      className="my-3 rounded-xl border border-mac-border/80 dark:border-white/10 bg-[#16161a] dark:bg-[#121215] text-[#f8f8f2] overflow-hidden shadow-xs select-text"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-3 py-1.5 bg-black/30 border-b border-white/5 select-none text-[11px]">
        <div className="flex items-center gap-1.5 text-zinc-400 font-mono">
          <Code size={13} className="text-mac-accentBlue" />
          <span className="uppercase font-semibold tracking-wider">{lang || 'CODE'}</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer text-[10px]"
          title="独立复制当前代码块"
        >
          {copied ? (
            <>
              <Check size={11} className="text-emerald-400" />
              <span className="text-emerald-400 font-medium">已复制</span>
            </>
          ) : (
            <>
              <Copy size={11} />
              <span>复制代码</span>
            </>
          )}
        </button>
      </div>
      <div className="p-3 text-xs font-mono leading-relaxed overflow-x-auto whitespace-pre">
        {codeTokens.map((token, idx) => {
          if (token.type === 'variable') {
            return (
              <span
                key={idx}
                className="inline-flex items-center px-1 py-0.5 mx-0.5 rounded font-mono text-[11px] font-bold bg-purple-500/25 text-purple-300 border border-purple-500/40 select-text"
                title={`动态入参变量: {{${token.payload}}}`}
              >
                {`{{${token.payload}}}`}
              </span>
            );
          }
          if (token.type === 'xmlTag') {
            return (
              <span key={idx} className="text-emerald-400 font-bold">
                {token.payload}
              </span>
            );
          }
          return <span key={idx}>{token.raw}</span>;
        })}
      </div>
    </div>
  );
};

export const PromptSyntaxHighlighter: React.FC<PromptSyntaxHighlighterProps> = ({
  content,
  onDoubleClick,
  className = '',
}) => {
  const { prompts, setActivePromptId, showToast } = useAppStore();
  const blocks = useMemo(() => splitPromptBlocks(content), [content]);

  return (
    <div
      onDoubleClick={onDoubleClick}
      className={`whitespace-pre-wrap leading-relaxed select-text font-mono ${className}`}
    >
      {blocks.map((block, bIdx) => {
        if (block.type === 'codeBlock') {
          return (
            <CodeBlockCard
              key={bIdx}
              code={block.code || ''}
              lang={block.lang || 'text'}
            />
          );
        }

        // 普通文本段落
        const tokens = tokenizePromptSyntax(block.raw);
        return (
          <span key={bIdx}>
            {tokens.map((token, idx) => {
              if (token.type === 'variable') {
                return (
                  <span
                    key={idx}
                    className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded-md font-mono text-[11px] font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30 select-text align-baseline shadow-2xs"
                    title={`动态入参变量: {{${token.payload}}}`}
                  >
                    {`{{${token.payload}}}`}
                  </span>
                );
              }

              if (token.type === 'reference') {
                const targetPrompt = prompts.find(
                  (p) => p.title === token.payload || p.id === token.payload
                );

                if (targetPrompt) {
                  return (
                    <span
                      key={idx}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActivePromptId(targetPrompt.id);
                        showToast(`已跳转至模块: ${targetPrompt.title}`, 'info');
                      }}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md font-mono text-[11px] font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/40 hover:bg-blue-500/25 hover:border-blue-500/60 transition-all cursor-pointer select-none align-baseline shadow-2xs group"
                      title={`🔗 点击直接跳转至该提示词模块: ${targetPrompt.title}`}
                    >
                      <Link size={10} className="text-mac-accentBlue group-hover:scale-110 transition-transform" />
                      <span>{`{{@${token.payload}}}`}</span>
                    </span>
                  );
                }

                return (
                  <span
                    key={idx}
                    className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded-md font-mono text-[11px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 select-text align-baseline shadow-2xs"
                    title={`⚠️ 未在当前工程库中找到此引用模块: {{@${token.payload}}}`}
                  >
                    {`{{@${token.payload}}}`}
                  </span>
                );
              }

              if (token.type === 'xmlTag') {
                return (
                  <span
                    key={idx}
                    className="font-mono text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/25 select-text mx-0.5"
                  >
                    {token.payload}
                  </span>
                );
              }

              return <span key={idx}>{token.raw}</span>;
            })}
          </span>
        );
      })}
    </div>
  );
};

