import { describe, it, expect } from 'vitest';
import { extractSmartTitleFromDraft, calculatePromptQuality } from './promptUtils';
import { isVisionModel, resolvePromptReferences } from '../services/llmService';
import { PromptItem } from '../types';

describe('promptUtils', () => {
  describe('extractSmartTitleFromDraft', () => {
    it('should return default title for empty input', () => {
      expect(extractSmartTitleFromDraft('')).toBe('未命名提示词');
      expect(extractSmartTitleFromDraft('   ')).toBe('未命名提示词');
    });

    it('should strip common polite prefixes and punctuation', () => {
      expect(extractSmartTitleFromDraft('请帮我编写一个电商订单微服务')).toBe('电商订单微服务');
      expect(extractSmartTitleFromDraft('我需要一个高并发秒杀系统架构设计')).toBe('高并发秒杀系统架构设计');
      expect(extractSmartTitleFromDraft('# 设计一个现代简洁的暗色后台')).toBe('现代简洁的暗色后台');
    });

    it('should truncate and clean trailing punctuation', () => {
      const longTitle = '设计一套超长的高并发微服务分布式数据库架构方案，支持百亿级流水';
      const extracted = extractSmartTitleFromDraft(longTitle);
      expect(extracted.length).toBeLessThanOrEqual(16);
      expect(/[，,。！!]/.test(extracted)).toBe(false);
    });
  });

  describe('calculatePromptQuality', () => {
    it('should evaluate low quality for empty or minimal prompt', () => {
      const q = calculatePromptQuality('');
      expect(q.clarity).toBeLessThanOrEqual(60);
      expect(q.completeness).toBeLessThanOrEqual(60);
    });

    it('should reward structured prompts with guardrails and format spec', () => {
      const structuredPrompt = `
# 角色与系统人设
你是一位顶级的系统架构师。

## 目标与任务
设计一套分布式缓存系统，入参包含 {{target_qps}} 和 {{cache_tier}}。

## 负向约束与红线
严禁使用魔法数字，不得省略异常处理，禁止出现死锁风险。

## 输出格式规范
输出标准 Markdown 表格与架构时序图。
      `;

      const q = calculatePromptQuality(structuredPrompt, 'CO-STAR');
      expect(q.structure).toBeGreaterThanOrEqual(90);
      expect(q.completeness).toBeGreaterThanOrEqual(90);
      expect(q.clarity).toBeGreaterThanOrEqual(85);
    });
  });

  describe('isVisionModel capability detection', () => {
    it('should correctly identify vision capable models', () => {
      expect(isVisionModel('gpt-4o')).toBe(true);
      expect(isVisionModel('gpt-4o-mini')).toBe(true);
      expect(isVisionModel('claude-3-5-sonnet')).toBe(true);
      expect(isVisionModel('claude-3-7-sonnet')).toBe(true);
      expect(isVisionModel('gemini-2.5-pro')).toBe(true);
      expect(isVisionModel('qwen-vl-max')).toBe(true);
      expect(isVisionModel('minicpm-v')).toBe(true);
    });

    it('should identify pure text models as non-vision', () => {
      expect(isVisionModel('deepseek-chat')).toBe(false);
      expect(isVisionModel('deepseek-reasoner')).toBe(false);
      expect(isVisionModel('llama3.2')).toBe(false);
      expect(isVisionModel('moonshot-v1-8k')).toBe(false);
    });
  });

  describe('resolvePromptReferences circular protection', () => {
    it('should detect and safely break circular references', () => {
      const mockPrompts: PromptItem[] = [
        {
          id: 'prompt-a',
          folderId: null,
          title: '模块A',
          originalDraft: '这是A引用B: {{@模块B}}',
          currentOptimized: '这是A引用B: {{@模块B}}',
          framework: 'FREEFORM',
          variables: [],
          versions: [],
          turns: [],
          createdAt: 0,
          updatedAt: 0,
        },
        {
          id: 'prompt-b',
          folderId: null,
          title: '模块B',
          originalDraft: '这是B反向引用A: {{@模块A}}',
          currentOptimized: '这是B反向引用A: {{@模块A}}',
          framework: 'FREEFORM',
          variables: [],
          versions: [],
          turns: [],
          createdAt: 0,
          updatedAt: 0,
        },
      ];

      const result = resolvePromptReferences('【根起点】{{@模块A}}', mockPrompts, []);
      expect(result.resolvedText).toContain('这是A引用B');
      expect(result.resolvedText).toContain('[循环引用: @模块A]');
      const circularRef = result.references.find((r) => r.isCircular);
      expect(circularRef).toBeDefined();
      expect(circularRef?.title).toBe('模块A');
    });
  });
});
