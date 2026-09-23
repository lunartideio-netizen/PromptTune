import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Zap, FileText, Sparkles, Folder } from 'lucide-react';
import { SkillItem, PromptItem } from '../../types';

interface MentionAutocompleteProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onSelect: (newValue: string, insertedItem: { type: 'skill' | 'prompt'; title: string }) => void;
  currentPromptId?: string | null;
}

// 纯原生精确测算光标在 textarea 内部的像素坐标
function getCaretCoordinates(element: HTMLTextAreaElement, position: number) {
  const div = document.createElement('div');
  const style = window.getComputedStyle(element);

  const properties = [
    'direction', 'boxSizing', 'width', 'overflowX', 'overflowY',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize',
    'fontSizeAdjust', 'lineHeight', 'fontFamily', 'textAlign', 'textTransform',
    'textIndent', 'textDecoration', 'letterSpacing', 'wordSpacing', 'tabSize',
    'whiteSpace', 'wordBreak', 'wordWrap'
  ];

  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.whiteSpace = 'pre-wrap';
  div.style.wordWrap = 'break-word';
  div.style.top = '0';
  div.style.left = '-9999px';
  div.style.width = `${element.clientWidth}px`;

  for (const prop of properties) {
    (div.style as any)[prop] = (style as any)[prop];
  }

  div.textContent = element.value.substring(0, position);
  const span = document.createElement('span');
  span.textContent = element.value.substring(position, position + 1) || '@';
  div.appendChild(span);

  document.body.appendChild(div);
  const coordinates = {
    top: span.offsetTop + parseInt(style.borderTopWidth || '0', 10),
    left: span.offsetLeft + parseInt(style.borderLeftWidth || '0', 10),
    lineHeight: parseInt(style.lineHeight || '18', 10),
  };
  document.body.removeChild(div);
  return coordinates;
}

