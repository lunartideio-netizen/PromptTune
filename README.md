# PromptTune 🪄

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-v0.2.0-emerald.svg)
![Tauri](https://img.shields.io/badge/Tauri-v2.0-24C8D8.svg?logo=tauri&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB.svg?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6.svg?logo=typescript&logoColor=white)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)

**现代化的 AI 提示词工程与调优工作台 (AI Prompt Engineering & Tuning Studio)**  
*专为大模型开发人员、Prompt 架构师与 AI 探索者打造的轻量级、零数据泄露桌面端应用。*

[✨ 核心特性](#-核心特性-features) • [🚀 快速上手](#-快速上手指南-getting-started) • [🛠️ 技术栈](#️-技术栈清单-tech-stack) • [🗺️ 演进路线图](#️-版本迭代日志-changelog) • [📄 开源协议](#-开源协议-license)

</div>

---

## 🌟 为什么选择 PromptTune？

在复杂大模型应用开发中，提示词（Prompt）早已不是一段简单的文本，而是软件工程的核心资产。然而，传统文本编辑器或网页端对话界面面临诸多痛点：
- **缺乏结构化标准**：提示词缺少清晰的角色、工作流、负向红线等工程化架构约束；
- **难以直观追溯演化链路**：提示词的继承关系、版本派生如同黑盒，缺乏拓扑关系图；
- **Token 冗余与隐性成本**：冗长且未经压缩的 Prompt 持续消耗数倍的 API 费用与首字延迟；
- **提示词资产孤岛**：难以像代码一样被版本控制（Git）管理，无法在工程项目中直接复用；
- **数据隐私隐患**：核心商业业务提示词暴露给第三方 Web 工具，存在严重数据泄露风险。

**PromptTune** 彻底解决以上痛点，提供**纯本地离线优先 (Local-First)**、**专业工程化**的一体化桌面工作台。

---

## ✨ 核心特性 (Features)

### 🧠 1. 多框架结构化优化演进器
- **工业级提示词框架原生集成**：内置 `CO-STAR`、`CRISPE`、`Few-Shot & CoT`、`Role-Task-Format`、`Strict JSON`、`自由深度精修` 等主流框架，支持一键自适应重构。
- **开放自定义框架**：支持根据企业与团队业务规范，自由设计并持久化自定义工程结构框架。
- **模板变量智能提取**：实时自动识别 Prompt 中的 `{{variable}}` 占位符，支持一键同步提取与批量测试注入。

### 🌐 2. 提示词演进拓扑图谱 (Prompt DAG Graph)
- **可视化链路图谱**：深度解析提示词之间的父子继承、引用链路与技能（Skills）依赖，生成交互式 DAG 拓扑图。
- **环路检测与安全告警**：内置强健的 Tarjan / DFS 拓扑环路检测算法，防止提示词死循环嵌套。
- **层级自动分层与节点聚焦**：清晰洞察提示词从基础 System Prompt 到上层业务 Prompt 的派生演化过程。

### 🩺 3. 提示词健康体检与反模式静态审计 (Prompt Linter)
- **安全与反注入规则审计**：静态检测 Prompt Injection 隐患、转义字符漏洞与红线规避漏洞。
- **质量与清晰度体检**：自动扫描模糊指令、逻辑冲突、缺少负向红线约束等反模式。
- **一键智能修复**：针对体检发现的问题项，提供自动化建议并支持一键精准采纳。

### ⚡ 4. 启发式 Token 智能瘦身压缩机 (Token Compressor)
- **极速语义无损压缩**：运用启发式语义修剪算法，在保留 95%+ 核心语义的前提下，压缩去除 30%~60% 的冗余 Token。
- **降低延迟与 API 成本**：大幅减少输入上下文大小，立竿见影缩短模型首字延迟（TTFT），显著削减 Token 账单。

### 🔬 5. 横向双轨 A/B 实验对比台 (A/B Playground)
- **同屏多模型/多版本对决**：自由配置两套模型或两组提示词版本进行横向对抗评测。
- **量化效能监测**：实时比对输出质量、Token 消耗量、生成耗时与推理稳定性。

### 📊 6. 批量数据集矩阵评测与 LLM-as-a-Judge (Batch Matrix)
- **多变量排列组合并发运行**：支持导入包含多组测试用例的 CSV / JSON 数据集进行批量并发测试。
- **AI 智能质量判定裁判**：内置 LLM-as-a-Judge 自动对每一组输出的准确性、结构完整度与安全性打分，生成评估报告。

### 📦 7. 跨项目 Git 双向同步 (Prompt as Code)
- **工程化版本控制**：支持一键导出包含标准 YAML FrontMatter 结构头信息的 `.prompt.md` 提示词工程文件。
- **双向无缝流转**：可在 Git 仓库中像维护代码一样提交、Diff 与 Code Review 提示词资产，并支持快速双向导入。

### ⚡ 8. 桌面原生级极速体验与 macOS 液态微动效
- **快捷模型切换器 (Quick Model Switcher)**：底栏一键呼出，实时自动从当前 API 端点拉取真实在线模型，即选即存（Zero-Click Save）。
- **全局 Spotlight 命令面板 (Command Palette)**：全局 `Cmd + K` / `Ctrl + K` 秒级唤起，支持快速模糊搜索提示词、视图切换与快捷指令。
- **自由分栏拖拽与状态保持**：左右工作台分栏比例支持毫秒级流体拖拽，自动记忆保存。
- **原生极速与零数据泄露**：基于 Tauri v2 + Rust 架构，所有提示词数据 100% 留存在本地 IndexedDB 沙箱中，绝不上传第三方服务器。

---

## 🛠️ 技术栈清单 (Tech Stack)

| 领域 | 核心技术 / 库 | 版本 | 价值说明 |
| :--- | :--- | :--- | :--- |
| **桌面框架** | [Tauri v2](https://v2.tauri.app/) + Rust | `2.11+` | 超轻量原生跨平台架构，极低内存占用与系统级 API 支持 |
| **前端框架** | [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) | `19.0` / `5.x` | 现代并发架构、无损类型自检与工业级工程质量 |
| **构建工具** | [Vite 6](https://vitejs.dev/) | `6.4+` | 秒级极速冷启动与生产级摇树优化（Tree-shaking） |
| **动效系统** | [@formkit/auto-animate](https://auto-animate.formkit.com/) + Tailwind | `0.10+` | Apple 官方级减速缓动曲线 (`apple-ease`) 与平滑布局流体动画 |
| **状态管理** | [Zustand](https://github.com/pmndrs/zustand) | `5.0+` | 极致轻量响应式状态机，支持复杂拓扑计算与全局订阅 |
| **数据持久化** | [Dexie.js](https://dexie.org/) (IndexedDB) | `4.0+` | 纯本地嵌入式离线数据库，零云端隐私风险 |
| **测试框架** | [Vitest](https://vitest.dev/) | `5.0+` | 96+ 单元测试端到端覆盖，保障核心算法严密无误 |

---

## 🚀 快速上手指南 (Getting Started)

### 环境要求
- **Node.js** >= 18.0.0
- **pnpm** >= 8.0.0 (推荐)
- **Rust & Cargo** >= 1.77.0 (仅桌面端本地编译需要；纯 Web 体验无需 Rust)

### 1. 克隆代码仓库并安装依赖
```bash
git clone https://github.com/lunartideio-netizen/PromptTune.git
cd PromptTune
pnpm install
```

### 2. 本地开发调试
```bash
# 启动 Web 纯前端热重载服务 (http://localhost:5173)
pnpm dev

# 启动桌面端原生调试窗口 (Tauri Dev)
pnpm tauri dev
```

### 3. 运行自动化测试套件
```bash
# 运行全部 96+ 核心单元测试用例
pnpm test
```

### 4. 生产打包分发
```bash
# 编译前端生产静态资源
pnpm build

# 构建 macOS 桌面端正式安装包 (.dmg 与 .app)
pnpm tauri build --bundles app,dmg

# 构建 Windows 安装程序 (.exe / .msi)
pnpm tauri build --bundles nsis,msi
```

构建生成的 macOS 安装包位于：  
`src-tauri/target/release/bundle/dmg/PromptTune_0.2.0_aarch64.dmg`

---

## ⌨️ 常用桌面快捷键 (Shortcuts)

| 快捷键 | 功能说明 |
| :--- | :--- |
| `Cmd + K` / `Ctrl + K` | 唤起全局 Spotlight 快速命令面板 / 全文检索 |
| `Cmd + Enter` / `Ctrl + Enter` | 立即触发提示词重新优化 |
| `Cmd + S` / `Ctrl + S` | 快速保存 / 归档当前提示词草稿快照 |
| `Esc` | 关闭当前弹出的模态框、浮窗或命令面板 |

---

## 🗺️ 版本迭代日志 (Changelog)

### v0.2.0 (2026-10-15) — 重大版本飞跃
- **[新增]** 全局 Spotlight 快速命令面板（`Cmd + K`），支持快速切换视图与提示词跳转；
- **[新增]** 提示词演进拓扑图谱（Prompt DAG Graph），可视化解析依赖与继承拓扑；
- **[新增]** 提示词静态健康体检与反模式审计（Prompt Linter & Security Audit）；
- **[新增]** 启发式 Token 智能瘦身压缩机，立竿见影缩减 30%~60% 冗余 Token；
- **[新增]** 跨项目 Git 双向同步引擎（Prompt as Code），支持标准 `.prompt.md`；
- **[新增]** 批量数据集矩阵评测与 LLM-as-a-Judge 自动化质量裁判；
- **[新增]** 底栏快速模型切换浮窗（Quick Model Switcher），支持真实端点在线探测与即选即存；
- **[体验]** 全面引入 Apple 减速缓动曲线 (`apple-ease`) 与流体分栏拖拽；
- **[优化]** 修复模型选择持久化断层，彻底清除未连接端点时的假模型混淆。

### v0.1.0 (初始发布)
- 基础提示词结构化优化、多模型 A/B 对比与本地 Dexie IndexedDB 存储支持。

---

## 📄 开源协议 (License)

本项目基于 [MIT License](LICENSE) 协议开源。欢迎提交 Issue 与 Pull Request！
