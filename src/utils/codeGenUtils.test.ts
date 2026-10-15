import { describe, it, expect } from 'vitest';
import { generateExportCode } from './codeGenUtils';
import { PromptVariable } from '../types';

describe('codeGenUtils - generateExportCode', () => {
  const sampleVariables: PromptVariable[] = [
    { name: 'role', currentValue: '资深全栈架构师' },
    { name: 'task', currentValue: '重构微服务' },
  ];

  const baseOptions = {
    title: 'CodeReviewPrompt',
    systemContext: '你是一名资深技术专家。',
    promptText: '请针对 {{role}} 的视角，完成以下任务：{{task}}',
    variables: sampleVariables,
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/v1',
    temperature: 0.5,
  };

  it('generates python SDK code correctly', () => {
    const code = generateExportCode('python', baseOptions);
    expect(code).toContain('from openai import OpenAI');
    expect(code).toContain('model="deepseek-chat"');
    expect(code).toContain('base_url=os.getenv("OPENAI_BASE_URL", "https://api.deepseek.com/v1")');
    expect(code).toContain('temperature=0.5');
    expect(code).toContain('def run_CodeReviewPrompt(variables: dict) -> str:');
    expect(code).toContain('"role": "示例_role"');
    expect(code).toContain('"task": "示例_task"');
  });

  it('generates typescript SDK code correctly', () => {
    const code = generateExportCode('typescript', baseOptions);
    expect(code).toContain("import OpenAI from 'openai';");
    expect(code).toContain("model: 'deepseek-chat'");
    expect(code).toContain('temperature: 0.5');
    expect(code).toContain('export async function executeCodeReviewPrompt');
    expect(code).toContain('"role": "示例_role"');
  });

  it('generates langchain code and transforms {{var}} to {var}', () => {
    const code = generateExportCode('langchain', baseOptions);
    expect(code).toContain('from langchain_openai import ChatOpenAI');
    expect(code).toContain('from langchain_core.prompts import ChatPromptTemplate');
    expect(code).toContain('chain = prompt | llm | StrOutputParser()');
    // Verifies {{role}} converted to {role}
    expect(code).toContain('{role}');
    expect(code).toContain('{task}');
    expect(code).not.toContain('{{role}}');
  });

  it('generates curl command with JSON payload', () => {
    const code = generateExportCode('curl', baseOptions);
    expect(code).toContain('curl https://api.deepseek.com/v1/chat/completions');
    expect(code).toContain('-H "Content-Type: application/json"');
    expect(code).toContain('"model": "deepseek-chat"');
    // Replaced variables with current value
    expect(code).toContain('资深全栈架构师');
    expect(code).toContain('重构微服务');
  });

  it('generates promptfoo CI/CD yaml config with tests and assertions', () => {
    const code = generateExportCode('promptfoo', baseOptions);
    expect(code).toContain('promptfoo.dev/config-schema.json');
    expect(code).toContain('npx promptfoo@latest eval -c promptfooconfig.yaml');
    expect(code).toContain('description: "CodeReviewPrompt 提示词工程质量门禁与回归评估"');
    expect(code).toContain('providers:');
    expect(code).toContain('id: openai:chat:deepseek-chat');
    expect(code).toContain('apiBaseUrl: "https://api.deepseek.com/v1"');
    expect(code).toContain('tests:');
    expect(code).toContain('role: "资深全栈架构师"');
    expect(code).toContain('task: "重构微服务"');
    expect(code).toContain('type: latency');
    expect(code).toContain('threshold: 8000');
  });
});
