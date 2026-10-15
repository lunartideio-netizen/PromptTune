import { describe, it, expect } from 'vitest';
import { 
  serializePromptToMarkdown, 
  parseMarkdownToPrompt, 
  exportProjectToPromptFiles 
} from './gitSyncUtils';
import { PromptItem, FolderItem } from '../types';

describe('gitSyncUtils', () => {
  it('serializes prompt to Markdown with YAML FrontMatter properly', () => {
    const prompt: PromptItem = {
      id: 'p-auth',
      title: '认证鉴权架构师',
      originalDraft: '帮我设计 OAuth2 和 JWT 方案',
      currentOptimized: '【架构师角色】执行严格的安全鉴权规范',
      framework: 'CO-STAR',
      variables: [{ name: 'auth_type', description: '鉴权模式', defaultValue: 'JWT', currentValue: 'JWT' }],
      versions: [],
      turns: [],
      createdAt: 1000,
      updatedAt: 2000,
      folderId: 'f1',
    };

    const md = serializePromptToMarkdown(prompt, '核心服务/安全模块');
    expect(md).toContain('---');
    expect(md).toContain('id: "p-auth"');
    expect(md).toContain('title: "认证鉴权架构师"');
    expect(md).toContain('framework: "CO-STAR"');
    expect(md).toContain('folder: "核心服务/安全模块"');
    expect(md).toContain('## 原始草稿 / Draft');
    expect(md).toContain('帮我设计 OAuth2 和 JWT 方案');
    expect(md).toContain('## 工业级优化成果 / Optimized Prompt');
    expect(md).toContain('【架构师角色】执行严格的安全鉴权规范');
  });

  it('parses Markdown with YAML FrontMatter back to prompt structure cleanly', () => {
    const rawMd = `---
id: "p-test-01"
title: "SQL优化专家"
framework: "ROLE_TASK_FORMAT"
variables:
  - name: "table_schema"
---

## 原始草稿 / Draft

优化这条慢查询 SQL

## 工业级优化成果 / Optimized Prompt

严格遵循 MySQL 8.0 执行计划进行索引推算
`;

    const parsed = parseMarkdownToPrompt(rawMd, 'DB/SQL优化专家.prompt.md');
    expect(parsed.id).toBe('p-test-01');
    expect(parsed.title).toBe('SQL优化专家');
    expect(parsed.framework).toBe('ROLE_TASK_FORMAT');
    expect(parsed.originalDraft).toBe('优化这条慢查询 SQL');
    expect(parsed.currentOptimized).toBe('严格遵循 MySQL 8.0 执行计划进行索引推算');
    expect(parsed.variables?.length).toBe(1);
    expect(parsed.variables?.[0].name).toBe('table_schema');
  });

  it('accurately parses nested variables with descriptions and defaultValues roundtrip', () => {
    const rawMd = `---
id: "p-roundtrip"
title: "微服务架构师"
framework: "CO-STAR"
variables:
  - name: "service_name"
    description: "目标微服务名称"
    defaultValue: "order-center"
  - name: "qps_target"
    description: "吞吐量峰值预估"
    defaultValue: "10000"
---

## 工业级优化成果 / Optimized Prompt

高并发服务容量规划
`;

    const parsed = parseMarkdownToPrompt(rawMd);
    expect(parsed.id).toBe('p-roundtrip');
    expect(parsed.title).toBe('微服务架构师');
    expect(parsed.variables).toHaveLength(2);
    expect(parsed.variables?.[0].name).toBe('service_name');
    expect(parsed.variables?.[0].description).toBe('目标微服务名称');
    expect(parsed.variables?.[0].defaultValue).toBe('order-center');
    expect(parsed.variables?.[1].name).toBe('qps_target');
    expect(parsed.variables?.[1].description).toBe('吞吐量峰值预估');
    expect(parsed.variables?.[1].defaultValue).toBe('10000');
  });

  it('exports multiple prompts with folder path hierarchy correctly', () => {
    const folders: FolderItem[] = [
      { id: 'f-root', name: '后端系统', parentId: null, createdAt: 1, updatedAt: 1, systemContext: '', domainRules: '', inheritParent: true, order: 0 },
      { id: 'f-sub', name: '数据流', parentId: 'f-root', createdAt: 2, updatedAt: 2, systemContext: '', domainRules: '', inheritParent: true, order: 1 },
    ];

    const prompts: PromptItem[] = [
      {
        id: 'p-1',
        title: 'Kafka调优',
        originalDraft: '',
        currentOptimized: 'Kafka 消费延迟治理方案',
        framework: 'CO-STAR',
        variables: [],
        versions: [],
        turns: [],
        createdAt: 1,
        updatedAt: 1,
        folderId: 'f-sub',
      },
    ];

    const files = exportProjectToPromptFiles(prompts, folders);
    expect(files.length).toBe(1);
    expect(files[0].path).toBe('后端系统/数据流/Kafka调优.prompt.md');
    expect(files[0].content).toContain('Kafka 消费延迟治理方案');
  });
});