export const MentionAutocomplete: React.FC<MentionAutocompleteProps> = ({
  textareaRef,
  value,
  onSelect,
  currentPromptId,
}) => {
  const { skills, prompts, folders } = useAppStore();

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [atIndex, setAtIndex] = useState(-1);
  const [cursorPos, setCursorPos] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const popoverRef = useRef<HTMLDivElement>(null);

  // 1. 过滤技能与提示词
  const filteredSkills = skills.filter((s) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      s.title.toLowerCase().includes(q) ||
      (s.dimension && s.dimension.toLowerCase().includes(q)) ||
      (s.description && s.description.toLowerCase().includes(q))
    );
  });

  const filteredPrompts = prompts.filter((p) => {
    if (currentPromptId && p.id === currentPromptId) return false;
    if (!query) return true;
    return p.title.toLowerCase().includes(query.toLowerCase());
  });

  type MenuItem = 
    | { itemType: 'skill'; data: SkillItem }
    | { itemType: 'prompt'; data: PromptItem };

  const allItems: MenuItem[] = [
    ...filteredSkills.map((s) => ({ itemType: 'skill' as const, data: s })),
    ...filteredPrompts.map((p) => ({ itemType: 'prompt' as const, data: p })),
  ];

  // 保持 selectedIndex 在合法范围
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, allItems.length]);

  // 2. 选择条目插入逻辑
  const selectItem = useCallback(
    (item: MenuItem) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const title = item.data.title;
      const text = textarea.value;
      const before = text.slice(0, atIndex);
      const after = text.slice(cursorPos);
      const insertSnippet = `{{@${title}}}`;
      const nextValue = before + insertSnippet + ' ' + after;

      onSelect(nextValue, { type: item.itemType, title });
      setIsOpen(false);

      requestAnimationFrame(() => {
        textarea.focus();
        const nextPos = before.length + insertSnippet.length + 1;
        textarea.setSelectionRange(nextPos, nextPos);
      });
    },
    [atIndex, cursorPos, onSelect, textareaRef]
  );

  // 3. 监听光标与输入，触发 @ 联想检查
  const checkMentionTrigger = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const selStart = textarea.selectionStart;
    const text = textarea.value;
    const textBefore = text.slice(0, selStart);

    // 找到当前光标之前的最后一个 @
    const lastAt = textBefore.lastIndexOf('@');

    if (lastAt === -1) {
      setIsOpen(false);
      return;
    }

    const textBetween = textBefore.slice(lastAt + 1);

    // 检查规则：
    // 1. @ 与光标之间不能包含空格或换行
    // 2. 长度不超过 25 个字符
    // 3. @ 前面必须是行首、空白或标点符号 (避免识别 email@domain 等)
    // 4. 不是已经成对闭合的 {{@...}}
    const hasSpace = /\s/.test(textBetween);
    const validPreChar = lastAt === 0 || /[\s\n\(\[\{\,\;]/.test(textBefore[lastAt - 1]);
    const insideClosedTag = textBefore.endsWith('}}');

    if (!hasSpace && textBetween.length <= 25 && validPreChar && !insideClosedTag) {
      const caret = getCaretCoordinates(textarea, lastAt);
      const containerHeight = textarea.clientHeight;
      const topOffset = caret.top - textarea.scrollTop;
      const leftOffset = Math.min(caret.left - textarea.scrollLeft, textarea.clientWidth - 280);

      // 如果靠近容器底部，自动上翻
      const popoverHeight = 260;
      const finalTop = topOffset + 24 + popoverHeight > containerHeight && topOffset > popoverHeight
        ? topOffset - popoverHeight - 6
        : topOffset + 24;

      setCoords({
        top: Math.max(10, finalTop),
        left: Math.max(10, leftOffset),
      });
      setQuery(textBetween);
      setAtIndex(lastAt);
      setCursorPos(selStart);
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  }, [textareaRef]);

  // 4. 键盘事件监听 (ArrowDown, ArrowUp, Enter, Tab, Escape)
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen || allItems.length === 0) {
        if (e.key === 'Escape' && isOpen) {
          e.preventDefault();
          setIsOpen(false);
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (prev + 1) % allItems.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (prev - 1 + allItems.length) % allItems.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        const picked = allItems[selectedIndex];
        if (picked) {
          selectItem(picked);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
      }
    };

    const handleInputOrCursor = () => {
      checkMentionTrigger();
    };

    textarea.addEventListener('keydown', handleKeyDown);
    textarea.addEventListener('keyup', handleInputOrCursor);
    textarea.addEventListener('click', handleInputOrCursor);
    textarea.addEventListener('input', handleInputOrCursor);

    return () => {
      textarea.removeEventListener('keydown', handleKeyDown);
      textarea.removeEventListener('keyup', handleInputOrCursor);
      textarea.removeEventListener('click', handleInputOrCursor);
      textarea.removeEventListener('input', handleInputOrCursor);
    };
  }, [isOpen, allItems, selectedIndex, selectItem, checkMentionTrigger, textareaRef]);

  // 点击外部关闭
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, textareaRef]);

  if (!isOpen || !coords) return null;

  let currentGlobalIdx = 0;

  return (
    <div
      ref={popoverRef}
      style={{
        top: `${coords.top}px`,
        left: `${coords.left}px`,
      }}
      className="absolute z-50 w-72 md:w-80 max-h-72 flex flex-col bg-white/95 backdrop-blur-xl border border-[#E5E2D9] rounded-2xl shadow-xl overflow-hidden font-sans select-none animate-in fade-in zoom-in-95 duration-100"
    >
      {/* 头部微提示 */}
      <div className="px-3 py-1.5 bg-[#FAF9F6] border-b border-[#E5E2D9] flex items-center justify-between text-[10px] text-[#6E6B65] shrink-0">
        <span className="font-semibold flex items-center gap-1 text-indigo-700">
          <Sparkles size={11} strokeWidth={2} />
          <span>智能装配 · 输入 @ 唤起</span>
        </span>
        <span className="text-[9px] text-[#9E9B95] font-mono">↑↓ 浏览 · ↵ 插入</span>
      </div>

      {/* 列表主体 */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-2 min-h-0">
        {allItems.length === 0 ? (
          <div className="py-6 text-center text-xs text-[#9E9B95]">
            未匹配到相关技能或提示词
          </div>
        ) : (
          <>
            {/* 分组 1：已装技能 (Installed Skills) */}
            {filteredSkills.length > 0 && (
              <div>
                <div className="px-2 py-1 text-[10px] font-bold text-[#6E6B65] uppercase tracking-wider flex items-center gap-1">
                  <Zap size={11} strokeWidth={2} className="text-purple-600" />
                  <span>已装技能 ({filteredSkills.length})</span>
                </div>
                <div className="space-y-0.5">
                  {filteredSkills.map((skill) => {
                    const itemIndex = currentGlobalIdx++;
                    const isSelected = selectedIndex === itemIndex;
                    return (
                      <div
                        key={skill.id}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectItem({ itemType: 'skill', data: skill });
                        }}
                        onMouseEnter={() => setSelectedIndex(itemIndex)}
                        className={`px-2.5 py-1.5 rounded-xl cursor-pointer transition-all flex items-center justify-between text-xs ${
                          isSelected
                            ? 'bg-purple-50 border border-purple-200/80 text-purple-950 font-semibold'
                            : 'hover:bg-black/5 text-[#2C2A29]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 ${
                            isSelected ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-700'
                          }`}>
                            <Zap size={11} strokeWidth={2} />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="truncate leading-tight">{skill.title}</span>
                            {skill.dimension && (
                              <span className="text-[10px] text-[#9E9B95] truncate leading-tight">
                                {skill.dimension}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-purple-100/80 text-purple-700 font-mono">
                            {skill.framework}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 分组 2：项目提示词 (Project Prompts) */}
            {filteredPrompts.length > 0 && (
              <div>
                <div className="px-2 py-1 text-[10px] font-bold text-[#6E6B65] uppercase tracking-wider flex items-center gap-1">
                  <FileText size={11} strokeWidth={2} className="text-indigo-600" />
                  <span>项目提示词 ({filteredPrompts.length})</span>
                </div>
                <div className="space-y-0.5">
                  {filteredPrompts.map((prompt) => {
                    const itemIndex = currentGlobalIdx++;
                    const isSelected = selectedIndex === itemIndex;
                    const folder = folders.find((f) => f.id === prompt.folderId);
                    return (
                      <div
                        key={prompt.id}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectItem({ itemType: 'prompt', data: prompt });
                        }}
                        onMouseEnter={() => setSelectedIndex(itemIndex)}
                        className={`px-2.5 py-1.5 rounded-xl cursor-pointer transition-all flex items-center justify-between text-xs ${
                          isSelected
                            ? 'bg-indigo-50 border border-indigo-200/80 text-indigo-950 font-semibold'
                            : 'hover:bg-black/5 text-[#2C2A29]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 ${
                            isSelected ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700'
                          }`}>
                            <FileText size={11} strokeWidth={2} />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="truncate leading-tight">{prompt.title}</span>
                            {folder && (
                              <span className="text-[10px] text-[#9E9B95] truncate leading-tight flex items-center gap-0.5">
                                <Folder size={9} />
                                {folder.name}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-indigo-100/80 text-indigo-700 font-mono">
                            {prompt.framework || 'PROMPT'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
