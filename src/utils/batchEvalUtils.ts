/**
 * batchEvalUtils.ts
 * 批量数据集并发评估与报告导出工具库 (FEAT-2)
 */

export interface DatasetCaseItem {
  id: string;
  name: string;
  variableValues: Record<string, string>;
  status: 'idle' | 'running' | 'completed' | 'error';
  output?: string;
  ttftMs?: number;
  totalMs?: number;
  error?: string;
  judgeScore?: number; // 1-5分
  judgeReason?: string; // 裁判打分理由
  judgeStatus?: 'pass' | 'fail' | 'pending'; // 质检是否达标
}

/**
 * 生成默认的边界测试数据集
 */
export function generateDefaultTestCases(variableNames: string[]): DatasetCaseItem[] {
  if (variableNames.length === 0) {
    return [
      {
        id: 'case-1',
        name: '用例 1: 默认基础用例',
        variableValues: {},
        status: 'idle',
      },
    ];
  }

  const standardValues: Record<string, string> = {};
  const emptyValues: Record<string, string> = {};
  const specialCharsValues: Record<string, string> = {};
  const longTextValues: Record<string, string> = {};

  for (const name of variableNames) {
    standardValues[name] = `标准输入_${name}`;
    emptyValues[name] = '';
    specialCharsValues[name] = `& <script>alert("test")</script> ' " \\n 特殊字符_${name}`;
    longTextValues[name] = `【超长测试入参_${name}】` + '针对高并发场景的压力与边界吞吐测试。'.repeat(6);
  }

  return [
    {
      id: 'case-std',
      name: '用例 1: 标准常规入参',
      variableValues: standardValues,
      status: 'idle',
    },
    {
      id: 'case-empty',
      name: '用例 2: 边界空值测试',
      variableValues: emptyValues,
      status: 'idle',
    },
    {
      id: 'case-special',
      name: '用例 3: 特殊字符注入测试',
      variableValues: specialCharsValues,
      status: 'idle',
    },
    {
      id: 'case-long',
      name: '用例 4: 边界超长文本测试',
      variableValues: longTextValues,
      status: 'idle',
    },
  ];
}

/**
 * 导出测试评测矩阵为 Markdown 格式报告
 */
export function exportBatchEvalToMarkdown(
  title: string,
  modelName: string,
  cases: DatasetCaseItem[],
  variableNames: string[]
): string {
  const dateStr = new Date().toLocaleString();
  let md = `# PromptTune 批量数据集评测报告\n\n`;
  md += `- **提示词标题**: ${title}\n`;
  md += `- **评测模型**: ${modelName}\n`;
  md += `- **生成时间**: ${dateStr}\n`;
  md += `- **总用例数**: ${cases.length}\n`;
  md += `- **成功完成**: ${cases.filter((c) => c.status === 'completed').length} / ${cases.length}\n\n`;

  md += `## 评测数据概览\n\n`;
  md += `| 序号 | 用例名称 | 状态 | 首字延迟 (TTFT) | 总耗时 | 变量入参摘要 |\n`;
  md += `| :--- | :--- | :---: | :---: | :---: | :--- |\n`;

  cases.forEach((c, idx) => {
    const varSummary = variableNames
      .map((k) => `${k}=${c.variableValues[k] || '空'}`)
      .join(', ')
      .replace(/\|/g, '\\|')
      .slice(0, 60);
    const ttft = c.ttftMs ? `${c.ttftMs}ms` : '-';
    const total = c.totalMs ? `${c.totalMs}ms` : '-';
    const statusText = c.status === 'completed' ? '✅ 完成' : c.status === 'error' ? '❌ 失败' : '⏳ 未跑';
    md += `| ${idx + 1} | ${c.name} | ${statusText} | ${ttft} | ${total} | ${varSummary} |\n`;
  });

  md += `\n---\n\n## 详细输出结果\n\n`;
  cases.forEach((c, idx) => {
    md += `### ${idx + 1}. ${c.name}\n\n`;
    md += `**入参变量**:\n\`\`\`json\n${JSON.stringify(c.variableValues, null, 2)}\n\`\`\`\n\n`;
    if (c.error) {
      md += `**执行异常**: \`${c.error}\`\n\n`;
    } else {
      md += `**模型生成结果** (${c.totalMs || 0}ms):\n\n${c.output || '(无输出)'}\n\n`;
    }
  });

  return md;
}

