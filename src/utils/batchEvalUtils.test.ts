import { describe, it, expect } from 'vitest';
import { 
  generateDefaultTestCases, 
  exportBatchEvalToMarkdown, 
  exportBatchEvalToCsv, 
  parseDatasetCsv,
  parseDatasetJsonl,
  exportBatchEvalToJsonl,
  DatasetCaseItem 
} from './batchEvalUtils';

describe('batchEvalUtils', () => {
  it('generates boundary test cases correctly for variables', () => {
    const vars = ['role', 'content'];
    const cases = generateDefaultTestCases(vars);
    expect(cases.length).toBe(4);
    expect(cases[0].name).toContain('标准常规入参');
    expect(cases[0].variableValues.role).toContain('标准输入_role');
    expect(cases[1].name).toContain('边界空值测试');
    expect(cases[1].variableValues.role).toBe('');
    expect(cases[2].name).toContain('特殊字符注入');
    expect(cases[3].name).toContain('超长文本');
  });

  it('exports batch eval to markdown properly', () => {
    const cases: DatasetCaseItem[] = [
      {
        id: '1',
        name: 'Case 1',
        variableValues: { input: 'hello' },
        status: 'completed',
        ttftMs: 250,
        totalMs: 1200,
        output: 'World output',
      },
    ];

    const md = exportBatchEvalToMarkdown('Test Prompt', 'deepseek-chat', cases, ['input']);
    expect(md).toContain('# PromptTune 批量数据集评测报告');
    expect(md).toContain('deepseek-chat');
    expect(md).toContain('Case 1');
    expect(md).toContain('250ms');
    expect(md).toContain('World output');
  });

  it('exports batch eval to CSV properly with Excel BOM', () => {
    const cases: DatasetCaseItem[] = [
      {
        id: '1',
        name: 'Case 1',
        variableValues: { user: 'Alice' },
        status: 'completed',
        ttftMs: 200,
        totalMs: 800,
        output: 'Hello Alice',
      },
    ];

    const csv = exportBatchEvalToCsv(cases, ['user']);
    expect(csv.charCodeAt(0)).toBe(0xFEFF); // BOM
    expect(csv).toContain('"Case 1"');
    expect(csv).toContain('"Alice"');
    expect(csv).toContain('"Hello Alice"');
  });

  it('parses CSV dataset with quoted commas and mapped variables correctly', () => {
    const csvContent = `用例名称,role,task
"高难度架构师评测","资深全栈, 架构师","优化缓存与高并发架构"
"新手入职","初级前端","修复 Header 样式"
`;
    const res = parseDatasetCsv(csvContent, ['role', 'task']);
    expect(res.totalRows).toBe(2);
    expect(res.matchedVars).toEqual(['role', 'task']);
    expect(res.cases[0].name).toBe('高难度架构师评测');
    expect(res.cases[0].variableValues.role).toBe('资深全栈, 架构师');
    expect(res.cases[0].variableValues.task).toBe('优化缓存与高并发架构');
    expect(res.cases[1].name).toBe('新手入职');
  });

  it('parses JSONL dataset and exports to JSONL cleanly', () => {
    const jsonlContent = `{"name": "用例A", "role": "安全专家", "task": "渗透测试"}
{"name": "用例B", "vars": {"role": "DBA", "task": "分库分表"}}`;

    const parsed = parseDatasetJsonl(jsonlContent, ['role', 'task']);
    expect(parsed.totalRows).toBe(2);
    expect(parsed.cases[0].name).toBe('用例A');
    expect(parsed.cases[0].variableValues.role).toBe('安全专家');
    expect(parsed.cases[1].name).toBe('用例B');
    expect(parsed.cases[1].variableValues.role).toBe('DBA');

    // Export to JSONL
    parsed.cases[0].status = 'completed';
    parsed.cases[0].output = '渗透报告已生成';
    const exported = exportBatchEvalToJsonl(parsed.cases, ['role', 'task']);
    expect(exported).toContain('"name":"用例A"');
    expect(exported).toContain('"output":"渗透报告已生成"');
  });

  it('generates judge prompt and parses judge JSON responses correctly', async () => {
    const { generateJudgePrompt, parseJudgeResponse, calculateJudgeMetrics, DEFAULT_JUDGE_RUBRICS } = await import('./batchEvalUtils');
    const prompt = generateJudgePrompt('系统指令', { topic: 'AI' }, '这是模型的详细回复');
    expect(prompt).toContain('你是一名极其苛刻、客观、公正的 AI 提示词质量质检首席裁判官');
    expect(prompt).toContain('这是模型的详细回复');

    const jsonRes = '```json\n{"score": 4.5, "pass": true, "reason": "符合工业级标准"}\n```';
    const parsed = parseJudgeResponse(jsonRes);
    expect(parsed.score).toBe(4.5);
    expect(parsed.pass).toBe(true);
    expect(parsed.reason).toBe('符合工业级标准');

    const lowScoreRes = '{"score": 2.5, "pass": false, "reason": "格式错误"}';
    const parsedLow = parseJudgeResponse(lowScoreRes, 3.5);
    expect(parsedLow.score).toBe(2.5);
    expect(parsedLow.pass).toBe(false);

    // Metrics summary
    const mockCases: DatasetCaseItem[] = [
      { id: '1', name: '1', variableValues: {}, status: 'completed', judgeScore: 4.5, judgeStatus: 'pass' },
      { id: '2', name: '2', variableValues: {}, status: 'completed', judgeScore: 2.5, judgeStatus: 'fail' },
      { id: '3', name: '3', variableValues: {}, status: 'completed', judgeScore: 5.0, judgeStatus: 'pass' },
      { id: '4', name: '4', variableValues: {}, status: 'idle' },
    ];
    const metrics = calculateJudgeMetrics(mockCases);
    expect(metrics.totalJudged).toBe(3);
    expect(metrics.passCount).toBe(2);
    expect(metrics.failCount).toBe(1);
    expect(metrics.passRate).toBe(67);
    expect(metrics.averageScore).toBe(4.0);
  });
});
