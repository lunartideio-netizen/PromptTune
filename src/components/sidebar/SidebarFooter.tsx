import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Cpu, Settings } from 'lucide-react';

export const SidebarFooter: React.FC = () => {
  const { apiConfig, setIsSettingsOpen } = useAppStore();

  return (
    <div className="p-2.5 border-t border-mac-border/60 bg-white/40">
      <div 
        onClick={() => setIsSettingsOpen(true)}
        className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-black/[0.02] hover:bg-black/[0.05] transition-colors cursor-pointer border border-mac-border/50 text-mac-textSecondary hover:text-mac-textPrimary group"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Cpu size={14} strokeWidth={1.75} className="text-mac-accentBlue flex-shrink-0" />
          <span className="text-xs font-mono font-medium text-mac-textPrimary truncate">
            {apiConfig.model || 'gpt-4o'}
          </span>
        </div>

        <button 
          title="模型与 API 设置"
          className="p-1 rounded-lg text-mac-textSecondary group-hover:text-mac-textPrimary hover:bg-black/5 transition-colors"
        >
          <Settings size={15} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
};
