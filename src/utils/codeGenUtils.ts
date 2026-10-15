/**
 * codeGenUtils.ts
 * 一键将提示词与入参变量编译导出为不同工程语言的生产级调用代码 (FEAT-3)
 */

import { PromptVariable } from '../types';

export type CodeExportLanguage = 'python' | 'typescript' | 'langchain' | 'curl' | 'promptfoo';

interface CodeGenOptions {
  title: string;
  systemContext?: string;
  promptText: string;
  variables: PromptVariable[];
  model?: string;
  baseUrl?: string;
  temperature?: number;
}

export function generateExportCode(
  lang: CodeExportLanguage,
  options: CodeGenOptions
): string {
  const {
    title,
    systemContext = '',
    promptText,
    variables,
    model = 'gpt-4o',
    baseUrl = 'https://api.openai.com/v1',
    temperature = 0.7,
  } = options;

  const cleanTitle = title.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
  const varNames = variables.map((v) => v.name);

  switch (lang) {
    case 'python': {
      const varsDict = varNames.length > 0
        ? `    variables = {\n${varNames.map((name) => `        "${name}": "示例_${name}"`).join(',\n')}\n    }`
        : '    variables = {}';

      return `# -*- coding: utf-8 -*-
"""
PromptTune 导出工程代码: ${title}
模型: ${model} | 导出时间: ${new Date().toISOString()}
"""
import os
from openai import OpenAI

client = OpenAI(
    base_url=os.getenv("OPENAI_BASE_URL", "${baseUrl}"),
    api_key=os.getenv("OPENAI_API_KEY", "your-api-key-here")
)

SYSTEM_CONTEXT = """${systemContext.replace(/"""/g, '\\"\\"\\"')}"""

PROMPT_TEMPLATE = """${promptText.replace(/"""/g, '\\"\\"\\"')}"""

def run_${cleanTitle}(variables: dict) -> str:
    rendered_prompt = PROMPT_TEMPLATE
    for key, value in variables.items():
        rendered_prompt = rendered_prompt.replace(f"{{{{{key}}}}}", str(value))

    messages = []
    if SYSTEM_CONTEXT.strip():
        messages.append({"role": "system", "content": SYSTEM_CONTEXT})
    messages.append({"role": "user", "content": rendered_prompt})

    response = client.chat.completions.create(
        model="${model}",
        messages=messages,
        temperature=${temperature},
    )
    return response.choices[0].message.content or ""

if __name__ == "__main__":
${varsDict}
    result = run_${cleanTitle}(variables)
    print(result)
`;
    }

    case 'typescript': {
      const varsObj = varNames.length > 0
        ? `  const variables: Record<string, string> = {\n${varNames.map((name) => `    "${name}": "示例_${name}"`).join(',\n')}\n  };`
        : '  const variables: Record<string, string> = {};';

      return `/**
 * PromptTune 导出工程代码: ${title}
 * 模型: ${model} | 导出时间: ${new Date().toISOString()}
 */
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: process.env.OPENAI_BASE_URL || '${baseUrl}',
  apiKey: process.env.OPENAI_API_KEY || 'your-api-key-here',
});

const SYSTEM_CONTEXT = ${JSON.stringify(systemContext)};
const PROMPT_TEMPLATE = ${JSON.stringify(promptText)};

export async function execute${cleanTitle}(variables: Record<string, string>): Promise<string> {
  let rendered = PROMPT_TEMPLATE;
  for (const [key, val] of Object.entries(variables)) {
    rendered = rendered.replaceAll(\`{{\${key}}}\`, val);
  }

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (SYSTEM_CONTEXT.trim()) {
    messages.push({ role: 'system', content: SYSTEM_CONTEXT });
  }
  messages.push({ role: 'user', content: rendered });

  const completion = await openai.chat.completions.create({
    model: '${model}',
    messages,
    temperature: ${temperature},
  });

  return completion.choices[0]?.message?.content || '';
}

// 快速运行示范:
async function main() {
${varsObj}
  const result = await execute${cleanTitle}(variables);
  console.log(result);
}

// main();
`;
    }

    case 'langchain': {
      // LangChain 将 {{var}} 转换为 {var}
      const langchainPrompt = promptText.replace(/\{\{\s*([a-zA-Z0-9_\u4e00-\u9fa5]+)\s*\}\}/g, '{$1}');

      return `# -*- coding: utf-8 -*-
"""
PromptTune 导出 LangChain 链式调用代码: ${title}
模型: ${model}
"""
import os
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

llm = ChatOpenAI(
    model="${model}",
    base_url=os.getenv("OPENAI_BASE_URL", "${baseUrl}"),
    api_key=os.getenv("OPENAI_API_KEY", "your-api-key-here"),
    temperature=${temperature},
)

prompt = ChatPromptTemplate.from_messages([
    ("system", """${systemContext.replace(/"""/g, '\\"\\"\\"')}"""),
    ("human", """${langchainPrompt.replace(/"""/g, '\\"\\"\\"')}""")
])

chain = prompt | llm | StrOutputParser()

if __name__ == "__main__":
    test_inputs = {
${varNames.map((name) => `        "${name}": "示例_${name}"`).join(',\n')}
    }
    result = chain.invoke(test_inputs)
    print(result)
`;
    }

    case 'curl': {
      // 变量填充示范
      let samplePrompt = promptText;
      for (const v of variables) {
        samplePrompt = samplePrompt.replaceAll(`{{${v.name}}}`, v.currentValue || v.defaultValue || `[${v.name}]`);
      }

      const payload = {
        model,
        messages: [
          ...(systemContext.trim() ? [{ role: 'system', content: systemContext }] : []),
          { role: 'user', content: samplePrompt },
        ],
        temperature,
      };

      return `curl ${baseUrl.replace(/\/+$/, '')}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer \${OPENAI_API_KEY}" \\
  -d '${JSON.stringify(payload, null, 2).replace(/'/g, "'\\''")}'
`;
    }

    case 'promptfoo': {
      // 辅助缩进生成 YAML 多行文本
      const indent = (text: string, spaces: number) => {
        const pad = ' '.repeat(spaces);
        return text.split('\n').map((line) => (line.trim() ? `${pad}${line}` : '')).join('\n');
      };

      const cleanPromptBody = promptText.trim();
      const promptCombined = systemContext.trim()
        ? `[系统指令/System]\n${systemContext.trim()}\n\n[用户输入/User]\n${cleanPromptBody}`
        : cleanPromptBody;

      // 生成测试用例
      let testsSection = '';
      if (variables.length > 0) {
        // 用例 1: 标称基准值
        const baseVars = variables.map((v) => `      ${v.name}: "${(v.currentValue || v.defaultValue || `测试_${v.name}`).replace(/"/g, '\\"')}"`).join('\n');
        // 用例 2: 边界/长度测试
        const boundaryVars = variables.map((v) => `      ${v.name}: "边界用例_${v.name}_超长内容或者特殊字符!@#$"`).join('\n');

        testsSection = `tests:
  - description: "标称输入基准测试"
    vars:
${baseVars}
    assert:
      - type: not-empty
      - type: latency
        threshold: 8000 # 响应延迟门禁 <= 8s

  - description: "边界与特殊字符鲁棒性测试"
    vars:
${boundaryVars}
    assert:
      - type: not-icontains
        value: "undefined"
      - type: not-icontains
        value: "Internal Error"
`;
      } else {
        testsSection = `tests:
  - description: "无入参静态提示词基准质量回归"
    assert:
      - type: not-empty
      - type: latency
        threshold: 8000
`;
      }

      return `# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
# PromptTune 导出 CI/CD 提示词自动化评估套件: ${title}
# 导出时间: ${new Date().toISOString()}
#
# 【本地一键运行】:
#   export OPENAI_API_KEY="your-api-key"
#   npx promptfoo@latest eval -c promptfooconfig.yaml
#
# 【查看交互式评估报表】:
#   npx promptfoo@latest view

description: "${title} 提示词工程质量门禁与回归评估"

prompts:
  - |
${indent(promptCombined, 4)}

providers:
  - id: openai:chat:${model}
    config:
      apiBaseUrl: "${baseUrl}"
      apiKeyEnvar: OPENAI_API_KEY
      temperature: ${temperature}

defaultTest:
  options:
    transform: output.trim()
  assert:
    - type: cost
      threshold: 0.05 # 单次评估成本上限 ($0.05)

${testsSection}
`;
    }
  }
}
