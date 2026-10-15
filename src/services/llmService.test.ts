import { describe, it, expect } from 'vitest';
import {
  extractPromptReferences,
  resolvePromptReferences,
  substituteVariables,
  extractVariablesFromText,
  syncVariables,
  parsePartialJsonArray,
  normalizeBaseUrl,
  isReasoningModel,
  isVisionModel,
  resolveModelAlias,
  translateAPIError,
} from './llmService';
import { PromptItem, SkillItem } from '../types';

describe('llmService Utility & Logic Suite', () => {
  describe('extractPromptReferences', () => {
    it('extracts prompt references formatted as {{@title}}', () => {
      const text = '参考 {{@前端架构规范}} 以及 {{@后端API设计}}，并结合 {{@前端架构规范}}';
      const refs = extractPromptReferences(text);
      expect(refs).toEqual(['前端架构规范', '后端API设计']);
    });

    it('returns empty array when no references exist', () => {
      expect(extractPromptReferences('普通文本没有任何引用')).toEqual([]);
      expect(extractPromptReferences('')).toEqual([]);
    });

    it('handles whitespace within braces correctly', () => {
      const text = '使用 {{@  数据管道清洗   }} 完成处理';
      expect(extractPromptReferences(text)).toEqual(['数据管道清洗']);
    });
  });

  describe('resolvePromptReferences', () => {
    const mockPrompts: PromptItem[] = [
      {
        id: 'p-1',
        folderId: null,
        title: '基础角色设定',
        currentOptimized: '你是一位资深全栈技术专家。',
        originalDraft: '',
        framework: 'CO-STAR',
        variables: [],
        versions: [],
        turns: [],
        createdAt: 0,
        updatedAt: 0,
      },
      {
        id: 'p-2',
        folderId: null,
        title: '输出格式规范',
        currentOptimized: '请以 JSON 结构输出结果。',
        originalDraft: '',
        framework: 'CO-STAR',
        variables: [],
        versions: [],
        turns: [],
        createdAt: 0,
        updatedAt: 0,
      },
    ];

    const mockSkills: SkillItem[] = [
      {
        id: 's-1',
        title: '代码重构原则',
        category: 'coding',
        description: 'Clean Code',
        framework: 'CO-STAR',
        distilledPrompt: '始终遵循单一职责与开闭原则。',
        systemPersona: '资深重构专家',
        workflow: '分析代码坏味道',
        guardrails: '禁止破坏已有测试',
        variables: [],
        createdAt: 0,
        updatedAt: 0,
      },
    ];

    it('resolves prompt references with their optimized content', () => {
      const input = '{{@基础角色设定}}\n请帮我审查代码。\n{{@输出格式规范}}';
      const result = resolvePromptReferences(input, mockPrompts, mockSkills);
      expect(result.resolvedText).toContain('你是一位资深全栈技术专家。');
      expect(result.resolvedText).toContain('请以 JSON 结构输出结果。');
      expect(result.references.length).toBe(2);
      expect(result.references[0].isResolved).toBe(true);
      expect(result.references[0].type).toBe('prompt');
    });

    it('resolves skill references when not found in prompts', () => {
      const input = '重构指导：\n{{@代码重构原则}}';
      const result = resolvePromptReferences(input, mockPrompts, mockSkills);
      expect(result.resolvedText).toContain('始终遵循单一职责与开闭原则。');
      expect(result.references[0].isResolved).toBe(true);
      expect(result.references[0].type).toBe('skill');
    });

    it('handles unresolved references gracefully without crashing', () => {
      const input = '调用不存在的模块：{{@未知组件}}';
      const result = resolvePromptReferences(input, mockPrompts, mockSkills);
      expect(result.references[0].isResolved).toBe(false);
      expect(result.resolvedText).toContain('{{@未知组件}}');
    });

    it('prevents infinite recursion on self-referencing and mutual circular prompts', () => {
      const cyclicPrompts: PromptItem[] = [
        {
          id: 'p-cycle-a',
          folderId: null,
          title: '模块A',
          currentOptimized: 'A 内部调用了 {{@模块B}}',
          originalDraft: '',
          framework: 'CO-STAR',
          variables: [],
          versions: [],
          turns: [],
          createdAt: 0,
          updatedAt: 0,
        },
        {
          id: 'p-cycle-b',
          folderId: null,
          title: '模块B',
          currentOptimized: 'B 内部调用了 {{@模块A}}',
          originalDraft: '',
          framework: 'CO-STAR',
          variables: [],
          versions: [],
          turns: [],
          createdAt: 0,
          updatedAt: 0,
        },
      ];
      const result = resolvePromptReferences('{{@模块A}}', cyclicPrompts, []);
      expect(result.resolvedText).toBeDefined();
      expect(result.resolvedText).toContain('A 内部调用了');
    });
  });

  describe('substituteVariables', () => {
    it('substitutes single and multiple variables correctly', () => {
      const template = '你好 {{userName}}，欢迎使用 {{appName}}！';
      const result = substituteVariables(template, {
        userName: 'Alice',
        appName: 'PromptTune',
      });
      expect(result).toBe('你好 Alice，欢迎使用 PromptTune！');
    });

    it('leaves missing variables intact in the template', () => {
      const template = '{{greeting}} {{name}}';
      const result = substituteVariables(template, { name: 'Bob' });
      expect(result).toBe('{{greeting}} Bob');
    });

    it('handles whitespace inside variable tags', () => {
      const template = '参数为: {{  target_id  }}';
      const result = substituteVariables(template, { target_id: '12345' });
      expect(result).toBe('参数为: 12345');
    });
  });

  describe('extractVariablesFromText', () => {
    it('extracts variable names while ignoring @ references', () => {
      const text = '你好 {{userName}}，请参考 {{@团队规范}}，输入内容为 {{inputData}}';
      const vars = extractVariablesFromText(text);
      expect(vars).toEqual(['userName', 'inputData']);
    });

    it('deduplicates recurring variable names', () => {
      const text = '{{query}} 在处理 {{query}} 时出现错误';
      expect(extractVariablesFromText(text)).toEqual(['query']);
    });
  });

  describe('syncVariables', () => {
    it('keeps existing variable values while adding newly discovered variables', () => {
      const existing = [
        { name: 'lang', currentValue: 'TypeScript', defaultValue: 'JS', description: '编程语言' },
      ];
      const newText = '请将 {{code}} 翻译为 {{lang}} 并在 {{framework}} 中运行';
      const synced = syncVariables(existing, newText);

      expect(synced.length).toBe(3);
      const langVar = synced.find((v) => v.name === 'lang');
      expect(langVar?.currentValue).toBe('TypeScript');
      expect(langVar?.description).toBe('编程语言');

      const codeVar = synced.find((v) => v.name === 'code');
      expect(codeVar).toBeDefined();
      expect(codeVar?.currentValue).toBe('');
      expect(codeVar?.description).toBe('自动提取变量');
    });

    it('removes variables that no longer exist in the text', () => {
      const existing = [
        { name: 'obsolete', currentValue: 'old', defaultValue: '', description: '' },
        { name: 'active', currentValue: 'current', defaultValue: '', description: '' },
      ];
      const newText = '仅保留 {{active}} 变量';
      const synced = syncVariables(existing, newText);
      expect(synced.map((v) => v.name)).toEqual(['active']);
    });
  });

  describe('parsePartialJsonArray', () => {
    it('parses fully completed JSON array', () => {
      const json = '[{"title": "Item 1"}, {"title": "Item 2"}]';
      const result = parsePartialJsonArray(json);
      expect(result).toEqual([{ title: 'Item 1' }, { title: 'Item 2' }]);
    });

    it('parses partially completed streaming JSON array with unclosed brackets', () => {
      const partial = '[{"title": "Item 1"}, {"title": "Item 2"';
      const result = parsePartialJsonArray(partial);
      expect(result).toEqual([{ title: 'Item 1' }]);
    });

    it('handles markdown fenced json code blocks', () => {
      const fenced = '```json\n[{"id": 1}, {"id": 2}]\n```';
      const result = parsePartialJsonArray(fenced);
      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    });
  });

  describe('normalizeBaseUrl', () => {
    it('cleans and builds chat and models endpoints', () => {
      const res = normalizeBaseUrl('https://api.openai.com/v1');
      expect(res.cleanBase).toBe('https://api.openai.com/v1');
      expect(res.chatEndpoint).toBe('https://api.openai.com/v1/chat/completions');
      expect(res.modelsEndpoint).toBe('https://api.openai.com/v1/models');
    });

    it('automatically trims duplicate trailing slashes and /chat suffixes', () => {
      const res = normalizeBaseUrl('https://api.openai.com/v1/chat/completions///');
      expect(res.cleanBase).toBe('https://api.openai.com/v1');
      expect(res.chatEndpoint).toBe('https://api.openai.com/v1/chat/completions');
    });

    it('automatically adds http:// for localhost', () => {
      const res = normalizeBaseUrl('localhost:11434');
      expect(res.cleanBase).toBe('http://localhost:11434/v1');
      expect(res.chatEndpoint).toBe('http://localhost:11434/v1/chat/completions');
    });
  });

  describe('Model Capabilities & Aliases', () => {
    it('identifies reasoning models correctly', () => {
      expect(isReasoningModel('o1')).toBe(true);
      expect(isReasoningModel('o1-mini')).toBe(true);
      expect(isReasoningModel('o3-mini')).toBe(true);
      expect(isReasoningModel('gpt-4o')).toBe(false);
      expect(isReasoningModel('claude-3-5-sonnet')).toBe(false);
    });

    it('identifies vision models correctly', () => {
      expect(isVisionModel('gpt-4o')).toBe(true);
      expect(isVisionModel('claude-3-5-sonnet')).toBe(true);
      expect(isVisionModel('gemini-1.5-pro')).toBe(true);
      expect(isVisionModel('llava-13b')).toBe(true);
      expect(isVisionModel('gpt-3.5-turbo')).toBe(false);
    });

    it('resolves model aliases for special local / cloud proxies', () => {
      const resolved = resolveModelAlias('gemini-3.8', 'http://localhost:10100');
      expect(resolved).toBe('google-antigravity/gemini-3.8-flash');

      const claude = resolveModelAlias('claude-sonnet', 'http://127.0.0.1:10100');
      expect(claude).toBe('google-antigravity/claude-sonnet-4-6');
    });
  });

  describe('translateAPIError', () => {
    it('translates 401 unauthorized error to actionable message', () => {
      const msg = translateAPIError({ message: 'Unauthorized' }, 401);
      expect(msg).toBe('API 密钥无效或已过期，请在设置中重新检查密钥');
    });

    it('translates 429 rate limit error', () => {
      const msg = translateAPIError({ message: 'Rate limit' }, 429);
      expect(msg).toBe('请求触发速率限制，或当前 API 账户额度/余额不足');
    });

    it('translates 404 not found error', () => {
      const msg = translateAPIError({ message: 'Not Found' }, 404);
      expect(msg).toBe('目标端点或指定的模型名称不存在，请核对 Base URL 和 Model ID');
    });

    it('translates network fetch error', () => {
      const msg = translateAPIError(new TypeError('Failed to fetch'));
      expect(msg).toBe('网络连接受阻，请检查网络代理或本地 Ollama 是否已启动');
    });
  });
});
