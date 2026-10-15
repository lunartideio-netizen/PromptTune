import React from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

export const TrafficLights: React.FC = () => {
  const isDesktop = isTauri();
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent);

  const handleMouseDown = async (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (isDesktop) {
      try {
        await getCurrentWindow().startDragging();
      } catch {}
    }
  };

  return (
    <div 
      className="flex items-center h-10 px-4 select-none cursor-default"
      data-tauri-drag-region="true"
      style={{ WebkitAppRegion: 'drag' } as any}
      onMouseDown={handleMouseDown}
    >
      {/* 
        当运行在 Tauri 桌面端且为 macOS 时：
        系统已在左上角由 AppKit 原生绘制了真正的红黄绿三色控制按钮。
        此处仅需保留约 70px 呼吸间距，严禁再渲染 HTML 仿制按钮，避免重叠冲突和遮挡点击。
      */}
      {isDesktop ? (
        isMac ? (
          <div className="w-[68px] h-full flex-shrink-0 pointer-events-none" />
        ) : null
      ) : (
        /* 仅在纯 Web 浏览器中预览时显示纯视觉仿制的 macOS 红绿灯 */
        <div className="flex items-center gap-2 group mr-2">
          <div 
            aria-hidden="true"
            className="w-3 h-3 rounded-full bg-[#FF5F56] border border-[#E0443E] opacity-90"
          />
          <div 
            aria-hidden="true"
            className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#DEA123] opacity-90"
          />
          <div 
            aria-hidden="true"
            className="w-3 h-3 rounded-full bg-[#27C93F] border border-[#1AAB29] opacity-90"
          />
        </div>
      )}
      
      <span className="text-xs font-semibold text-mac-textSecondary tracking-tight pointer-events-none">
        PromptTune
      </span>
    </div>
  );
};
