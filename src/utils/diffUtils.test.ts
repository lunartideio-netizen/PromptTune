import { describe, it, expect } from 'vitest';
import { computeLineDiff, computeWordDiff } from './diffUtils';

describe('diffUtils', () => {
  describe('computeLineDiff', () => {
    it('should return empty diff for empty inputs', () => {
      const res = computeLineDiff('', '');
      expect(res.diffs).toHaveLength(0);
      expect(res.stats.addedLines).toBe(0);
      expect(res.stats.deletedLines).toBe(0);
      expect(res.stats.unchangedLines).toBe(0);
    });

    it('should identify identical multi-line texts as eq', () => {
      const text = 'Line 1\nLine 2\nLine 3';
      const res = computeLineDiff(text, text);
      expect(res.diffs).toHaveLength(3);
      expect(res.diffs.every((d) => d.type === 'eq')).toBe(true);
      expect(res.stats.unchangedLines).toBe(3);
      expect(res.stats.addedLines).toBe(0);
      expect(res.stats.deletedLines).toBe(0);
    });

    it('should correctly identify added and deleted lines in the middle', () => {
      const oldText = 'Header\nStep 1\nStep 2\nFooter';
      const newText = 'Header\nStep 1 (modified)\nStep 2\nStep 3 (new)\nFooter';

      const res = computeLineDiff(oldText, newText);
      expect(res.stats.addedLines).toBe(2);
      expect(res.stats.deletedLines).toBe(1);
      expect(res.stats.unchangedLines).toBe(3); // Header, Step 2, Footer
    });

    it('should leverage prefix and suffix trimming efficiently', () => {
      const prefix = Array.from({ length: 50 }, (_, i) => `Prefix line ${i}`).join('\n');
      const suffix = Array.from({ length: 50 }, (_, i) => `Suffix line ${i}`).join('\n');
      const oldText = `${prefix}\nMiddle Old\n${suffix}`;
      const newText = `${prefix}\nMiddle New\n${suffix}`;

      const res = computeLineDiff(oldText, newText);
      expect(res.stats.deletedLines).toBe(1);
      expect(res.stats.addedLines).toBe(1);
      expect(res.stats.unchangedLines).toBe(100);
    });
  });

  describe('computeWordDiff', () => {
    it('should handle identical texts without error', () => {
      const text = '你是一名资深架构师';
      const res = computeWordDiff(text, text);
      expect(res).toHaveLength(1);
      expect(res[0].type).toBe('eq');
      expect(res[0].value).toBe(text);
    });

    it('should detect word level changes in Chinese and English', () => {
      const oldText = '你是一名架构师';
      const newText = '你是一名世界级全栈架构师';

      const res = computeWordDiff(oldText, newText);
      const hasAdded = res.some((t) => t.type === 'add');
      expect(hasAdded).toBe(true);
    });
  });
});
