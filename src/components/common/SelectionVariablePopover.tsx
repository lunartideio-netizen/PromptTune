import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, X } from 'lucide-react';

interface SelectionVariablePopoverProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (newValue: string) => void;
  onAddVariable: (name: string, defaultValue: string) => void;
}

export const SelectionVariablePopover: React.FC<SelectionVariablePopoverProps> = ({
  textareaRef,
  value,
  onChange,
  onAddVariable,
}) => {
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null);
  const [selectedInfo, setSelectedInfo] = useState<{ text: string; start: number; end: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleSelectionChange = () => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      if (start === end || end - start < 1 || end - start > 50) {
        setPopoverPos(null);
        setSelectedInfo(null);
        return;
      }

      const selected = textarea.value.substring(start, end).trim();
      // 避免选中已是变量的情况
      if (!selected || selected.startsWith('{{') || selected.endsWith('}}') || selected.includes('\n')) {
        setPopoverPos(null);
        setSelectedInfo(null);
        return;
      }

      // 获取 textarea 相对视口的位置
      const rect = textarea.getBoundingClientRect();

      // 根据选区大致估算浮动位置（居中靠上）
      // 保证气泡始终在 textarea 内部可见区域
      const approxX = Math.min(Math.max(rect.left + 20, rect.left + rect.width / 2), rect.right - 140);
      const approxY = Math.max(rect.top - 36, 10);

      setPopoverPos({ x: approxX, y: approxY });
      setSelectedInfo({ text: selected, start, end });
    };

    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.addEventListener('mouseup', handleSelectionChange);
    textarea.addEventListener('keyup', handleSelectionChange);

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverPos(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      textarea.removeEventListener('mouseup', handleSelectionChange);
      textarea.removeEventListener('keyup', handleSelectionChange);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [textareaRef]);

  if (!popoverPos || !selectedInfo) return null;

  // 清洗生成合规的变量名
  const varName = selectedInfo.text
    .replace(/[{}[\]\s,，。！!？?、:：;；"'""]/g, '')
    .slice(0, 16);

  if (!varName) return null;

  const handleConvert = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const textarea = textareaRef.current;
    if (!textarea) return;

    const { start, end, text } = selectedInfo;
    const placeholder = `{{${varName}}}`;
    const nextVal = value.substring(0, start) + placeholder + value.substring(end);

    onChange(nextVal);
    onAddVariable(varName, text);

    // 重置选区
    setPopoverPos(null);
    setSelectedInfo(null);

    // 重新聚焦
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + placeholder.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 50);
  };

  return (
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        left: `${popoverPos.x}px`,
        top: `${popoverPos.y}px`,
        transform: 'translateX(-50%)',
        zIndex: 50,
      }}
      className="animate-fade-in flex items-center gap-1.5 px-2.5 py-1.5 bg-[#1D1D1F] text-white rounded-xl shadow-macModal border border-white/10 text-xs backdrop-blur-xl"
    >
      <button
        type="button"
        onClick={handleConvert}
        className="flex items-center gap-1.5 text-xs font-medium hover:text-sky-300 transition-colors cursor-pointer"
        title={`将选中文本一键设为变量 {{${varName}}}`}
      >
        <Sparkles size={12} strokeWidth={2} className="text-amber-400" />
        <span>设为变量</span>
        <code className="bg-white/15 px-1 py-0.5 rounded text-[10.5px] font-mono text-amber-200">
          {`{{${varName}}}`}
        </code>
      </button>

      <button
        type="button"
        onClick={() => setPopoverPos(null)}
        className="ml-1 text-white/50 hover:text-white transition-colors p-0.5"
      >
        <X size={11} strokeWidth={2} />
      </button>
    </div>
  );
};
