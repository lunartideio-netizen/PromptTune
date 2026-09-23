# PromptTune 🪄

> **现代化的 AI 提示词工程与调优工作台 (AI Prompt Engineering & Tuning Studio)**  
> 专为大模型开发人员、Prompt 架构师与 AI 探索者打造的轻量级、零数据泄露桌面端应用。

---

## ✨ 核心特性 (Features)

- 🧠 **多维度提示词演化优化器**：支持角色设定、工作流规划、负向红线、动态变量（`{{variable}}`）智能提取与自适应补全。
- ⚡ **原生跨平台极速引擎**：基于 **Tauri v2 + Rust** 构筑，打包体积小于 10MB，冷启动毫秒级响应，内存占用极低。
- 🌐 **全协议模型生态适配**：
  - 本地模型直连：无缝接入本地代理（如 OpenCodeX / 端口 10100）、Ollama、LM Studio、vLLM。
  - 主流商用 API：完美兼容 OpenAI、Claude 3.5/3.7、DeepSeek-V3/R1（双轨思维链感知）、Gemini 2.5/3.0 等。
  - 原生 Rust HTTP 栈：彻底免疫浏览器的同源 CORS 限制与 Mixed Content 阻断。
- 🎙️ **Whisper 云端高精度语音输入**：一键开启录音，实时音波可视化反馈，自动转换为高精度文本注入提示词。
- 🔬 **A/B 效果对比实验室**：同屏双栏多模型输出对决，实时评估 Token 吞吐与首字延迟（TTFT）。
- 📜 **不可逆历史快照与版本回滚**：提示词每一次优化均自动生成版本快照，支持任意历史阶段快速对比与安全回滚。
- 🛡️ **100% 本地数据隐私安全**：基于浏览器与桌面沙箱原生的 **Dexie (IndexedDB)** 存储，全量数据绝不上传云端，支持一键备份与恢复 JSON。

---

## 🛠️ 技术栈清单 (Tech Stack)

| 领域 | 核心技术 / 库 | 说明 |
| :--- | :--- | :--- |
| **桌面框架** | [Tauri v2](https://v2.tauri.app/) + Rust | 原生跨平台壳层（macOS WKWebView / Windows WebView2） |
| **前端框架** | [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) | 最新 React 架构与端到端类型安全 |
| **构建工具** | [Vite 6](https://vitejs.dev/) | 极速热重载与模块打包 |
| **样式系统** | [Tailwind CSS](https://tailwindcss.com/) + Lucide Icons | 仿 macOS 拟物与极简现代暗/亮色风格 |
| **状态管理** | [Zustand](https://github.com/pmndrs/zustand) | 高性能轻量响应式状态机 |
| **数据持久化** | [Dexie.js](https://dexie.org/) (IndexedDB) | 纯本地嵌入式结构化数据库 |

---

## 🚀 快速上手指南 (Getting Started)

### 环境要求
- **Node.js** >= 18.0.0
- **pnpm** >= 8.0.0 (推荐) 或 npm / yarn
- **Rust & Cargo** >= 1.77.0 (仅桌面端开发与打包构建需要，纯 Web 预览无需 Rust)

### 1. 安装依赖
```bash
git clone https://github.com/{{your-username}}/PromptTune.git
cd PromptTune
pnpm install
```

### 2. 本地开发调试
```bash
# 启动 Web 纯前端热更新服务
pnpm dev

# 启动桌面端原生调试窗口 (Tauri Dev)
pnpm tauri dev
```

### 3. 打包分发生产安装包
```bash
# 仅打包 Web 生产静态产物
pnpm build

# 打包 macOS 桌面应用 (.dmg 与 .app)
pnpm tauri build --bundles app,dmg

# 打包 Windows 安装程序 (.exe / .msi) - 建议通过 GitHub Actions 构建
pnpm tauri build --bundles nsis,msi
```

---

## 📦 版本说明 (Version)

- **当前版本**：`v0.1.0`
- **构建输出产物**：
  - macOS: `src-tauri/target/release/bundle/dmg/PromptTune_0.1.0_aarch64.dmg`
  - Windows: 经由 GitHub Actions CI/CD 流水线自动生成。

---

## 📄 开源协议 (License)

本项目基于 [MIT License](LICENSE) 开源。
