import React, { useEffect } from 'react';
import { useAppStore } from './store/useAppStore';
import { TrafficLights } from './components/sidebar/TrafficLights';
import { FolderTree } from './components/sidebar/FolderTree';
import { SidebarFooter } from './components/sidebar/SidebarFooter';
import { WorkspaceHeader } from './components/workspace/WorkspaceHeader';
import { PromptOptimizer } from './components/workspace/PromptOptimizer';
import { ABPlayground } from './components/workspace/ABPlayground';
import { VariableExtractor } from './components/workspace/VariableExtractor';
import { VersionHistory } from './components/workspace/VersionHistory';
import { QuickScratchpad } from './components/workspace/QuickScratchpad';
import { FolderContextModal } from './components/sidebar/FolderContextModal';
import { SettingsModal } from './components/settings/SettingsModal';
import { SkillHunterModal } from './components/skillhunter/SkillHunterModal';

export const App: React.FC = () => {
  const { 
    initialize, 
    activeTab, 
    activePromptId, 
    prompts, 
    isScratchpadActive,
    toast,
  } = useAppStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  const hasPrompts = prompts.length > 0;
  const isScratchpadMode = isScratchpadActive || !hasPrompts || !activePromptId;

  return (
    <div className="h-screen w-screen flex bg-mac-canvas text-mac-textPrimary overflow-hidden font-sans select-none antialiased relative">
      {/* Global macOS-style Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all duration-300">
          <div className={`px-4 py-2 rounded-xl shadow-lg border flex items-center gap-2 text-xs font-medium backdrop-blur-xl pointer-events-auto ${
            toast.type === 'error'
              ? 'bg-[#FF453A]/90 text-white border-red-400/30 shadow-red-500/10'
              : toast.type === 'success'
              ? 'bg-[#30D158]/90 text-white border-emerald-400/30 shadow-emerald-500/10'
              : 'bg-[#1C1C1E]/90 text-zinc-100 border-zinc-700/50 shadow-black/20'
          }`}>
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* 1. Left macOS Sidebar */}
      <aside className="w-64 md:w-72 border-r border-mac-border/80 bg-mac-canvasAlt/50 backdrop-blur-2xl flex flex-col flex-shrink-0 z-10">
        {/* macOS Native Traffic Lights */}
        <TrafficLights />

        {/* Multi-level Folder Tree & Quick Scratchpad Button & Search */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <FolderTree />
        </div>

        {/* Sidebar Footer with Active Model & Settings trigger */}
        <SidebarFooter />
      </aside>

      {/* 2. Main Full-Width Workspace (Unified across Scratchpad & Prompts) */}
      <main className="flex-1 flex flex-col bg-mac-canvas overflow-hidden relative">
        <WorkspaceHeader />
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeTab === 'optimize' && (isScratchpadMode ? <QuickScratchpad /> : <PromptOptimizer />)}
          {activeTab === 'ab_test' && <ABPlayground />}
          {activeTab === 'variables' && <VariableExtractor />}
          {activeTab === 'versions' && <VersionHistory />}
        </div>
      </main>

      {/* 3. Global Dialogs & Modals */}
      <FolderContextModal />
      <SettingsModal />
      <SkillHunterModal />
    </div>
  );
};

export default App;
