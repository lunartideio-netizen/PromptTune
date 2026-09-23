/**
 * diffUtils.ts
 * 极简高效、零外部依赖的 LCS 差异比较工具
 * 支持行级 (Line-level) 与词级 (Word-level) 对比及增删统计
 */

export type DiffType = 'add' | 'del' | 'eq';

export interface DiffLine {
  type: DiffType;
  value: string;
  lineA?: number;
  lineB?: number;
}

export interface DiffToken {
  type: DiffType;
  value: string;
}

export interface DiffStats {
  addedLines: number;
  deletedLines: number;
  unchangedLines: number;
  addedChars: number;
  deletedChars: number;
}

/**
 * 通用 LCS 动态规划算法核心
 */
function computeLCS<T>(a: T[], b: T[], equals: (x: T, y: T) => boolean = (x, y) => x === y): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (equals(a[i - 1], b[j - 1])) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp;
}

/**
 * 计算行级差异 (Line-level Diff)
 */
export function computeLineDiff(oldText: string, newText: string): { diffs: DiffLine[]; stats: DiffStats } {
  const linesA = oldText.length > 0 ? oldText.split('\n') : [];
  const linesB = newText.length > 0 ? newText.split('\n') : [];

  const dp = computeLCS(linesA, linesB);
  const diffs: DiffLine[] = [];

  let i = linesA.length;
  let j = linesB.length;

  const rawDiffs: { type: DiffType; value: string; lineA?: number; lineB?: number }[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && linesA[i - 1] === linesB[j - 1]) {
      rawDiffs.push({ type: 'eq', value: linesA[i - 1], lineA: i, lineB: j });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rawDiffs.push({ type: 'add', value: linesB[j - 1], lineB: j });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      rawDiffs.push({ type: 'del', value: linesA[i - 1], lineA: i });
      i--;
    }
  }

  rawDiffs.reverse();

  let addedLines = 0;
  let deletedLines = 0;
  let unchangedLines = 0;
  let addedChars = 0;
  let deletedChars = 0;

  for (const item of rawDiffs) {
    if (item.type === 'add') {
      addedLines++;
      addedChars += item.value.length;
    } else if (item.type === 'del') {
      deletedLines++;
      deletedChars += item.value.length;
    } else {
      unchangedLines++;
    }
    diffs.push(item);
  }

  return {
    diffs,
    stats: {
      addedLines,
      deletedLines,
      unchangedLines,
      addedChars,
      deletedChars,
    },
  };
}

/**
 * 单词/词素级别切分正则 (包含汉字、词组、标点与空白符)
 */
function tokenizeWords(text: string): string[] {
  if (!text) return [];
  // 将中文单字、英文单词、标点符号、换行与空白分别作为最小匹配单元
  const matched = text.match(/[\u4e00-\u9fa5]|[a-zA-Z0-9_]+|[^\u4e00-\u9fa5a-zA-Z0-9_\s]|\s+/g);
  return matched || [text];
}

/**
 * 计算词级精细差异 (Word-level Diff)
 */
export function computeWordDiff(oldText: string, newText: string): DiffToken[] {
  const tokensA = tokenizeWords(oldText);
  const tokensB = tokenizeWords(newText);

  // 当文本过大时，保护避免二维矩阵爆栈 (超过 1000 词回退快速对比)
  if (tokensA.length * tokensB.length > 1000000) {
    return [
      ...(oldText ? [{ type: 'del' as DiffType, value: oldText }] : []),
      ...(newText ? [{ type: 'add' as DiffType, value: newText }] : []),
    ];
  }

  const dp = computeLCS(tokensA, tokensB);
  const rawDiffs: DiffToken[] = [];

  let i = tokensA.length;
  let j = tokensB.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && tokensA[i - 1] === tokensB[j - 1]) {
      rawDiffs.push({ type: 'eq', value: tokensA[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rawDiffs.push({ type: 'add', value: tokensB[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      rawDiffs.push({ type: 'del', value: tokensA[i - 1] });
      i--;
    }
  }

  rawDiffs.reverse();

  // 合并连续相同类型的 token
  const merged: DiffToken[] = [];
  for (const item of rawDiffs) {
    if (merged.length > 0 && merged[merged.length - 1].type === item.type) {
      merged[merged.length - 1].value += item.value;
    } else {
      merged.push({ ...item });
    }
  }

  return merged;
}
