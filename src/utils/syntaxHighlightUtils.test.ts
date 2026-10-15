import { describe, it, expect } from 'vitest';
import { tokenizePromptSyntax, splitPromptBlocks } from './syntaxHighlightUtils';

describe('syntaxHighlightUtils', () => {
  it('tokenizes plain text correctly', () => {
    const tokens = tokenizePromptSyntax('这是一段普通的提示词文本');
    expect(tokens.length).toBe(1);
    expect(tokens[0].type).toBe('text');
  });

  it('tokenizes variable placeholders correctly', () => {
    const tokens = tokenizePromptSyntax('Hello {{user_name}}, welcome to {{system}}!');
    expect(tokens.length).toBe(5);
    expect(tokens[1].type).toBe('variable');
    expect(tokens[1].payload).toBe('user_name');
    expect(tokens[3].type).toBe('variable');
    expect(tokens[3].payload).toBe('system');
  });

  it('tokenizes variable placeholders with spaces correctly', () => {
    const tokens = tokenizePromptSyntax('Hello {{ user_name }}, welcome to {{ system }}!');
    expect(tokens.length).toBe(5);
    expect(tokens[1].type).toBe('variable');
    expect(tokens[1].payload).toBe('user_name');
    expect(tokens[3].type).toBe('variable');
    expect(tokens[3].payload).toBe('system');
  });

  it('tokenizes references with spaces correctly', () => {
    const tokens = tokenizePromptSyntax('请参考能力：{{@ 架构师技能 }} 完成重构');
    expect(tokens.length).toBe(3);
    expect(tokens[1].type).toBe('reference');
    expect(tokens[1].payload).toBe('架构师技能');
  });

  it('tokenizes cross references correctly', () => {
    const tokens = tokenizePromptSyntax('请参考能力：{{@架构师技能}} 完成重构');
    expect(tokens.length).toBe(3);
    expect(tokens[1].type).toBe('reference');
    expect(tokens[1].payload).toBe('架构师技能');
  });

  it('tokenizes XML tags correctly', () => {
    const tokens = tokenizePromptSyntax('<thought>\n分析核心诉求\n</thought>\n<response>结果</response>');
    const tags = tokens.filter((t) => t.type === 'xmlTag');
    expect(tags.length).toBe(4);
    expect(tags[0].payload).toBe('<thought>');
    expect(tags[1].payload).toBe('</thought>');
    expect(tags[2].payload).toBe('<response>');
    expect(tags[3].payload).toBe('</response>');
  });

  it('splits fenced code blocks from markdown text accurately', () => {
    const prompt = `# 系统指令
请以 JSON 格式输出：
\`\`\`json
{
  "name": "{{user_name}}",
  "score": 100
}
\`\`\`
后续要求：严格遵守输出规范。`;

    const blocks = splitPromptBlocks(prompt);
    expect(blocks.length).toBe(3);
    expect(blocks[0].type).toBe('text');
    expect(blocks[0].raw).toContain('# 系统指令');
    expect(blocks[1].type).toBe('codeBlock');
    expect(blocks[1].lang).toBe('json');
    expect(blocks[1].code).toContain('"score": 100');
    expect(blocks[2].type).toBe('text');
    expect(blocks[2].raw).toContain('后续要求：严格遵守输出规范。');
  });
});
