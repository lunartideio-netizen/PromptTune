export type FrameworkType = 
  | 'CO-STAR'
  | 'CRISPE'
  | 'FEW_SHOT_COT'
  | 'ROLE_TASK_FORMAT'
  | 'STRICT_JSON'
  | 'FREEFORM';

export interface Folder {
  id: string;
  parentId: string | null;
  name: string;
  icon?: string;
  systemContext: string;
  domainRules: string;
  inheritParent: boolean;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface PromptVersion {
  version: number;
  promptText: string;
  instruction?: string;
  framework: FrameworkType;
  timestamp: number;
  tokenCount: number;
  qualityScore?: {
    clarity: number;
    completeness: number;
    structure: number;
  };
}

export interface OptimizationTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  refinedPrompt?: string;
  rationale?: string;
  timestamp: number;
  tokenCount?: number;
}

export interface PromptVariable {
  name: string;
  description?: string;
  defaultValue?: string;
  currentValue: string;
}

export interface PromptItem {
  id: string;
  folderId: string | null;
  title: string;
  originalDraft: string;
  currentOptimized: string;
  framework: FrameworkType;
  variables: PromptVariable[];
  versions: PromptVersion[];
  turns: OptimizationTurn[];
  tags?: string[];
  createdAt: number;
  updatedAt: number;
}

export type ProviderType = 
  | 'openai'
  | 'deepseek'
  | 'moonshot'
  | 'ollama'
  | 'groq'
  | 'siliconflow'
  | 'openrouter'
  | 'custom';

export interface APIConfig {
  provider: ProviderType;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  useMockFallback: boolean; // if true or if no key, provides rich offline mock stream
}

export interface ProviderPreset {
  id: ProviderType;
  name: string;
  baseUrl: string;
  defaultModel: string;
  availableModels: string[];
  docUrl: string;
  description: string;
}

export interface StreamTelemetry {
  startTime: number;
  firstTokenTime: number | null;
  endTime: number | null;
  ttftMs: number;
  totalMs: number;
  tokenCount: number;
  tokPerSec: number;
  content: string;
  isDone: boolean;
  error?: string;
}

export interface ABPlaygroundState {
  status: 'idle' | 'running' | 'completed' | 'error';
  sideA: StreamTelemetry;
  sideB: StreamTelemetry;
}

export interface FolderContextAncestor {
  folderId: string;
  folderName: string;
  systemContext: string;
  domainRules: string;
}

export interface PromptReferenceInfo {
  title: string;
  isResolved: boolean;
  promptId?: string;
  resolvedSnippet?: string;
}

export interface SkillHunterResult {
  id: string;
  title: string;
  dimension?: string;
  repoName: string;
  repoUrl: string;
  stars?: number;
  techStack?: string[];
  description: string;
  rawContent: string;
  distilledPrompt: string;
  framework: FrameworkType;
  tags: string[];
  systemPersona: string;
  workflow: string;
  guardrails: string;
  variables: string[];
}

export type SkillCategory = 
  | 'all'
  | 'coding'      // 编程架构
  | 'design'      // 设计审美
  | 'business'    // 商业分析
  | 'copywriting' // 文案创意
  | 'security';   // 安全运维

export interface SkillItem {
  id: string;
  title: string;
  dimension?: string;
  category: SkillCategory;
  framework: FrameworkType;
  description: string;
  systemPersona: string;
  workflow: string;
  guardrails: string;
  variables: string[];
  distilledPrompt: string;
  techStack?: string[];
  sourceRepo?: string;
  sourceStars?: number;
  createdAt: number;
  updatedAt: number;
}


