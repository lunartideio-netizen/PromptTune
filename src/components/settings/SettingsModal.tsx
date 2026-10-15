import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { APIConfig, ProviderType } from '../../types';
import { pingEndpoint, fetchAvailableModels } from '../../services/llmService';
import { 
  X, 
  Key, 
  Globe, 
  Cpu, 
  Eye, 
  EyeOff, 
  Check, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Database, 
  Download, 
  Upload, 
  ShieldCheck, 
  Mic, 
  ChevronDown, 
  ChevronRight, 
  RotateCw, 
  Server, 
  Sparkles 
} from 'lucide-react';

interface ProviderPresetConfig {
  id: ProviderType;
  name: string;
  badge: string;
  baseUrl: string;
  defaultModel: string;
  recommendedModels: string[];
  keyPlaceholder: string;
  isLocal?: boolean;
  desc: string;
}

const PROVIDER_PRESETS: ProviderPresetConfig[] = [
  {
    id: 'openai',
    name: 'OpenAI 官方',
    badge: '标准',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    recommendedModels: ['gpt-4o', 'gpt-4o-mini', 'o1-mini', 'o3-mini'],
    keyPlaceholder: 'sk-proj-...',
    desc: '全球通用主流大模型服务',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    badge: '高性价比',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    recommendedModels: ['deepseek-chat', 'deepseek-reasoner'],
    keyPlaceholder: 'sk-...',
    desc: '深度求索 V3 与 R1 思维链模型',
  },
  {
    id: 'ollama',
    name: 'Ollama 本地',
    badge: '免密离线',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2',
    recommendedModels: ['llama3.2', 'deepseek-r1:8b', 'qwen2.5'],
    keyPlaceholder: '本地免密（留空即可）',
    isLocal: true,
    desc: '纯本地运行，免 Key 零数据泄露',
  },
  {
    id: 'siliconflow',
    name: '硅基流动',
    badge: '国内高速',
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    recommendedModels: ['deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-R1', 'Qwen/Qwen2.5-72B-Instruct'],
    keyPlaceholder: 'sk-...',
    desc: '国内高并发大模型推理加速平台',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    badge: '全网聚合',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o',
    recommendedModels: ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet', 'deepseek/deepseek-r1'],
    keyPlaceholder: 'sk-or-...',
    desc: '一站式全球主流商业模型聚合网关',
  },
  {
    id: 'custom',
    name: '自定义 / 代理',
    badge: '自由定制',
    baseUrl: 'http://localhost:10100/v1',
    defaultModel: 'google-antigravity/gemini-3.8-flash',
    recommendedModels: ['google-antigravity/gemini-3.8-flash', 'gpt-5.6-terra', 'gpt-6-astra'],
    keyPlaceholder: '自定义密钥或本地代理 token',
    isLocal: true,
    desc: '支持任何第三方中转或本地代理',
  },
];

