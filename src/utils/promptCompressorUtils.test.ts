import { describe, it, expect } from 'vitest';
import { 
  calculateTokenSavings, 
  generateCompressorPrompt,
  detectRedundantPatterns 
} from './promptCompressorUtils';

describe('promptCompressorUtils', () => {
  it('应当准确计算前后 Token 差值与节省百分比', () => {
    const original = '这是一个非常冗长且包含很多废话的提示词，请务必注意无论如何都要满足用户的要求，请严格按照格式输出。';
    const compressed = '严格按格式输出，满足用户要求。';
    
    const stats = calculateTokenSavings(original, compressed, 'gpt-4o');
    expect(stats.originalTokens).toBeGreaterThan(stats.compressedTokens);
    expect(stats.savedTokens).toBe(stats.originalTokens - stats.compressedTokens);
    expect(stats.savingRatePercent).toBeGreaterThan(0);
    expect(stats.savingRatePercent).toBeLessThanOrEqual(100);
  });

  it('如果压缩后没有变化或字符更多，节约率应当为 0', () => {
    const text = '保持原样';
    const stats = calculateTokenSavings(text, text, 'gpt-4o');
    expect(stats.savedTokens).toBe(0);
    expect(stats.savingRatePercent).toBe(0);
  });

  it('应当能够检测出提示词中的经典冗余反模式短语', () => {
    const noisyText = '好的，我明白你的意思了。在接下来的回答中，请务必注意不要遗漏。作为一个AI助手，你需要尽力而为。';
    const redundantHits = detectRedundantPatterns(noisyText);
    expect(redundantHits.length).toBeGreaterThan(0);
    expect(redundantHits.some(r => r.includes('AI助手') || r.includes('好的') || r.includes('尽力而为'))).toBe(true);
  });

  it('生成的压缩提示词中必须包含保留 {{variable}} 变量占位符和核心逻辑的铁律约束', () => {
    const prompt = generateCompressorPrompt('输入需求: {{topic}}');
    expect(prompt).toContain('{{');
    expect(prompt).toContain('}}');
    expect(prompt).toContain('无损压缩');
  });
});
