import React, { useState } from 'react';
import { X, Sparkles, Plus, Check } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { CustomFramework } from '../../types';

interface CreateFrameworkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (frameworkId: string) => void;
}

export const CreateFrameworkModal: React.FC<CreateFrameworkModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const { addCustomFramework } = useAppStore();

  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [badge, setBadge] = useState('');
  const [desc, setDesc] = useState('');
  const [instruction, setInstruction] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('请输入框架名称');
      return;
    }

    const cleanId = (id.trim() || name.trim())
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '_');

    const newFw: Omit<CustomFramework, 'isCustom'> = {
      id: cleanId,
      name: name.trim(),
      badge: badge.trim() || '自定义',
      desc: desc.trim() || '用户自定义定制工程优化框架',
      instruction: instruction.trim() || undefined,
    };

    await addCustomFramework(newFw);
    onCreated?.(cleanId);
    onClose();

    // Reset
    setId('');
    setName('');
    setBadge('');
    setDesc('');
    setInstruction('');
    setError('');
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-[#1c1c21] border border-mac-border/80 dark:border-white/10 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-mac-border/60 dark:border-white/10">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-mac-accentPurple/10 text-mac-accentPurple">
              <Sparkles size={16} />
            </div>
            <h3 className="text-xs font-bold text-mac-textPrimary dark:text-zinc-100">创建自定义工程优化框架</h3>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-mac-textMuted hover:text-mac-textPrimary dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 text-xs">
          {error && (
            <div className="p-2 rounded-lg bg-red-500/10 text-red-500 text-[11px]">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-mac-textSecondary dark:text-zinc-400 mb-1">
              框架名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!id) {
                  setId(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'));
                }
              }}
              placeholder="例如: ReAct 代理思考 / BROKE 框架"
              className="w-full px-3 py-1.5 rounded-xl border border-mac-border dark:border-white/10 bg-mac-canvas focus:outline-none focus:ring-1 focus:ring-mac-accentPurple text-mac-textPrimary dark:text-zinc-100"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-mac-textSecondary dark:text-zinc-400 mb-1">
                框架标识代码 (ID)
              </label>
              <input
                type="text"
                value={id}
                onChange={(e) => setId(e.target.value.toUpperCase())}
                placeholder="REACT_AGENT"
                className="w-full px-3 py-1.5 rounded-xl border border-mac-border dark:border-white/10 bg-mac-canvas focus:outline-none focus:ring-1 focus:ring-mac-accentPurple font-mono text-mac-textPrimary dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-mac-textSecondary dark:text-zinc-400 mb-1">
                分类徽章标签
              </label>
              <input
                type="text"
                value={badge}
                onChange={(e) => setBadge(e.target.value)}
                placeholder="智能体 / 业务架构"
                className="w-full px-3 py-1.5 rounded-xl border border-mac-border dark:border-white/10 bg-mac-canvas focus:outline-none focus:ring-1 focus:ring-mac-accentPurple text-mac-textPrimary dark:text-zinc-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-mac-textSecondary dark:text-zinc-400 mb-1">
              结构构成说明 (Desc)
            </label>
            <input
              type="text"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Thought, Action, Observation, Reflection"
              className="w-full px-3 py-1.5 rounded-xl border border-mac-border dark:border-white/10 bg-mac-canvas focus:outline-none focus:ring-1 focus:ring-mac-accentPurple text-mac-textPrimary dark:text-zinc-100"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-mac-textSecondary dark:text-zinc-400 mb-1">
              AI 优化时强制注入的指导规范 (可选)
            </label>
            <textarea
              rows={3}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="例如：重构时必须严格拆解为背景说明、目标定位、正向思维链及格式化输出规范..."
              className="w-full px-3 py-2 rounded-xl border border-mac-border dark:border-white/10 bg-mac-canvas focus:outline-none focus:ring-1 focus:ring-mac-accentPurple text-mac-textPrimary dark:text-zinc-100 text-xs resize-none"
            />
          </div>

          {/* Footer actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-mac-border/60 dark:border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl border border-mac-border dark:border-white/10 text-mac-textSecondary dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/10 hover:text-mac-textPrimary dark:hover:text-zinc-200 transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-xl bg-mac-accentPurple text-white hover:brightness-105 transition-all font-medium flex items-center gap-1 shadow-sm cursor-pointer"
            >
              <Plus size={13} strokeWidth={2} />
              <span>保存框架</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
