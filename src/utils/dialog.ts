import { isTauri } from '@tauri-apps/api/core';
import { confirm as tauriConfirm, message as tauriMessage } from '@tauri-apps/plugin-dialog';

/**
 * 跨平台环境通用确认弹窗：
 * 在 Tauri 桌面端调用 macOS/Windows 系统级原生交互确认框；
 * 在纯浏览器环境下回退至 window.confirm。
 */
export async function confirmAction(promptMessage: string, title = 'PromptTune'): Promise<boolean> {
  if (isTauri()) {
    try {
      return await tauriConfirm(promptMessage, { title, kind: 'warning' });
    } catch {
      return window.confirm(promptMessage);
    }
  }
  return window.confirm(promptMessage);
}

export async function alertAction(msg: string, title = 'PromptTune'): Promise<void> {
  if (isTauri()) {
    try {
      await tauriMessage(msg, { title, kind: 'info' });
      return;
    } catch {}
  }
  window.alert(msg);
}
