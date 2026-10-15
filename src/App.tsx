import React, { useEffect, useState, useRef, useCallback } from 'react';
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

// 动态懒加载非首屏重型弹窗组件 (OPT-2)
const FolderContextModal = React.lazy(() => 
  import('./components/sidebar/FolderContextModal').then((m) => ({ default: m.FolderContextModal }))
);
const SettingsModal = React.lazy(() => 
  import('./components/settings/SettingsModal').then((m) => ({ default: m.SettingsModal }))
);
const CommandPalette = React.lazy(() => 
  import('./components/common/CommandPalette').then((m) => ({ default: m.CommandPalette }))
);
const PromptDAGModal = React.lazy(() => 
  import('./components/workspace/PromptDAGModal').then((m) => ({ default: m.PromptDAGModal }))
);

export const App: React.FC = () => {
  const { 
    initialize, 
    activeTab, 
    activePromptId, 
    prompts, 
    isScratchpadActive,
    toast,
    sidebarWidth,
    setSidebarWidth,
    isSidebarCollapsed,
    toggleSidebarCollapsed,
    theme,
  } = useAppStore();

  const [isDragging, setIsDragging] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isDAGModalOpen, setIsDAGModalOpen] = useState(false);

  // 监听 Command Palette 等全局快捷动作
  useEffect(() => {
    const handleGlobalAction = (e: Event) => {
      const customEvent = e as CustomEvent<{ action: string }>;
      if (customEvent.detail?.action === 'open-dag') {
        setIsDAGModalOpen(true);
      }
    };
    window.addEventListener('prompttune:action', handleGlobalAction);
    return () => window.removeEventListener('prompttune:action', handleGlobalAction);
  }, []);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(sidebarWidth);

  // macOS 沉浸式深浅色自适应监听
  useEffect(() => {
    const apply = () => {
      const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };
    apply();

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => {
      if (theme === 'system') apply();
    };
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, [theme]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  // 全局快捷键：Cmd/Ctrl + K 呼出 Spotlight 全局命令面板
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const modifier = e.metaKey || e.ctrlKey;
      if (!modifier) return;

      // Cmd/Ctrl + K 呼出 Spotlight 全局命令面板
      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
        return;
      }

      // Cmd/Ctrl + Shift + C 呼出瘦身透镜
      if (e.shiftKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('prompttune:action', { detail: { action: 'open-compressor' } }));
        return;
      }

      // Cmd/Ctrl + Shift + A 呼出健康体检
      if (e.shiftKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('prompttune:action', { detail: { action: 'open-audit' } }));
        return;
      }

      // Cmd/Ctrl + Shift + E 呼出代码与 CI/CD 导出
      if (e.shiftKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('prompttune:action', { detail: { action: 'open-export-code' } }));
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 全局快捷键：Cmd/Ctrl + B 展开/折叠侧边栏
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const modifier = e.metaKey || e.ctrlKey;
      if (modifier && !e.shiftKey && (e.key === 'b' || e.key === 'B')) {
        const target = e.target as HTMLElement;
        const isEditing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
        if (!isEditing) {
          e.preventDefault();
          toggleSidebarCollapsed();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebarCollapsed]);

  // 工业级侧边栏拖拽：mousedown / mousemove / mouseup 全局接管
  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = sidebarWidth;

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  }, [sidebarWidth]);

  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - dragStartXRef.current;
      const nextWidth = Math.min(Math.max(dragStartWidthRef.current + delta, 180), 520);
      setSidebarWidth(nextWidth);
    };

    const onMouseUp = () => {
      setIsDragging(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging, setSidebarWidth]);

  const resetSidebarWidth = useCallback(() => {
    setSidebarWidth(260);
  }, [setSidebarWidth]);

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

      {/* 1. Left macOS Resizable Sidebar */}
      <aside 
        style={{ width: isSidebarCollapsed ? 0 : `${sidebarWidth}px` }}
        className={`border-r border-mac-border/80 bg-mac-canvasAlt/50 backdrop-blur-2xl flex flex-col flex-shrink-0 z-20 relative overflow-hidden ${
          isDragging ? 'transition-none select-none' : 'transition-[width] duration-200 ease-out'
        }`}
      >
        <div style={{ width: `${sidebarWidth}px` }} className="h-full flex flex-col">
          {/* macOS Native Traffic Lights */}
          <TrafficLights />

          {/* Multi-level Folder Tree & Quick Scratchpad Button & Search */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <FolderTree />
          </div>

          {/* Sidebar Footer with Active Model & Settings trigger */}
          <SidebarFooter />
        </div>

        {/* Resizer Handle Bar */}
        {!isSidebarCollapsed && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Sidebar resizer"
            onMouseDown={startResizing}
            onDoubleClick={resetSidebarWidth}
            className={`absolute top-0 right-0 w-2 h-full cursor-col-resize z-30 group select-none transition-colors ${
              isDragging ? 'bg-mac-accentBlue/30' : 'hover:bg-mac-accentBlue/20'
            }`}
            title="按住鼠标左右拖拽调整宽度，双击复位 (180px ~ 520px)"
          >
            <div className={`w-[1.5px] h-full ml-auto transition-colors ${
              isDragging ? 'bg-mac-accentBlue' : 'bg-transparent group-hover:bg-mac-accentBlue/50'
            }`} />
          </div>
        )}
      </aside>

      {/* 全局拖拽透明防穿透遮罩 */}
      {isDragging && (
        <div className="fixed inset-0 z-50 cursor-col-resize select-none" />
      )}

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

      {/* 3. Global Dialogs & Modals (Lazy Loaded) */}
      <React.Suspense fallback={null}>
        <FolderContextModal />
        <SettingsModal />
        <CommandPalette 
          isOpen={isCommandPaletteOpen} 
          onClose={() => setIsCommandPaletteOpen(false)} 
        />
        <PromptDAGModal
          isOpen={isDAGModalOpen}
          onClose={() => setIsDAGModalOpen(false)}
        />
      </React.Suspense>
    </div>
  );
};

export default App;
