import { useState, useRef, useCallback, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { universalFetch } from '../services/llmService';

export type VoiceTranscriptCallback = (finalChunk: string, isFinal?: boolean) => void;

export interface VoiceInputState {
  isListening: boolean;
  isSupported: boolean;
  volume: number; // 0 ~ 100
  interimTranscript: string;
  finalTranscript: string;
}

export const useVoiceInput = () => {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [volume, setVolume] = useState(0);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');

  // 核心意图标记：只要用户未主动点击【停止】，即使底层触发 onend 也不关闭，自动保活续接
  const isUserActiveRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const onTranscriptRef = useRef<VoiceTranscriptCallback | null>(null);

  // 定时器与循环引用
  const silenceTimerRef = useRef<any>(null);
  const restartTimerRef = useRef<any>(null);
  const rafIdRef = useRef<number | null>(null);
  const consecutiveErrorsRef = useRef(0);

  // Web Audio API 振幅分析器与硬件媒体流
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // MediaRecorder 录音切片（方案 1：用于云端 Whisper / 语音转文字 API）
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    const SpeechClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const hasMedia = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
    setIsSupported(Boolean(SpeechClass) || hasMedia);
  }, []);

  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  // 释放所有硬件媒体流与音频上下文，彻底杜绝 macOS 状态栏黄点麦克风常亮占用
  const cleanupAudio = () => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setVolume(0);
  };

  // 方案 1：Whisper 音频转写调用
  const transcribeWithWhisper = async (blob: Blob) => {
    const apiConfig = useAppStore.getState().apiConfig;
    const baseUrl = apiConfig.baseUrl?.trim() || '';
    if (!baseUrl) return;

    const endpoint = `${baseUrl.replace(/\/chat\/completions$/, '').replace(/\/+$/, '')}/audio/transcriptions`;
    const formData = new FormData();
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    formData.append('file', blob, `voice_input.${ext}`);
    formData.append('model', 'whisper-1');
    formData.append('language', 'zh');

    try {
      const headers: Record<string, string> = {};
      if (apiConfig.apiKey?.trim()) {
        headers['Authorization'] = `Bearer ${apiConfig.apiKey.trim()}`;
      }

      useAppStore.getState().showToast('🎙️ 录音结束，正在通过 Whisper 转写文本...', 'info');

      const res = await universalFetch(endpoint, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        const text = data?.text?.trim();
        if (text) {
          setFinalTranscript((prev) => (prev ? `${prev} ${text}` : text));
          if (onTranscriptRef.current) {
            onTranscriptRef.current(text, true);
          }
          useAppStore.getState().showToast('✨ 语音转写完成', 'success');
        }
      } else {
        if (res.status === 404) {
          // 当前接口无 Whisper 路由，已由 Web Speech 保底或静默跳过
          console.warn('[Whisper API] 端点未提供 /v1/audio/transcriptions 路由');
        } else {
          useAppStore.getState().showToast(`Whisper 转写服务返回 ${res.status}`, 'info');
        }
      }
    } catch (err: any) {
      console.warn('[Whisper API] 转写网络异常:', err);
    }
  };

  const stopListening = useCallback(() => {
    isUserActiveRef.current = false;
    consecutiveErrorsRef.current = 0;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    clearSilenceTimer();

    // 1. 停止 Web Speech API 识别
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }

    // 2. 停止 MediaRecorder 并发起 Whisper 转写
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.onstop = async () => {
          const chunks = [...audioChunksRef.current];
          if (chunks.length > 0) {
            const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
            if (blob.size > 1500) {
              await transcribeWithWhisper(blob);
            }
          }
        };
        recorder.stop();
      } catch (recErr) {
        console.warn('[useVoiceInput] recorder.stop 警告:', recErr);
      }
      mediaRecorderRef.current = null;
    }

    cleanupAudio();
    setIsListening(false);
    setInterimTranscript('');
  }, []);

  // 最大静音超时保护（10 秒无声波无输入才自动结束）
  const resetSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      stopListening();
    }, 10000);
  }, [stopListening]);

  // 创建并启动 WebKit 语音识别会话 (作为实时流式辅助)
  const createAndStartRecognition = useCallback(() => {
    const SpeechClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechClass || !isUserActiveRef.current) return;

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }

      const recognition = new SpeechClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'zh-CN';

      recognition.onstart = () => {
        consecutiveErrorsRef.current = 0;
        if (isUserActiveRef.current) {
          setIsListening(true);
          resetSilenceTimer();
        }
      };

      recognition.onresult = (event: any) => {
        resetSilenceTimer();
        let newFinalChunk = '';
        let currentInterim = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          const text = item[0]?.transcript || '';
          if (item.isFinal) {
            newFinalChunk += text;
          } else {
            currentInterim += text;
          }
        }

        if (newFinalChunk) {
          setFinalTranscript((prev) => prev + newFinalChunk);
          if (onTranscriptRef.current) {
            onTranscriptRef.current(newFinalChunk, true);
          }
        }

        setInterimTranscript(currentInterim);
      };

      recognition.onerror = (event: any) => {
        console.warn('SpeechRecognition error:', event.error);
        if (event.error === 'no-speech' || event.error === 'aborted') {
          return;
        }
        if (event.error === 'not-allowed') {
          useAppStore.getState().showToast('麦克风权限被拒绝，请在 macOS「系统设置 - 隐私与安全性 - 麦克风」中允许 PromptTune', 'error');
          stopListening();
          return;
        }
        if (event.error === 'network') {
          console.warn('Voice network connection jitter, keeping alive...');
        }
      };

      recognition.onend = () => {
        if (isUserActiveRef.current) {
          if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
          restartTimerRef.current = setTimeout(() => {
            if (isUserActiveRef.current) {
              createAndStartRecognition();
            }
          }, 120);
        } else {
          setIsListening(false);
          setInterimTranscript('');
          cleanupAudio();
          clearSilenceTimer();
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Failed to create/start SpeechRecognition:', err);
      consecutiveErrorsRef.current += 1;
      if (consecutiveErrorsRef.current >= 3) {
        useAppStore.getState().showToast('原生语音引擎未响应，将自动使用录音音频转写模式', 'info');
        return;
      }
      if (isUserActiveRef.current) {
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
        restartTimerRef.current = setTimeout(() => {
          if (isUserActiveRef.current) createAndStartRecognition();
        }, 500);
      }
    }
  }, [resetSilenceTimer, stopListening]);

  const startListening = useCallback(
    async (onTranscript: VoiceTranscriptCallback) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        useAppStore.getState().showToast('当前环境不支持访问麦克风（需麦克风权限）', 'error');
        return;
      }

      // 重置前序残留
      stopListening();

      try {
        isUserActiveRef.current = true;
        onTranscriptRef.current = onTranscript;
        setInterimTranscript('');
        audioChunksRef.current = [];

        // 1. 请求硬件流并初始化 Web Audio Analyser
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;

        // 启动 MediaRecorder 录音切片收集
        try {
          let mimeType = '';
          if (typeof MediaRecorder !== 'undefined') {
            if (MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm';
            else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';

            const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
            recorder.ondataavailable = (e) => {
              if (e.data && e.data.size > 0) {
                audioChunksRef.current.push(e.data);
              }
            };
            recorder.start(250);
            mediaRecorderRef.current = recorder;
          }
        } catch (mErr) {
          console.warn('[useVoiceInput] MediaRecorder 初始化警告:', mErr);
        }

        // 音量波形分析器（持续驱动 3 柱音浪条动态脉冲）
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          try {
            const ctx = new AudioCtx();
            audioContextRef.current = ctx;
            if (ctx.state === 'suspended') {
              await ctx.resume();
            }
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.4;
            source.connect(analyser);
            analyserRef.current = analyser;

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            let smoothedVolume = 0;

            const analyze = () => {
              if (!isUserActiveRef.current || !analyserRef.current) return;
              analyserRef.current.getByteFrequencyData(dataArray);
              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
              }
              const avg = sum / dataArray.length;
              const rawVol = Math.min(100, Math.round((avg / 60) * 100));
              smoothedVolume = smoothedVolume * 0.6 + rawVol * 0.4;
              setVolume(Math.round(smoothedVolume));

              if (rawVol > 6) {
                resetSilenceTimer();
              }

              rafIdRef.current = requestAnimationFrame(analyze);
            };

            rafIdRef.current = requestAnimationFrame(analyze);
          } catch (audioErr) {
            console.warn('AudioContext init warning:', audioErr);
          }
        }

        setIsListening(true);
        resetSilenceTimer();

        // 2. 尝试启动 WebKit 语音识别会话 (如果可用，提供实时流式字流)
        createAndStartRecognition();
      } catch (err: any) {
        console.error('startListening failed:', err);
        isUserActiveRef.current = false;
        cleanupAudio();
        setIsListening(false);
        if (err.name === 'NotAllowedError' || err.message?.includes('Permission denied')) {
          useAppStore.getState().showToast('麦克风权限被拒绝！请前往 macOS「系统设置 - 隐私与安全性 - 麦克风」中允许 PromptTune', 'error');
        } else {
          useAppStore.getState().showToast('无法启动麦克风: ' + (err.message || '未知错误'), 'error');
        }
      }
    },
    [stopListening, createAndStartRecognition, resetSilenceTimer]
  );

  const toggleListening = useCallback(
    (onTranscript: VoiceTranscriptCallback) => {
      if (isListening || isUserActiveRef.current) {
        stopListening();
      } else {
        startListening(onTranscript);
      }
    },
    [isListening, startListening, stopListening]
  );

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  return {
    isListening,
    isSupported,
    volume,
    interimTranscript,
    finalTranscript,
    startListening,
    stopListening,
    toggleListening,
    resetTranscripts: () => {
      setFinalTranscript('');
      setInterimTranscript('');
    },
  };
};
