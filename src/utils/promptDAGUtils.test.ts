import { describe, it, expect } from 'vitest';
import { buildPromptDAG } from './promptDAGUtils';
import { PromptItem, SkillItem } from '../types';

describe('promptDAGUtils', () => {
  it('correctly builds DAG with linear reference and chaining', () => {
    const prompts: PromptItem[] = [
      {
        id: 'p1',
        title: '基础角色',
        originalDraft: '你是全栈专家',
        currentOptimized: '',
        framework: 'CO-STAR',
        variables: [],
        versions: [],
        turns: [],
        createdAt: 1,
        updatedAt: 1,
        folderId: null,
      },
      {
        id: 'p2',
        title: '核心架构',
        originalDraft: '承接 {{@基础角色}} 的要求',
        currentOptimized: '',
        framework: 'CO-STAR',
        variables: [],
        versions: [],
        turns: [],
        createdAt: 2,
        updatedAt: 2,
        folderId: null,
        parentPromptId: 'p1',
      },
    ];

    const dag = buildPromptDAG(prompts);
    expect(dag.nodes.length).toBe(2);
    expect(dag.hasCycle).toBe(false);

    // p1 -> p2 应有两条边：一条 chain 父子链路，一条 reference 语法引用
    expect(dag.edges.length).toBe(2);
    const p1Node = dag.nodes.find((n) => n.id === 'p1');
    const p2Node = dag.nodes.find((n) => n.id === 'p2');
    expect(p1Node?.layer).toBe(0);
    expect(p2Node?.layer).toBeGreaterThanOrEqual(1);
  });

  it('detects circular reference cycles accurately', () => {
    const cyclicPrompts: PromptItem[] = [
      {
        id: 'cA',
        title: '模块A',
        originalDraft: '调用 {{@模块B}}',
        currentOptimized: '',
        framework: 'CO-STAR',
        variables: [],
        versions: [],
        turns: [],
        createdAt: 1,
        updatedAt: 1,
        folderId: null,
      },
      {
        id: 'cB',
        title: '模块B',
        originalDraft: '调用 {{@模块A}}',
        currentOptimized: '',
        framework: 'CO-STAR',
        variables: [],
        versions: [],
        turns: [],
        createdAt: 2,
        updatedAt: 2,
        folderId: null,
      },
    ];

    const dag = buildPromptDAG(cyclicPrompts);
    expect(dag.hasCycle).toBe(true);
    expect(dag.cycleNodes).toContain('cA');
    expect(dag.cycleNodes).toContain('cB');
  });

  it('correctly attaches installed skill node into DAG', () => {
    const prompts: PromptItem[] = [
      {
        id: 'p-agent',
        title: 'AI研发助手',
        originalDraft: '装配技能：{{@代码重构专家}}',
        currentOptimized: '',
        framework: 'CO-STAR',
        variables: [],
        versions: [],
        turns: [],
        createdAt: 1,
        updatedAt: 1,
        folderId: null,
      },
    ];

    const skills: SkillItem[] = [
      {
        id: 'skill-refactor',
        title: '代码重构专家',
        distilledPrompt: '执行 Clean Architecture 规范',
        category: 'coding',
        framework: 'BROKE',
        description: '重构专家',
        systemPersona: '架构师',
        workflow: '分析代码',
        guardrails: '单元测试覆盖',
        variables: [],
        createdAt: 1,
        updatedAt: 1,
      },
    ];

    const dag = buildPromptDAG(prompts, skills);
    expect(dag.nodes.some((n) => n.id === 'skill-skill-refactor')).toBe(true);
    expect(dag.edges.some((e) => e.from === 'skill-skill-refactor' && e.to === 'p-agent')).toBe(true);
  });
});