export const SettingsModal: React.FC = () => {
  const { 
    isSettingsOpen, 
    setIsSettingsOpen, 
    apiConfig, 
    updateAPIConfig,
    exportFullDatabaseBackup,
    importFullDatabaseBackup,
    showToast,
  } = useAppStore();

  const [form, setForm] = useState<APIConfig>(apiConfig);
  const [showKey, setShowKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isPinging, setIsPinging] = useState(false);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [fetchModelMsg, setFetchModelMsg] = useState<string | null>(null);
  const [pingResult, setPingResult] = useState<{
    success: boolean;
    latencyMs: number;
    message: string;
  } | null>(null);

  // 点击模型药丸即时持久化，杜绝选完未手动点保存直接丢失
  const handleSelectModel = async (selectedModel: string) => {
    const nextForm = { ...form, model: selectedModel };
    setForm(nextForm);
    setPingResult(null);
    try {
      await updateAPIConfig(nextForm);
      showToast(`已选择并持久化模型: ${selectedModel}`, 'success');
    } catch (e: any) {
      console.error('[SettingsModal] 即时持久化模型失败:', e);
    }
  };

  React.useEffect(() => {
    if (isSettingsOpen) {
      setForm(apiConfig);
      setSaved(false);
      setPingResult(null);
      setFetchedModels([]);
      setFetchModelMsg(null);
      // 打开弹窗时自动拉取端点可用模型
      handleFetchModels(apiConfig);
    }
  }, [isSettingsOpen]);

  const currentPreset = useMemo(() => {
    return PROVIDER_PRESETS.find((p) => p.id === form.provider) ||
      PROVIDER_PRESETS.find((p) => p.baseUrl === form.baseUrl) ||
      PROVIDER_PRESETS[PROVIDER_PRESETS.length - 1];
  }, [form.provider, form.baseUrl]);

  const handleSelectPreset = (preset: ProviderPresetConfig) => {
    const nextForm = {
      ...form,
      provider: preset.id,
      baseUrl: preset.baseUrl,
      model: preset.defaultModel,
    };
    setForm(nextForm);
    setPingResult(null);
    setFetchedModels([]);
    setFetchModelMsg(null);
    // 切换预设时立即自动拉取对应服务商模型
    handleFetchModels(nextForm);
  };

  const handleFetchModels = async (targetConfig?: APIConfig) => {
    const configToFetch = targetConfig || form;
    if (!configToFetch.baseUrl?.trim()) return;
    const isLocal = configToFetch.provider === 'ollama' || 
      configToFetch.baseUrl.includes('localhost') || 
      configToFetch.baseUrl.includes('127.0.0.1');
    if (!isLocal && !configToFetch.apiKey?.trim()) return;

    setIsFetchingModels(true);
    setFetchModelMsg(null);
    try {
      const res = await fetchAvailableModels(configToFetch);
      if (res.success && res.models.length > 0) {
        setFetchedModels(res.models);
        setFetchModelMsg(`已自动同步 ${res.models.length} 个端点模型，点击标签或在输入框自动补全`);
      } else {
        setFetchModelMsg(res.error || null);
      }
    } catch (err: any) {
      setFetchModelMsg(err.message || null);
    } finally {
      setIsFetchingModels(false);
    }
  };

  // 当用户自主修改 Base URL 或 API Key 时防抖 600ms 自动静默拉取
  React.useEffect(() => {
    if (!isSettingsOpen) return;
    const isLocal = form.provider === 'ollama' || 
      form.baseUrl.includes('localhost') || 
      form.baseUrl.includes('127.0.0.1');
    if (!form.baseUrl.trim()) return;
    if (!isLocal && !form.apiKey.trim()) return;

    const timer = setTimeout(() => {
      handleFetchModels(form);
    }, 600);
    return () => clearTimeout(timer);
  }, [form.baseUrl, form.apiKey, form.provider, isSettingsOpen]);

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
    e.target.value = '';
  };

  if (!isSettingsOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-fade-in p-4">
      <div className="bg-white dark:bg-[#1c1c21] border border-mac-border dark:border-white/10 rounded-2xl shadow-macModal w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-mac-border/70 dark:border-white/10 flex items-center justify-between bg-mac-canvasAlt/40 dark:bg-white/[0.03] shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-mac-accentBlue/10 flex items-center justify-center text-mac-accentBlue">
              <Key size={15} strokeWidth={1.75} />
            </div>
            <h2 className="text-xs font-bold text-mac-textPrimary">
              API 模型与服务商配置
            </h2>
          </div>
          <button
            onClick={() => setIsSettingsOpen(false)}
            className="p-1 rounded-lg text-mac-textSecondary hover:text-mac-textPrimary hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X size={15} strokeWidth={1.75} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* 1. 服务商快捷预设面板 */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-mac-textPrimary mb-2">
              <Server size={14} strokeWidth={1.75} className="text-mac-accentBlue" />
              <span>预设服务商 (Provider Presets)</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {PROVIDER_PRESETS.map((preset) => {
                const isSelected = form.provider === preset.id || 
                  (preset.id !== 'custom' && form.baseUrl === preset.baseUrl);
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1 ${
                      isSelected
                        ? 'bg-mac-accentBlue/10 border-mac-accentBlue text-mac-textPrimary ring-1 ring-mac-accentBlue/30 shadow-xs'
                        : 'bg-mac-canvasAlt/50 dark:bg-white/[0.03] border-mac-border/70 dark:border-white/10 hover:bg-white dark:hover:bg-white/10 text-mac-textSecondary hover:text-mac-textPrimary'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full gap-1 min-w-0">
                      <span className="text-xs font-semibold truncate" title={preset.name}>{preset.name}</span>
                      <span className={`text-[9px] px-1 py-0.5 rounded font-mono shrink-0 whitespace-nowrap leading-none ${
                        isSelected ? 'bg-mac-accentBlue text-white' : 'bg-black/5 dark:bg-white/10 text-mac-textMuted'
                      }`}>
                        {preset.badge}
                      </span>
                    </div>
                    <span className="text-[10px] text-mac-textMuted truncate leading-tight">{preset.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Base URL */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-mac-textPrimary mb-1.5">
              <Globe size={14} strokeWidth={1.75} className="text-mac-accentBlue" />
              <span>API 接口地址 (Base URL)</span>
            </label>
            <input
              type="text"
              value={form.baseUrl}
              onChange={(e) => {
                setForm({ ...form, baseUrl: e.target.value });
                setPingResult(null);
              }}
              placeholder="https://api.openai.com/v1"
              className="w-full text-xs px-3 py-2 bg-mac-canvas dark:bg-black/30 rounded-xl border border-mac-border dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-mac-accentBlue/30 focus:border-mac-accentBlue font-mono text-mac-textPrimary"
            />
          </div>

          {/* 3. API Key with Eye toggle */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-mac-textPrimary">
                <Key size={14} strokeWidth={1.75} className="text-mac-accentCoral" />
                <span>API 密钥 (API Key)</span>
              </label>
            </div>
            <div className="relative flex items-center">
              <input
                type={showKey ? 'text' : 'password'}
                value={form.apiKey}
                onChange={(e) => {
                  setForm({ ...form, apiKey: e.target.value });
                  setPingResult(null);
                }}
                placeholder={currentPreset?.keyPlaceholder || 'sk-...'}
                className="w-full text-xs pl-3 pr-9 py-2 bg-mac-canvas dark:bg-black/30 rounded-xl border border-mac-border dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-mac-accentBlue/30 focus:border-mac-accentBlue font-mono text-mac-textPrimary"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 p-1 rounded text-mac-textSecondary hover:text-mac-textPrimary cursor-pointer"
                title={showKey ? '隐藏密钥' : '显示密钥'}
              >
                {showKey ? <EyeOff size={14} strokeWidth={1.75} /> : <Eye size={14} strokeWidth={1.75} />}
              </button>
            </div>
          </div>

          {/* 4. Model Identifier with Fetch Models */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-mac-textPrimary">
                <Cpu size={14} strokeWidth={1.75} className="text-mac-accentPurple" />
                <span>模型标识 (Model Identifier)</span>
              </label>

              {isFetchingModels ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-mac-accentBlue font-medium">
                  <Loader2 size={12} className="animate-spin" />
                  <span>自动拉取模型中...</span>
                </span>
              ) : fetchedModels.length > 0 ? (
                <button
                  type="button"
                  onClick={() => handleFetchModels(form)}
                  className="inline-flex items-center gap-1 text-[11px] text-emerald-600 hover:text-emerald-700 font-medium transition-colors cursor-pointer"
                  title="点击可重新拉取模型列表"
                >
                  <CheckCircle2 size={12} className="text-emerald-500" />
                  <span>已自动同步 ({fetchedModels.length} 个可用)</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleFetchModels(form)}
                  disabled={!form.baseUrl.trim()}
                  className="inline-flex items-center gap-1 text-[11px] text-mac-accentBlue hover:text-mac-accentBlueHover font-medium disabled:opacity-40 transition-colors cursor-pointer"
                  title="动态请求 /v1/models 接口获取该端点全部可用模型"
                >
                  <RotateCw size={12} strokeWidth={2} />
                  <span>获取可用模型</span>
                </button>
              )}
            </div>

            <input
              type="text"
              list="settings-models-datalist"
              value={form.model}
              onChange={(e) => {
                setForm({ ...form, model: e.target.value });
                setPingResult(null);
              }}
              onBlur={async () => {
                const trimmed = form.model.trim();
                if (trimmed && trimmed !== apiConfig.model) {
                  try {
                    await updateAPIConfig({ ...form, model: trimmed });
                    showToast(`已持久化保存主模型: ${trimmed}`, 'success');
                  } catch (e: any) {
                    console.error('[SettingsModal] onBlur 保存失败:', e);
                  }
                }
              }}
              placeholder="例如: gpt-4o 或 deepseek-chat"
              className="w-full text-xs px-3 py-2 bg-mac-canvas dark:bg-black/30 rounded-xl border border-mac-border dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-mac-accentBlue/30 focus:border-mac-accentBlue font-mono text-mac-textPrimary"
            />
            {fetchedModels.length > 0 && (
              <datalist id="settings-models-datalist">
                {fetchedModels.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            )}

            {fetchModelMsg && (
              <p className="text-[10px] mt-1 text-mac-textMuted font-mono leading-tight">
                {fetchModelMsg}
              </p>
            )}

            {isFetchingModels ? (
              <div className="mt-2 p-2.5 rounded-xl bg-mac-canvasAlt/50 dark:bg-white/[0.04] border border-mac-border/60 dark:border-white/10 animate-pulse space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-mac-textMuted dark:text-zinc-400 flex items-center gap-1.5">
                    <Loader2 size={11} className="animate-spin text-mac-accentPurple" />
                    <span>正在探索端点可用模型...</span>
                  </span>
                  <span className="text-[9px] text-mac-textMuted/60 dark:text-zinc-500">加载中</span>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  <div className="h-5 w-24 bg-black/[0.06] dark:bg-white/[0.08] rounded-md" />
                  <div className="h-5 w-36 bg-black/[0.06] dark:bg-white/[0.08] rounded-md" />
                  <div className="h-5 w-28 bg-black/[0.06] dark:bg-white/[0.08] rounded-md" />
                  <div className="h-5 w-32 bg-black/[0.06] dark:bg-white/[0.08] rounded-md" />
                </div>
              </div>
            ) : fetchedModels.length > 0 ? (
              <div className="mt-2 p-2.5 rounded-xl bg-mac-canvasAlt/60 dark:bg-white/[0.03] border border-mac-border/60 dark:border-white/10 animate-fade-in">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-semibold text-mac-textPrimary dark:text-zinc-200 flex items-center gap-1">
                    <Sparkles size={11} className="text-mac-accentPurple" />
                    <span>远端可用模型 ({fetchedModels.length}):</span>
                  </span>
                  <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-medium">点击即时应用并存档</span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                  {fetchedModels.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => handleSelectModel(m)}
                      className={`text-[10px] px-2 py-0.5 rounded-md font-mono transition-all cursor-pointer ${
                        form.model === m
                          ? 'bg-mac-accentBlue text-white font-semibold shadow-xs ring-2 ring-mac-accentBlue/30'
                          : 'bg-white dark:bg-zinc-800/90 hover:bg-mac-accentBlue/10 dark:hover:bg-zinc-700 text-mac-textSecondary dark:text-zinc-300 hover:text-mac-textPrimary dark:hover:text-white border border-mac-border/60 dark:border-white/10 shadow-2xs'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              currentPreset && currentPreset.recommendedModels.length > 0 && (
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <span className="text-[10px] text-mac-textMuted dark:text-zinc-400">常用模型:</span>
                  {currentPreset.recommendedModels.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => handleSelectModel(m)}
                      className={`text-[10px] px-2 py-0.5 rounded-md font-mono transition-all cursor-pointer ${
                        form.model === m
                          ? 'bg-mac-accentBlue text-white font-semibold shadow-xs'
                          : 'bg-black/5 dark:bg-zinc-800/90 hover:bg-black/10 dark:hover:bg-zinc-700 text-mac-textSecondary dark:text-zinc-300 hover:text-mac-textPrimary dark:hover:text-white border border-transparent dark:border-white/10 shadow-2xs'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )
            )}
          </div>

          {/* 独立语音转写配置 (OPT-6) */}
          <div className="pt-2 border-t border-mac-border/60 dark:border-white/10">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between text-xs font-semibold text-mac-textSecondary hover:text-mac-textPrimary dark:hover:text-zinc-200 transition-colors py-1 cursor-pointer"
            >
              <div className="flex items-center gap-1.5">
                <Mic size={14} className="text-purple-600 dark:text-purple-400" />
                <span>独立语音识别 (Whisper / STT) 设置</span>
              </div>
              {showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>

            {showAdvanced && (
              <div className="mt-2 space-y-2.5 p-3 rounded-xl bg-mac-canvasAlt/50 border border-mac-border/60 animate-fade-in text-xs">
                <p className="text-[11px] text-mac-textMuted leading-relaxed">
                  若主模型使用 DeepSeek 或本地 Ollama（无原生音频接口），可在此配置独立 OpenAI / Groq Whisper 端点。留空则自动降级使用系统原生 Web Speech API。
                </p>
                <div>
                  <label className="block text-[11px] font-medium text-mac-textPrimary dark:text-zinc-200 mb-1">
                    语音转写端点 (STT Base URL)
                  </label>
                  <input
                    type="text"
                    value={form.sttBaseUrl || ''}
                    onChange={(e) => setForm({ ...form, sttBaseUrl: e.target.value })}
                    placeholder="https://api.openai.com/v1"
                    className="w-full text-xs px-2.5 py-1.5 bg-mac-canvas dark:bg-black/30 rounded-lg border border-mac-border dark:border-white/10 font-mono text-mac-textPrimary"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-mac-textPrimary dark:text-zinc-200 mb-1">
                    语音转写 API Key
                  </label>
                  <input
                    type="password"
                    value={form.sttApiKey || ''}
                    onChange={(e) => setForm({ ...form, sttApiKey: e.target.value })}
                    placeholder="留空则自动复用主密钥"
                    className="w-full text-xs px-2.5 py-1.5 bg-mac-canvas dark:bg-black/30 rounded-lg border border-mac-border dark:border-white/10 font-mono text-mac-textPrimary"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Ping Diagnostic Feedback */}
          {pingResult && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 animate-fade-in ${
                pingResult.success
                  ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200'
                  : 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60 text-rose-900 dark:text-rose-200'
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
          {/* 本地数据持久化保障 (Dexie IndexedDB) & 一键备份/恢复 */}
          <div className="pt-3 border-t border-mac-border/60 dark:border-white/10">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-mac-textPrimary">
                <Database size={14} strokeWidth={1.75} className="text-mac-accentAmber" />
                <span>本地数据持久化保障 (Dexie IndexedDB)</span>
              </div>
              <span className="flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/60 font-medium">
                <ShieldCheck size={11} strokeWidth={2} className="text-emerald-600 dark:text-emerald-400" />
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
                className="flex-1 py-1.5 px-2.5 text-xs rounded-xl border border-mac-border dark:border-white/10 bg-mac-canvasAlt/70 dark:bg-white/[0.04] hover:bg-white dark:hover:bg-white/10 text-mac-textPrimary transition-all flex items-center justify-center gap-1.5 shadow-2xs font-medium cursor-pointer"
                title="将所有数据导出为 JSON 备份文件"
              >
                <Download size={13} strokeWidth={2} className="text-mac-accentBlue" />
                <span>导出数据备份 (JSON)</span>
              </button>

              <label className="flex-1 py-1.5 px-2.5 text-xs rounded-xl border border-mac-border dark:border-white/10 bg-mac-canvasAlt/70 dark:bg-white/[0.04] hover:bg-white dark:hover:bg-white/10 text-mac-textPrimary transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer font-medium">
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
              <div className="mt-2 text-[11px] text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800/60 animate-fade-in font-medium flex items-center gap-1.5">
                <CheckCircle2 size={13} strokeWidth={2} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>{backupMsg}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-mac-border/60 dark:border-white/10 bg-mac-canvasAlt/40 dark:bg-white/[0.03] flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={handlePing}
            disabled={isPinging || !form.baseUrl.trim()}
            className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-mac-border dark:border-white/10 bg-mac-surface dark:bg-white/[0.05] hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs text-mac-textPrimary"
          >
            {isPinging ? <Loader2 size={13} className="animate-spin text-mac-accentBlue" /> : null}
            <span>{isPinging ? '检测中...' : '测试连接 (Ping)'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsSettingsOpen(false)}
              className="px-3.5 py-1.5 text-xs text-mac-textSecondary hover:text-mac-textPrimary hover:bg-black/5 dark:hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-mac-accentBlue hover:bg-mac-accentBlueHover rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
            >
              {saved ? (
                <>
                  <Check size={13} strokeWidth={2} />
                  <span>已保存</span>
                </>
              ) : (
                <span>保存设置</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
