import { useEffect } from 'react';

interface KeyboardShortcutOptions {
  onOptimize?: () => void;
  onCopy?: () => void;
  onToggleDiff?: () => void;
  enabled?: boolean;
}

/**
 * 全局 / 局部 macOS 风格快捷键 Hook
 * - Cmd/Ctrl + Enter: 触发优化 / 重新生成
 * - Cmd/Ctrl + Shift + C: 一键复制最新提示词
 * - Cmd/Ctrl + D: 切换变动透镜 (Diff 模式)
 */
export function useKeyboardShortcuts({
  onOptimize,
  onCopy,
  onToggleDiff,
  enabled = true,
}: KeyboardShortcutOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      // 1. Cmd/Ctrl + Enter: 触发优化
      if (modifier && e.key === 'Enter') {
        if (onOptimize) {
          e.preventDefault();
          onOptimize();
        }
        return;
      }

      // 2. Cmd/Ctrl + Shift + C: 复制当前提示词
      if (modifier && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
        if (onCopy) {
          e.preventDefault();
          onCopy();
        }
        return;
      }

      // 3. Cmd/Ctrl + D: 切换 Diff 透镜
      if (modifier && (e.key === 'd' || e.key === 'D')) {
        // 如果焦点在普通单行输入框中，不拦截默认全选等行为，除非是主动触发
        const target = e.target as HTMLElement;
        const isInput = target?.tagName === 'INPUT';
        if (!isInput && onToggleDiff) {
          e.preventDefault();
          onToggleDiff();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onOptimize, onCopy, onToggleDiff, enabled]);
}
