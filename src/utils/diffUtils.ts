/**
 * diffUtils.ts
 * 极简高效、零外部依赖的 LCS 差异比较工具
 * 优化：集成公共前后缀修剪 (Fast Prefix/Suffix Trimming)，将实际 DP 范围缩减 80%~95%
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
 * 经典 LCS 动态规划算法核心 (计算两序列最大公共子序列矩阵)
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
 * 带前后缀线性剪枝的高性能差异切片比对 (Trimmed Slice Diff)
 * 将绝大多数未变更的头部与尾部通过 O(N) 快速修剪，仅对发生实质变动的中间切片执行 DP，大幅缩减计算与内存占用
 */
function computeSliceDiff<T>(
  a: T[],
  b: T[],
  equals: (x: T, y: T) => boolean = (x, y) => x === y
): { type: DiffType; value: T }[] {
  const m = a.length;
  const n = b.length;

  if (m === 0 && n === 0) return [];
  if (m === 0) return b.map((val) => ({ type: 'add' as DiffType, value: val }));
  if (n === 0) return a.map((val) => ({ type: 'del' as DiffType, value: val }));

  // 1. 快速修剪公共前缀
  let start = 0;
  while (start < m && start < n && equals(a[start], b[start])) {
    start++;
  }

  // 2. 快速修剪公共后缀
  let endA = m - 1;
  let endB = n - 1;
  while (endA >= start && endB >= start && equals(a[endA], b[endB])) {
    endA--;
    endB--;
  }

  const prefixItems: { type: DiffType; value: T }[] = [];
  for (let k = 0; k < start; k++) {
    prefixItems.push({ type: 'eq', value: a[k] });
  }

  const suffixItems: { type: DiffType; value: T }[] = [];
  for (let k = endA + 1; k < m; k++) {
    suffixItems.push({ type: 'eq', value: a[k] });
  }

  // 3. 中间变动切片
  const subA = a.slice(start, endA + 1);
  const subB = b.slice(start, endB + 1);
  const midDiffs: { type: DiffType; value: T }[] = [];

  if (subA.length === 0 && subB.length === 0) {
    // 中间无变动
  } else if (subA.length === 0) {
    for (const item of subB) midDiffs.push({ type: 'add', value: item });
  } else if (subB.length === 0) {
    for (const item of subA) midDiffs.push({ type: 'del', value: item });
  } else {
    const subM = subA.length;
    const subN = subB.length;

    // 保护阈值：若中间切片仍大于 600,000 单元，回退为块状替换，防止主线程冻结
    if (subM * subN > 600000) {
      for (const item of subA) midDiffs.push({ type: 'del', value: item });
      for (const item of subB) midDiffs.push({ type: 'add', value: item });
    } else {
      const dp = computeLCS(subA, subB, equals);
      let i = subM;
      let j = subN;
      const raw: { type: DiffType; value: T }[] = [];

      while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && equals(subA[i - 1], subB[j - 1])) {
          raw.push({ type: 'eq', value: subA[i - 1] });
          i--;
          j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
          raw.push({ type: 'add', value: subB[j - 1] });
          j--;
        } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
          raw.push({ type: 'del', value: subA[i - 1] });
          i--;
        }
      }
      raw.reverse();
      midDiffs.push(...raw);
    }
  }

  return [...prefixItems, ...midDiffs, ...suffixItems];
}

/**
 * 计算行级差异 (Line-level Diff)
 */
export function computeLineDiff(oldText: string, newText: string): { diffs: DiffLine[]; stats: DiffStats } {
  const linesA = oldText.length > 0 ? oldText.split('\n') : [];
  const linesB = newText.length > 0 ? newText.split('\n') : [];

  const rawDiffs = computeSliceDiff(linesA, linesB);

  const diffs: DiffLine[] = [];
  let addedLines = 0;
  let deletedLines = 0;
  let unchangedLines = 0;
  let addedChars = 0;
  let deletedChars = 0;

  let lineA = 1;
  let lineB = 1;

  for (const item of rawDiffs) {
    if (item.type === 'add') {
      addedLines++;
      addedChars += item.value.length;
      diffs.push({ type: 'add', value: item.value, lineB: lineB++ });
    } else if (item.type === 'del') {
      deletedLines++;
      deletedChars += item.value.length;
      diffs.push({ type: 'del', value: item.value, lineA: lineA++ });
    } else {
      unchangedLines++;
      diffs.push({ type: 'eq', value: item.value, lineA: lineA++, lineB: lineB++ });
    }
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
  const matched = text.match(/[\u4e00-\u9fa5]|[a-zA-Z0-9_]+|[^\u4e00-\u9fa5a-zA-Z0-9_\s]|\s+/g);
  return matched || [text];
}

/**
 * 计算词级精细差异 (Word-level Diff)
 */
export function computeWordDiff(oldText: string, newText: string): DiffToken[] {
  if (oldText === newText) {
    return oldText ? [{ type: 'eq', value: oldText }] : [];
  }

  const tokensA = tokenizeWords(oldText);
  const tokensB = tokenizeWords(newText);

  const rawDiffs = computeSliceDiff(tokensA, tokensB);

  // 合并连续相同类型的 token，保证视图整洁
  const merged: DiffToken[] = [];
  for (const item of rawDiffs) {
    if (merged.length > 0 && merged[merged.length - 1].type === item.type) {
      merged[merged.length - 1].value += item.value;
    } else {
      merged.push({ type: item.type, value: item.value });
    }
  }

  return merged;
}