/**
 * 导出测试评测矩阵为 CSV 格式
 */
export function exportBatchEvalToCsv(
  cases: DatasetCaseItem[],
  variableNames: string[]
): string {
  const headers = ['用例名称', '状态', 'TTFT(ms)', '总耗时(ms)', ...variableNames, '生成结果', '错误原因'];
  
  const escapeCsv = (val: any) => {
    const str = String(val ?? '').replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows: string[] = [headers.map(escapeCsv).join(',')];

  for (const c of cases) {
    const row = [
      c.name,
      c.status,
      c.ttftMs || '',
      c.totalMs || '',
      ...variableNames.map((name) => c.variableValues[name] || ''),
      c.output || '',
      c.error || '',
    ];
    rows.push(row.map(escapeCsv).join(','));
  }

  return '\uFEFF' + rows.join('\r\n'); // 带 BOM 适配 Excel
}

/**
 * 健壮的 CSV 行与单元格解析器 (兼容 RFC 4180 双引号和换行符)
 */
export function parseCsvRows(csvText: string): string[][] {
  const clean = csvText.replace(/^\uFEFF/, '').trim();
  if (!clean) return [];

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    const nextChar = clean[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        // 转义的双引号 ""
        currentField += '"';
        i++;
      } else {
        // 切换引号状态
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // 跳过 \r\n
      }
      currentRow.push(currentField.trim());
      // 避免空行
      if (currentRow.some((f) => f.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * 解析 CSV 测试数据集，并自动映射到提示词模板变量
 */
export function parseDatasetCsv(
  csvContent: string,
  variableNames: string[]
): {
  cases: DatasetCaseItem[];
  matchedVars: string[];
  totalRows: number;
} {
  const rows = parseCsvRows(csvContent);
  if (rows.length === 0) {
    return { cases: [], matchedVars: [], totalRows: 0 };
  }

  const rawHeaders = rows[0].map((h) => h.replace(/[{}]/g, '').trim());
  const dataRows = rows.slice(1);

  // 寻找名称列索引
  const nameColIdx = rawHeaders.findIndex((h) =>
    /^(用例名称|用例|名称|name|case_name|case|id)$/i.test(h)
  );

  // 建立变量映射：header名称 (忽略大小写) -> 列索引
  const matchedVars: string[] = [];
  const varColMap: Record<string, number> = {};

  variableNames.forEach((varName) => {
    const cleanVar = varName.toLowerCase();
    const foundIdx = rawHeaders.findIndex(
      (h) => h.toLowerCase() === cleanVar
    );
    if (foundIdx !== -1) {
      matchedVars.push(varName);
      varColMap[varName] = foundIdx;
    }
  });

  const cases: DatasetCaseItem[] = dataRows.map((row, idx) => {
    const caseName =
      nameColIdx !== -1 && row[nameColIdx]
        ? row[nameColIdx]
        : `导入用例 ${idx + 1}`;

    const values: Record<string, string> = {};
    variableNames.forEach((varName) => {
      const colIdx = varColMap[varName];
      if (colIdx !== undefined && row[colIdx] !== undefined) {
        values[varName] = row[colIdx];
      } else {
        // 如果列未匹配，取该列索引（若无表头映射则按位置）
        values[varName] = '';
      }
    });

    return {
      id: `imported-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      name: caseName,
      variableValues: values,
      status: 'idle',
    };
  });

  return { cases, matchedVars, totalRows: cases.length };
}

/**
 * 解析 JSONL 或 JSON 数组格式的测试数据集
 */
export function parseDatasetJsonl(
  jsonlContent: string,
  variableNames: string[]
): {
  cases: DatasetCaseItem[];
  matchedVars: string[];
  totalRows: number;
} {
  const clean = jsonlContent.trim();
  if (!clean) return { cases: [], matchedVars: [], totalRows: 0 };

  let rawList: any[] = [];

  if (clean.startsWith('[') && clean.endsWith(']')) {
    try {
      rawList = JSON.parse(clean);
    } catch {
      rawList = [];
    }
  } else {
    const lines = clean.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        rawList.push(JSON.parse(trimmed));
      } catch {
        // 忽略非 JSON 行
      }
    }
  }

  if (rawList.length === 0) {
    return { cases: [], matchedVars: [], totalRows: 0 };
  }

  const matchedSet = new Set<string>();

  const cases: DatasetCaseItem[] = rawList.map((item, idx) => {
    const caseName =
      item.name || item.case_name || item.title || `JSONL 用例 ${idx + 1}`;
    const values: Record<string, string> = {};

    variableNames.forEach((varName) => {
      // 支持直接平铺字段或者在 vars / variables 子对象中
      const val =
        item[varName] ??
        item.vars?.[varName] ??
        item.variables?.[varName];
      if (val !== undefined && val !== null) {
        values[varName] = String(val);
        matchedSet.add(varName);
      } else {
        values[varName] = '';
      }
    });

    return {
      id: `jsonl-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      name: caseName,
      variableValues: values,
      status: 'idle',
    };
  });

  return {
    cases,
    matchedVars: Array.from(matchedSet),
    totalRows: cases.length,
  };
}

/**
 * 导出测试评测矩阵为 JSONL 格式
 */
export function exportBatchEvalToJsonl(
  cases: DatasetCaseItem[],
  variableNames: string[]
): string {
  return cases
    .map((c) => {
      const record = {
        name: c.name,
        status: c.status,
        ttftMs: c.ttftMs,
        totalMs: c.totalMs,
        variables: c.variableValues,
        output: c.output || '',
        error: c.error,
        judgeScore: c.judgeScore,
        judgeReason: c.judgeReason,
        judgeStatus: c.judgeStatus,
      };
      return JSON.stringify(record);
    })
    .join('\n');
}

/**
 * AI 裁判打分标准 (Rubric)
 */
export interface JudgeRubric {
  id: string;
  name: string;
  description: string;
  passThreshold: number; // 及格门槛分，默认 3.5 分
  criteria: string[];
}

export const DEFAULT_JUDGE_RUBRICS: JudgeRubric[] = [
  {
    id: 'general-quality',
    name: '工业级综合质量门禁',
    description: '严格检查指令遵从度、事实准确性、格式规范性与有无废话幻觉',
    passThreshold: 3.5,
    criteria: [
      '1. 指令遵从度 (40%): 是否严格执行了提示词要求的所有任务与边界约束',
      '2. 内容质量与严谨度 (30%): 表达精准，无事实性捏造、幻觉或逻辑自相矛盾',
      '3. 输出格式规整度 (20%): 严格符合要求的格式规范（如 JSON/Markdown/纯文本），无多余闲聊套话',
      '4. 鲁棒与边界承接 (10%): 对特殊字符、极端长文本或异常输入表现稳健',
    ],
  },
  {
    id: 'strict-json',
    name: '严格 JSON / Schema 校验门禁',
    description: '要求输出必须为可被 JSON.parse 解析的标准格式，无额外 Markdown 前后缀',
    passThreshold: 4.0,
    criteria: [
      '1. 语法合法性 (50%): 严格为有效 JSON，无 Markdown 围栏或前后缀多余文本',
      '2. 字段完整性 (30%): 包含提示词要求的所有 Key',
      '3. 类型严谨性 (20%): 对应字段值类型符合规范',
    ],
  },
];

/**
 * 构造裁判模型的评估 Prompt
 */
export function generateJudgePrompt(
  promptTemplate: string,
  variables: Record<string, string>,
  actualOutput: string,
  rubric: JudgeRubric = DEFAULT_JUDGE_RUBRICS[0]
): string {
  const varsSummary = Object.entries(variables)
    .map(([k, v]) => `  - ${k}: "${v}"`)
    .join('\n') || '  (无动态入参)';

  return `你是一名极其苛刻、客观、公正的 AI 提示词质量质检首席裁判官（LLM-as-a-Judge）。
你的职责是评判目标大模型针对特定提示词与入参变量生成的实际结果是否达到工业级生产标准。

【被评测的提示词模板/规范】：
${promptTemplate}

【本次测试用例的入参变量】：
${varsSummary}

【大模型生成的实际输出结果】：
${actualOutput || '（模型无任何输出，严重异常）'}

【本次质量门禁判定标准 (${rubric.name})】：
${rubric.criteria.join('\n')}
及格门槛分：${rubric.passThreshold} 分（满分 5.0 分）。

【你的评审输出要求】：
请根据打分标准进行严谨审查，并**仅严格输出**如下 JSON 格式，绝不允许包含任何 Markdown 格式包裹或外部多余客套话：
{
  "score": 4.5,
  "pass": true,
  "reason": "简明扼要的一句话裁定评语，指出优点或扣分核心原因（控制在 60 字以内）"
}
注意：
- score 为 1.0 至 5.0 之间的数值（支持一位小数）
- pass 为布尔值，score >= ${rubric.passThreshold} 时为 true，否则为 false
- 严禁打太极或给出模糊分，务必依据标准苛刻判定！`;
}

/**
 * 解析裁判模型的 JSON 裁定回复
 */
export function parseJudgeResponse(responseText: string, threshold = 3.5): { score: number; pass: boolean; reason: string } {
  if (!responseText || !responseText.trim()) {
    return { score: 1.0, pass: false, reason: '裁判模型未给出有效响应' };
  }

  // 尝试匹配 JSON
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const rawScore = Number(parsed.score);
      const score = !isNaN(rawScore) ? Math.min(Math.max(Number(rawScore.toFixed(1)), 1.0), 5.0) : 3.0;
      const pass = typeof parsed.pass === 'boolean' ? parsed.pass : score >= threshold;
      const reason = String(parsed.reason || '已完成自动化质量审查').slice(0, 100);
      return { score, pass, reason };
    }
  } catch {}

  // 正则兜底解析
  const scoreMatch = responseText.match(/["']?score["']?\s*:\s*([0-5](\.\d+)?)/i);
  const score = scoreMatch ? parseFloat(scoreMatch[1]) : 3.0;
  return {
    score,
    pass: score >= threshold,
    reason: responseText.slice(0, 80).replace(/[{}\n\r"]/g, '').trim() || '已完成自动化裁判打分',
  };
}

/**
 * 汇总统计评测矩阵的 AI 裁判指标看板
 */
export function calculateJudgeMetrics(cases: DatasetCaseItem[]): {
  totalJudged: number;
  averageScore: number;
  passCount: number;
  failCount: number;
  passRate: number;
} {
  const judged = cases.filter((c) => typeof c.judgeScore === 'number');
  if (judged.length === 0) {
    return {
      totalJudged: 0,
      averageScore: 0,
      passCount: 0,
      failCount: 0,
      passRate: 0,
    };
  }

  const sumScore = judged.reduce((acc, c) => acc + (c.judgeScore || 0), 0);
  const avg = Number((sumScore / judged.length).toFixed(1));
  const passCount = judged.filter((c) => c.judgeStatus === 'pass').length;
  const failCount = judged.length - passCount;
  const passRate = Math.round((passCount / judged.length) * 100);

  return {
    totalJudged: judged.length,
    averageScore: avg,
    passCount,
    failCount,
    passRate,
  };
}


