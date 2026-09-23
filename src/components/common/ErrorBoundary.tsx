import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Copy, Check } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
      copied: false,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[PromptTune ErrorBoundary] Uncaught render exception:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleCopy = () => {
    const errorDetails = `Error: ${this.state.error?.message || 'Unknown'}\nStack: ${this.state.error?.stack || ''}\nComponentStack: ${this.state.errorInfo?.componentStack || ''}`;
    navigator.clipboard.writeText(errorDetails);
    this.setState({ copied: true });
    setTimeout(() => this.setState({ copied: false }), 2000);
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="h-screen w-screen flex items-center justify-center bg-mac-canvas p-6 select-none font-sans text-mac-textPrimary">
          <div className="max-w-lg w-full bg-white dark:bg-zinc-900 border border-red-200 dark:border-red-900/40 rounded-2xl p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center gap-3 text-red-500">
              <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/40 flex items-center justify-center">
                <AlertTriangle size={20} strokeWidth={2} />
              </div>
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  界面运行时异常 (Runtime Exception)
                </h2>
                <p className="text-xs text-zinc-500">
                  PromptTune 捕获到未处理的组件渲染异常，已自动保护本地数据库
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 text-[11px] font-mono text-zinc-700 dark:text-zinc-300 max-h-48 overflow-y-auto break-all">
              <div className="font-semibold text-red-600 dark:text-red-400 mb-1">
                {this.state.error?.name}: {this.state.error?.message}
              </div>
              <div className="text-zinc-400 text-[10px] leading-relaxed">
                {this.state.error?.stack?.slice(0, 300)}...
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={this.handleCopy}
                className="px-3.5 py-1.5 text-xs font-medium rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-1.5"
              >
                {this.state.copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                <span>{this.state.copied ? '已复制诊断信息' : '复制错误日志'}</span>
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-mac-accentBlue text-white hover:brightness-105 shadow-sm transition-all flex items-center gap-1.5"
              >
                <RefreshCw size={14} strokeWidth={2} />
                <span>重新加载应用</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
