import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { APIConfig } from '../../types';
import { pingEndpoint } from '../../services/llmService';
import { 
  X, 
  Key, 
  Globe, 
  Cpu, 
  Eye, 
  EyeOff, 
  Check, 
  Radio, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Zap,
  Database,
  Download,
  Upload,
  ShieldCheck
} from 'lucide-react';

export const SettingsModal: React.FC = () => {
  const { 
    isSettingsOpen, 
    setIsSettingsOpen, 
    apiConfig, 
    updateAPIConfig,
    exportFullDatabaseBackup,
    importFullDatabaseBackup 
  } = useAppStore();

  const [form, setForm] = useState<APIConfig>(apiConfig);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isPinging, setIsPinging] = useState(false);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [pingResult, setPingResult] = useState<{
    success: boolean;
    latencyMs: number;
    message: string;
  } | null>(null);

  // Sync form when modal opens
  React.useEffect(() => {
    if (isSettingsOpen) {
      setForm(apiConfig);
      setSaved(false);
      setPingResult(null);
    }
  }, [isSettingsOpen, apiConfig]);

  if (!isSettingsOpen) return null;

  const handlePing = async () => {
    setIsPinging(true);
    setPingResult(null);
    try {
      const res = await pingEndpoint(form);
      setPingResult(res);
    } catch (err: any) {
      setPingResult({
        success: false,
        latencyMs: 0,
        message: err.message || '网络连接失败',
      });
    } finally {
      setIsPinging(false);
    }
  };

  const handleSave = async () => {
    await updateAPIConfig(form);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      setIsSettingsOpen(false);
    }, 400);
  };

  const handleExportBackup = async () => {
    try {
      const jsonStr = await exportFullDatabaseBackup();
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(jsonStr);
      const dlAnchor = document.createElement('a');
      dlAnchor.setAttribute('href', dataStr);
      dlAnchor.setAttribute('download', `PromptTune-Backup-${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(dlAnchor);
      dlAnchor.click();
      dlAnchor.remove();
      setBackupMsg('数据全量备份已成功导出为 JSON 文件！');
      setTimeout(() => setBackupMsg(null), 3000);
    } catch (err: any) {
      alert('导出备份失败: ' + err.message);
    }
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      const res = await importFullDatabaseBackup(text);
      if (res.success) {
        setBackupMsg(`成功恢复 ${res.count.folders} 个文件夹与 ${res.count.prompts} 个提示词！`);
        setTimeout(() => setBackupMsg(null), 4000);
      } else {
        alert('导入失败: ' + (res.error || '未知错误'));
      }
    };
    reader.readAsText(file);
    // Clear input
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-fade-in p-4">
      <div className="bg-white border border-mac-border rounded-2xl shadow-macModal w-full max-w-md overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-mac-border/70 flex items-center justify-between bg-mac-canvasAlt/40">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-mac-accentBlue/10 flex items-center justify-center text-mac-accentBlue">
              <Key size={15} strokeWidth={1.75} />
            </div>
            <h2 className="text-xs font-bold text-mac-textPrimary">
              API 模型与密钥设置
            </h2>
          </div>
          <button
            onClick={() => setIsSettingsOpen(false)}
            className="p-1 rounded-lg text-mac-textSecondary hover:text-mac-textPrimary hover:bg-black/5 transition-colors"
          >
            <X size={15} strokeWidth={1.75} />
          </button>
        </div>

        {/* Content: Clean, Vertical, 3 Core Fields */}
        <div className="p-5 space-y-4">
          {/* Quick Preset Selector for OpenCodeX */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-mac-canvasAlt/70 border border-mac-border/70">
            <div className="flex items-center gap-1.5 text-xs text-mac-textSecondary">
              <Zap size={14} strokeWidth={2} className="text-amber-500" />
              <span className="font-semibold text-mac-textPrimary">本地代理:</span>
              <span className="font-mono text-[11px]">localhost:10100</span>
            </div>
            <button
              type="button"
              onClick={() => {
                const newForm: APIConfig = {
                  ...form,
                  provider: 'custom',
                  baseUrl: 'http://localhost:10100/v1',
                  apiKey: form.apiKey || 'sk-opencodex',
                  model: 'gemini-3.8',
                };
                setForm(newForm);
                setIsPinging(true);
                setPingResult(null);
                pingEndpoint(newForm).then((res) => {
                  setPingResult(res);
                  setIsPinging(false);
                });
              }}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-mac-accentBlue/10 hover:bg-mac-accentBlue/20 text-mac-accentBlue transition-colors flex items-center gap-1 shadow-sm"
              title="一键导入 OpenCodeX (Gemini 3.8) 并自动测速"
            >
              <span>导入 Gemini 3.8</span>
            </button>
          </div>

          {/* 1. Base URL */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-mac-textPrimary mb-1.5">
              <Globe size={14} strokeWidth={1.75} className="text-mac-accentBlue" />
              API 接口地址 (Base URL)
            </label>
            <input
              type="text"
              value={form.baseUrl}
              onChange={(e) => {
                setForm({ ...form, baseUrl: e.target.value });
                setPingResult(null);
              }}
              placeholder="https://api.openai.com/v1"
              className="w-full text-xs px-3 py-2 bg-mac-canvas rounded-xl border border-mac-border focus:outline-none focus:ring-2 focus:ring-mac-accentBlue/30 focus:border-mac-accentBlue font-mono text-mac-textPrimary"
            />
          </div>

          {/* 2. API Key with Eye toggle */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-mac-textPrimary mb-1.5">
              <Key size={14} strokeWidth={1.75} className="text-mac-accentCoral" />
              API 密钥 (API Key)
            </label>
            <div className="relative flex items-center">
              <input
                type={showKey ? 'text' : 'password'}
                value={form.apiKey}
                onChange={(e) => {
                  setForm({ ...form, apiKey: e.target.value });
                  setPingResult(null);
                }}
                placeholder="sk-..."
                className="w-full text-xs pl-3 pr-9 py-2 bg-mac-canvas rounded-xl border border-mac-border focus:outline-none focus:ring-2 focus:ring-mac-accentBlue/30 focus:border-mac-accentBlue font-mono text-mac-textPrimary"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 p-1 rounded text-mac-textSecondary hover:text-mac-textPrimary"
                title={showKey ? '隐藏密钥' : '显示密钥'}
              >
                {showKey ? <EyeOff size={14} strokeWidth={1.75} /> : <Eye size={14} strokeWidth={1.75} />}
              </button>
            </div>
          </div>

          {/* 3. Model Identifier */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-mac-textPrimary mb-1.5">
              <Cpu size={14} strokeWidth={1.75} className="text-mac-accentPurple" />
              模型标识 (Model Identifier)
            </label>
            <input
              type="text"
              value={form.model}
              onChange={(e) => {
                setForm({ ...form, model: e.target.value });
                setPingResult(null);
              }}
              placeholder="例如: gpt-4o 或 deepseek-chat"
              className="w-full text-xs px-3 py-2 bg-mac-canvas rounded-xl border border-mac-border focus:outline-none focus:ring-2 focus:ring-mac-accentBlue/30 focus:border-mac-accentBlue font-mono text-mac-textPrimary"
            />
          </div>

          {/* Ping Diagnostic Feedback */}
          {pingResult && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 animate-fade-in ${
                pingResult.success
                  ? 'bg-emerald-50/90 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50/90 border-rose-200 text-rose-900'
              }`}
            >
              {pingResult.success ? (
                <CheckCircle2 size={16} strokeWidth={2} className="text-emerald-600 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle size={16} strokeWidth={2} className="text-rose-600 mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1 font-mono text-[11px] leading-relaxed">
                <div className="font-semibold mb-0.5 flex items-center justify-between">
                  <span>{pingResult.success ? '端点检测连通成功' : '端点连通异常'}</span>
                  {pingResult.latencyMs > 0 && (
                    <span className="font-normal opacity-75">{pingResult.latencyMs}ms</span>
                  )}
                </div>
                <div className="break-all">{pingResult.message}</div>
              </div>
            </div>
          )}

          {/* 本地数据持久化保障 (Dexie IndexedDB) & 一键备份/恢复 */}
          <div className="pt-3 border-t border-mac-border/60">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-mac-textPrimary">
                <Database size={14} strokeWidth={1.75} className="text-mac-accentAmber" />
                <span>本地数据持久化保障 (Dexie IndexedDB)</span>
              </div>
              <span className="flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 font-medium">
                <ShieldCheck size={11} strokeWidth={2} className="text-emerald-600" />
                100% 留存在本地
              </span>
            </div>
            <p className="text-[11px] text-mac-textSecondary leading-relaxed mb-2.5">
              所有文件夹、提示词、版本快照与 API 密钥严格保存在本地存储，无任何云端遥测上报，刷新或关机绝不丢失。
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportBackup}
                className="flex-1 py-1.5 px-2.5 text-xs rounded-xl border border-mac-border bg-mac-canvasAlt/70 hover:bg-white text-mac-textPrimary transition-all flex items-center justify-center gap-1.5 shadow-2xs font-medium"
                title="将所有数据导出为 JSON 备份文件"
              >
                <Download size={13} strokeWidth={2} className="text-mac-accentBlue" />
                <span>导出数据备份 (JSON)</span>
              </button>

              <label className="flex-1 py-1.5 px-2.5 text-xs rounded-xl border border-mac-border bg-mac-canvasAlt/70 hover:bg-white text-mac-textPrimary transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer font-medium">
                <Upload size={13} strokeWidth={2} className="text-mac-accentGreen" />
                <span>恢复数据包 (导入)</span>
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleImportBackup}
                />
              </label>
            </div>
            {backupMsg && (
              <div className="mt-2 text-[11px] text-emerald-800 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200 animate-fade-in font-medium flex items-center gap-1.5">
                <CheckCircle2 size={13} strokeWidth={2} className="text-emerald-600 shrink-0" />
                <span>{backupMsg}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-mac-border/70 bg-mac-canvasAlt/30 flex items-center justify-between">
          <button
            type="button"
            onClick={handlePing}
            disabled={isPinging}
            className="px-3 py-1.5 text-xs font-medium text-mac-textPrimary hover:bg-black/5 border border-mac-border rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            {isPinging ? (
              <>
                <Loader2 size={13} strokeWidth={2} className="animate-spin text-mac-accentBlue" />
                <span>正在测试...</span>
              </>
            ) : (
              <>
                <Radio size={13} strokeWidth={2} className="text-mac-accentBlue" />
                <span>测试连接 (Ping)</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="px-3.5 py-1.5 text-xs text-mac-textSecondary hover:text-mac-textPrimary hover:bg-black/5 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-mac-accentBlue hover:bg-mac-accentBlueHover rounded-xl shadow-sm transition-all flex items-center gap-1.5"
            >
              {saved ? (
                <>
                  <Check size={14} strokeWidth={2} />
                  已保存
                </>
              ) : (
                '保存设置'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
