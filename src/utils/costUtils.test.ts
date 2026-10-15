import { describe, it, expect } from 'vitest';
import { estimateTokensAccurate, calculateTokenCostReport } from './costUtils';

describe('costUtils - Token and Cost Estimation', () => {
  it('estimates tokens accurately for English and CJK text', () => {
    expect(estimateTokensAccurate('')).toBe(0);
    expect(estimateTokensAccurate('   ')).toBe(0);

    const enText = 'Hello world, this is a prompt engineering test.';
    const enTokens = estimateTokensAccurate(enText);
    expect(enTokens).toBeGreaterThan(5);
    expect(enTokens).toBeLessThan(20);

    const cjkText = '你是一名资深全栈架构师，请对代码进行全局扫描。';
    const cjkTokens = estimateTokensAccurate(cjkText);
    // 24 Chinese characters * 1.35 ~ 33 tokens
    expect(cjkTokens).toBeGreaterThan(20);
    expect(cjkTokens).toBeLessThan(40);
  });

  it('calculates token cost breakdown correctly for DeepSeek model', () => {
    const report = calculateTokenCostReport(
      '你是一个助手。',
      '请翻译以下内容：{{text}}',
      'text: Hello World',
      'deepseek-chat',
      7.2
    );

    expect(report.totalTokens).toBe(report.systemTokens + report.templateTokens + report.variableTokens);
    expect(report.rateInfo.name).toBe('DeepSeek-V3');
    expect(report.rateInfo.inputPerMillionUsd).toBe(0.14);
    expect(report.costPerCallUsd).toBeGreaterThan(0);
    expect(report.costPer100kUsd).toBeCloseTo(report.costPerCallUsd * 100000, 2);
    expect(report.costPer100kCny).toBeCloseTo(report.costPer100kUsd * 7.2, 1);
    expect(report.isWarning).toBe(false);
  });

  it('flags warning for extra long contexts', () => {
    const longText = 'A'.repeat(25000);
    const report = calculateTokenCostReport(
      '',
      longText,
      '',
      'gpt-4o'
    );

    expect(report.totalTokens).toBeGreaterThan(4000);
    expect(report.isWarning).toBe(true);
  });
});
