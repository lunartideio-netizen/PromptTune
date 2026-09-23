import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { X, Layers, ShieldCheck, Sparkles, Check, GitBranch, AlertCircle } from 'lucide-react';

export const FolderContextModal: React.FC = () => {
  const { 
    contextModalFolderId, 
    setContextModalFolderId, 
    folders, 
    updateFolder, 
    getFolderAncestors 
  } = useAppStore();

  const currentFolder = folders.find((f) => f.id === contextModalFolderId);

  const [name, setName] = useState('');
  const [systemContext, setSystemContext] = useState('');
  const [domainRules, setDomainRules] = useState('');
  const [inheritParent, setInheritParent] = useState(true);
  const [savedToast, setSavedToast] = useState(false);

  useEffect(() => {
    if (currentFolder) {
      setName(currentFolder.name);
      setSystemContext(currentFolder.systemContext || '');
      setDomainRules(currentFolder.domainRules || '');
      setInheritParent(currentFolder.inheritParent ?? true);
      setSavedToast(false);
    }
  }, [currentFolder]);

  if (!contextModalFolderId || !currentFolder) return null;

  const ancestors = getFolderAncestors(currentFolder.parentId);

  const handleSave = async () => {
    await updateFolder(currentFolder.id, {
      name,
      systemContext,
      domainRules,
      inheritParent,
    });
    setSavedToast(true);
    setTimeout(() => {
      setSavedToast(false);
      setContextModalFolderId(null);
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-sm animate-fade-in p-4">
      <div className="bg-mac-surfaceElevated border border-mac-border rounded-2xl shadow-macModal w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-mac-border flex items-center justify-between bg-white/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-mac-accentBlue/10 flex items-center justify-center text-mac-accentBlue">
              <Layers size={16} strokeWidth={1.75} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-mac-textPrimary">
                文件夹上下文设定与继承规范
              </h2>
              <p className="text-xs text-mac-textSecondary">
                配置该目录下所有提示词自动注入的背景知识、专家人设与业务边界
              </p>
            </div>
          </div>
          <button
            onClick={() => setContextModalFolderId(null)}
            className="p-1.5 rounded-lg text-mac-textSecondary hover:text-mac-textPrimary hover:bg-black/5 transition-colors"
          >
            <X size={15} strokeWidth={1.75} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Folder Name */}
          <div>
            <label className="block text-xs font-semibold text-mac-textPrimary mb-1.5">
              文件夹名称
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-mac-canvas rounded-xl border border-mac-border focus:outline-none focus:ring-2 focus:ring-mac-accentBlue/30 focus:border-mac-accentBlue text-mac-textPrimary"
              placeholder="例如：移动端与全栈工程"
            />
          </div>

          {/* Ancestor Context Chain Preview */}
          {ancestors.length > 0 && (
            <div className="p-3.5 bg-mac-canvasAlt/70 rounded-xl border border-mac-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-medium text-mac-textPrimary">
                  <GitBranch size={14} strokeWidth={1.75} className="text-mac-accentPurple" />
                  上层继承链预览 ({ancestors.length} 个上级节点)
                </span>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-mac-textSecondary">
                  <input
                    type="checkbox"
                    checked={inheritParent}
                    onChange={(e) => setInheritParent(e.target.checked)}
                    className="rounded text-mac-accentBlue focus:ring-0"
                  />
                  <span>开启向下递归继承</span>
                </label>
              </div>

              {inheritParent ? (
                <div className="space-y-1.5 pt-1">
                  {ancestors.map((item, idx) => (
                    <div
                      key={item.folderId}
                      className="text-xs p-2 rounded-lg bg-white/90 border border-mac-border/80 flex items-start gap-2"
                    >
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-mac-accentPurple/10 text-mac-accentPurple font-semibold">
                        L{idx + 1}
                      </span>
                      <div className="flex-1 truncate">
                        <span className="font-semibold text-mac-textPrimary mr-2">
                          {item.folderName}:
                        </span>
                        <span className="text-mac-textSecondary">
                          {item.systemContext || item.domainRules || '无特定文本'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200 flex items-center gap-2">
                  <AlertCircle size={15} strokeWidth={1.75} className="text-amber-600 flex-shrink-0" />
                  <span>已关闭上级继承。该文件夹及其子项将仅应用本地设定的独立规则。</span>
                </div>
              )}
            </div>
          )}

          {/* System Prompt / Persona */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-mac-textPrimary">
                <Sparkles size={14} strokeWidth={1.75} className="text-mac-accentBlue" />
                全局系统角色设定 (System Persona & Background)
              </label>
              <span className="text-[11px] text-mac-textSecondary">
                所有子提示词执行时自动作为 System Prompt 注入
              </span>
            </div>
            <textarea
              rows={4}
              value={systemContext}
              onChange={(e) => setSystemContext(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-mac-canvas rounded-xl border border-mac-border focus:outline-none focus:ring-2 focus:ring-mac-accentBlue/30 focus:border-mac-accentBlue text-mac-textPrimary resize-none font-mono leading-relaxed"
              placeholder="例如：你是一名资深全栈架构师，精通 React 19、TypeScript 与高并发设计。回答必须严谨、附带严密类型声明与异常兜底..."
            />
          </div>

          {/* Domain Rules & Negative Constraints */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-mac-textPrimary">
                <ShieldCheck size={14} strokeWidth={1.75} className="text-mac-accentCoral" />
                业务规范与负向约束 (Domain Rules & Guardrails)
              </label>
              <span className="text-[11px] text-mac-textSecondary">
                模型生成代码或回答时必须遵守的底线
              </span>
            </div>
            <textarea
              rows={4}
              value={domainRules}
              onChange={(e) => setDomainRules(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-mac-canvas rounded-xl border border-mac-border focus:outline-none focus:ring-2 focus:ring-mac-accentBlue/30 focus:border-mac-accentBlue text-mac-textPrimary resize-none font-mono leading-relaxed"
              placeholder="例如：&#10;1. 严禁提供伪代码，所有实现必须能够无警告直接编译&#10;2. 拒绝临时补丁，必须说明设计取舍与架构理由&#10;3. 所有异步网络请求必须绑定 AbortController..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-mac-border bg-mac-canvas/60 flex items-center justify-between">
          <span className="text-xs text-mac-textSecondary">
            提示词优化与并发 A/B 测试将自动继承生效
          </span>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setContextModalFolderId(null)}
              className="px-4 py-1.5 text-xs font-medium text-mac-textSecondary hover:text-mac-textPrimary rounded-lg hover:bg-black/5 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 text-xs font-medium text-white bg-mac-accentBlue hover:bg-mac-accentBlueHover rounded-lg shadow-sm transition-all flex items-center gap-1.5"
            >
              {savedToast ? (
                <>
                  <Check size={14} strokeWidth={2} />
                  已保存
                </>
              ) : (
                '保存上下文配置'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
