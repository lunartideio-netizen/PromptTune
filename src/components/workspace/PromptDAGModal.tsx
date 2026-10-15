import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Network, 
  X, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowRight, 
  Layers, 
  Sparkles, 
  Code2, 
  CornerDownRight, 
  ExternalLink,
  Info,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { buildPromptDAG, DAGNode, DAGEdge } from '../../utils/promptDAGUtils';

interface PromptDAGModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PromptDAGModal: React.FC<PromptDAGModalProps> = ({ isOpen, onClose }) => {
  const { prompts, skills, setActivePromptId, setIsScratchpadActive, setActiveTab, showToast } = useAppStore();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const containerRef = useRef<HTMLDivElement>(null);

  // 构建拓扑图数据
  const dag = useMemo(() => buildPromptDAG(prompts, skills), [prompts, skills]);

  const selectedNode = useMemo(
    () => dag.nodes.find((n) => n.id === selectedNodeId) || null,
    [dag.nodes, selectedNodeId]
  );

  // 依赖此节点的下游
  const downstreamEdges = useMemo(
    () => (selectedNode ? dag.edges.filter((e) => e.from === selectedNode.id) : []),
    [dag.edges, selectedNode]
  );

  // 此节点依赖的上游
  const upstreamEdges = useMemo(
    () => (selectedNode ? dag.edges.filter((e) => e.to === selectedNode.id) : []),
    [dag.edges, selectedNode]
  );

  // 支持 Escape 键关闭
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleNavigateToPrompt = (promptId: string) => {
    setActivePromptId(promptId);
    setIsScratchpadActive(false);
    setActiveTab('optimize');
    showToast('已聚焦并切换至目标模块', 'info');
    onClose();
  };

  const NODE_WIDTH = 220;
  const NODE_HEIGHT = 80;

  // 画布尺寸动态推算
  const canvasWidth = Math.max(...dag.nodes.map((n) => n.x + NODE_WIDTH + 140), 800);
  const canvasHeight = Math.max(...dag.nodes.map((n) => n.y + NODE_HEIGHT + 140), 600);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/60 backdrop-blur-sm animate-fade-in select-none"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-6xl h-[88vh] bg-mac-surface dark:bg-[#151518] border border-mac-border dark:border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-mac-border dark:border-white/10 flex items-center justify-between shrink-0 bg-mac-canvas/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-mac-accentBlue/10 border border-mac-accentBlue/25 text-mac-accentBlue flex items-center justify-center shadow-2xs">
              <Network size={17} strokeWidth={2} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-mac-textPrimary dark:text-zinc-100">
                  工程模块依赖拓扑图谱 (Prompt Chaining DAG)
                </h3>
                {dag.hasCycle ? (
                  <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 animate-pulse">
                    <AlertTriangle size={11} />
                    <span>检测到循环引用死锁风险</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                    <CheckCircle2 size={11} />
                    <span>架构拓扑无环 · 链路健康</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-mac-textSecondary dark:text-zinc-400">
                直观解构全局工程的模块依赖网络、上游链路继承与技能装配流向
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 缩放控制器 */}
            <div className="flex items-center rounded-xl border border-mac-border dark:border-white/10 bg-white/50 dark:bg-zinc-800/60 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.6, z - 0.1))}
                className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg text-mac-textSecondary"
                title="缩小画布"
              >
                <ZoomOut size={13} />
              </button>
              <span className="px-2 font-mono text-[11px] text-mac-textPrimary">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}
                className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg text-mac-textSecondary"
                title="放大画布"
              >
                <ZoomIn size={13} />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg text-mac-textSecondary ml-0.5"
                title="重置缩放"
              >
                <RotateCcw size={11} />
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-mac-textSecondary hover:text-mac-textPrimary hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 顶部指标统计栏 */}
        <div className="px-5 py-2.5 bg-black/[0.02] dark:bg-white/[0.02] border-b border-mac-border/60 dark:border-white/10 flex items-center justify-between text-xs shrink-0 flex-wrap gap-3 font-mono">
          <div className="flex items-center gap-4">
            <span className="text-mac-textSecondary">
              总节点: <b className="text-mac-textPrimary">{dag.nodes.length}</b> 个
            </span>
            <span className="text-mac-textSecondary">
              装配依赖关系: <b className="text-mac-accentBlue">{dag.edges.length}</b> 条
            </span>
            <span className="text-mac-textSecondary">
              最大链路深度: <b className="text-purple-600 dark:text-purple-400">{dag.maxLayer + 1}</b> 级
            </span>
            {dag.isolatedCount > 0 && (
              <span className="text-mac-textMuted text-[11px]">
                (包含 {dag.isolatedCount} 个独立单体提示词)
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-[11px]">
            <div className="flex items-center gap-1.5 text-mac-textSecondary">
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-500/30 border border-blue-500" />
              <span>项目提示词</span>
            </div>
            <div className="flex items-center gap-1.5 text-mac-textSecondary">
              <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500/30 border border-indigo-500" />
              <span>已装配技能</span>
            </div>
            <div className="flex items-center gap-1.5 text-mac-textSecondary">
              <span className="w-3 h-0.5 bg-blue-500 inline-block" />
              <span>引用/父子关系</span>
            </div>
          </div>
        </div>

        {/* 画布与侧边详情容器 */}
        <div className="flex-1 min-h-0 flex overflow-hidden relative">
          {/* SVG 矢量有向无环拓扑画布 */}
          <div 
            ref={containerRef}
            className="flex-1 overflow-auto bg-[radial-gradient(#d1d5db_1px,transparent_1px)] dark:bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:20px_20px] p-6 relative cursor-grab active:cursor-grabbing"
          >
            {dag.nodes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-24 select-none">
                <div className="w-12 h-12 rounded-2xl bg-mac-accentBlue/10 text-mac-accentBlue flex items-center justify-center mb-3">
                  <Network size={24} />
                </div>
                <h4 className="text-sm font-bold text-mac-textPrimary dark:text-zinc-200">
                  当前工作区暂无提示词或模块依赖
                </h4>
                <p className="text-xs text-mac-textSecondary dark:text-zinc-400 mt-1 max-w-sm">
                  请在左侧目录新建提示词，并在提示词中使用 {'{{@模块名称}}'} 即可自动构建依赖拓扑图谱。
                </p>
              </div>
            ) : (
            <div 
              style={{ 
                width: canvasWidth, 
                height: canvasHeight,
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
                transition: 'transform 0.15s ease-out'
              }} 
              className="relative"
            >
              <svg 
                className="absolute inset-0 pointer-events-none" 
                width={canvasWidth} 
                height={canvasHeight}
              >
                <defs>
                  <marker
                    id="dag-arrow"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#3b82f6" opacity="0.8" />
                  </marker>
                  <marker
                    id="dag-arrow-cycle"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#ef4444" opacity="0.9" />
                  </marker>
                </defs>

                {/* 绘制贝塞尔曲线连线 */}
                {dag.edges.map((edge) => {
                  const fromNode = dag.nodes.find((n) => n.id === edge.from);
                  const toNode = dag.nodes.find((n) => n.id === edge.to);
                  if (!fromNode || !toNode) return null;

                  const startX = fromNode.x + NODE_WIDTH;
                  const startY = fromNode.y + NODE_HEIGHT / 2;
                  const endX = toNode.x;
                  const endY = toNode.y + NODE_HEIGHT / 2;

                  // 控制点计算
                  const deltaX = Math.max(Math.abs(endX - startX) * 0.5, 40);
                  const cp1X = startX + deltaX;
                  const cp1Y = startY;
                  const cp2X = endX - deltaX;
                  const cp2Y = endY;

                  const isSelected = selectedNode && (selectedNode.id === edge.from || selectedNode.id === edge.to);

                  return (
                    <g key={edge.id}>
                      <path
                        d={`M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`}
                        fill="none"
                        stroke={edge.isCyclic ? '#ef4444' : isSelected ? '#3b82f6' : '#94a3b8'}
                        strokeWidth={edge.isCyclic ? 2.5 : isSelected ? 2.2 : 1.5}
                        strokeDasharray={edge.type === 'chain' ? '4 3' : undefined}
                        strokeOpacity={isSelected ? 1 : 0.6}
                        markerEnd={edge.isCyclic ? 'url(#dag-arrow-cycle)' : 'url(#dag-arrow)'}
                        className="transition-all duration-200"
                      />
                      {edge.label && (
                        <text
                          x={(startX + endX) / 2}
                          y={(startY + endY) / 2 - 6}
                          fill={edge.isCyclic ? '#ef4444' : '#64748b'}
                          fontSize="10"
                          textAnchor="middle"
                          className="font-mono select-none"
                        >
                          {edge.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>

              {/* 渲染节点卡片 */}
              {dag.nodes.map((node) => {
                const isSelected = selectedNodeId === node.id;
                const isSkill = node.type === 'skill';

                return (
                  <div
                    key={node.id}
                    onClick={() => setSelectedNodeId(node.id)}
                    style={{
                      left: node.x,
                      top: node.y,
                      width: NODE_WIDTH,
                      height: NODE_HEIGHT,
                    }}
                    className={`absolute p-2.5 rounded-xl border backdrop-blur-md transition-all duration-200 cursor-pointer shadow-xs flex flex-col justify-between ${
                      node.isCyclic
                        ? 'border-rose-500 bg-rose-50/90 dark:bg-rose-950/40 ring-2 ring-rose-500/40'
                        : isSelected
                        ? 'border-mac-accentBlue bg-white dark:bg-zinc-800 ring-2 ring-mac-accentBlue/40 shadow-mac-glow-blue'
                        : isSkill
                        ? 'border-indigo-500/40 bg-indigo-50/80 dark:bg-indigo-950/30 hover:border-indigo-500/60'
                        : 'border-mac-border dark:border-white/10 bg-white/95 dark:bg-zinc-900/95 hover:border-mac-accentBlue/60 hover:shadow-md'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isSkill ? (
                          <Sparkles size={13} className="text-indigo-500 shrink-0" />
                        ) : (
                          <Code2 size={13} className="text-mac-accentBlue shrink-0" />
                        )}
                        <span className="text-xs font-bold text-mac-textPrimary dark:text-zinc-100 truncate font-sans">
                          {node.title}
                        </span>
                      </div>
                      {node.framework && (
                        <span className="text-[9px] px-1 py-0.2 rounded font-mono bg-black/5 dark:bg-white/10 text-mac-textMuted shrink-0">
                          {node.framework}
                        </span>
                      )}
                    </div>

                    <p className="text-[10px] text-mac-textMuted truncate font-sans">
                      {node.snippet || (isSkill ? '已装配系统技能' : '暂无正文内容')}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-mac-textMuted pt-1 border-t border-black/5 dark:border-white/5 font-mono">
                      <span>入度: {node.inDegree} (被引用)</span>
                      <span>出度: {node.outDegree}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </div>

          {/* 选中节点详情侧边抽屉 */}
          {selectedNode && (
            <div className="w-80 border-l border-mac-border dark:border-white/10 bg-mac-surface dark:bg-[#18181b] p-4 flex flex-col justify-between shrink-0 overflow-y-auto animate-in slide-in-from-right duration-200">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-mac-textMuted">
                    模块架构详情
                  </span>
                  <button
                    onClick={() => setSelectedNodeId(null)}
                    className="p-1 text-mac-textMuted hover:text-mac-textPrimary rounded-md cursor-pointer"
                  >
                    <X size={13} />
                  </button>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-mac-textPrimary dark:text-zinc-100 flex items-center gap-1.5">
                    <span>{selectedNode.title}</span>
                    {selectedNode.type === 'skill' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-500 font-medium">
                        技能模块
                      </span>
                    )}
                  </h4>
                  <p className="text-[11px] text-mac-textMuted font-mono mt-1">
                    拓扑层级: 第 {selectedNode.layer + 1} 级 · ID: {selectedNode.id}
                  </p>
                </div>

                {/* 依赖与被依赖关系 */}
                <div className="space-y-2 text-xs">
                  <span className="text-[11px] font-semibold text-mac-textSecondary">
                    上游依赖模块 (当前模块调用了谁):
                  </span>
                  {upstreamEdges.length > 0 ? (
                    <div className="space-y-1">
                      {upstreamEdges.map((e) => {
                        const fromNode = dag.nodes.find((n) => n.id === e.from);
                        return (
                          <div 
                            key={e.id}
                            className="p-1.5 rounded-lg bg-black/[0.02] dark:bg-white/[0.04] border border-mac-border/60 dark:border-white/10 flex items-center justify-between"
                          >
                            <span className="font-medium text-mac-textPrimary truncate">{fromNode?.title}</span>
                            <span className="text-[10px] font-mono text-mac-accentBlue">{e.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-[11px] text-mac-textMuted italic p-1 bg-black/[0.01] rounded">
                      无上游依赖（基础输入节点）
                    </div>
                  )}
                </div>

                <div className="space-y-2 text-xs">
                  <span className="text-[11px] font-semibold text-mac-textSecondary">
                    下游承接模块 (谁调用了当前模块):
                  </span>
                  {downstreamEdges.length > 0 ? (
                    <div className="space-y-1">
                      {downstreamEdges.map((e) => {
                        const toNode = dag.nodes.find((n) => n.id === e.to);
                        return (
                          <div 
                            key={e.id}
                            className="p-1.5 rounded-lg bg-black/[0.02] dark:bg-white/[0.04] border border-mac-border/60 dark:border-white/10 flex items-center justify-between"
                          >
                            <span className="font-medium text-mac-textPrimary truncate">{toNode?.title}</span>
                            <span className="text-[10px] font-mono text-mac-accentPurple">{e.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-[11px] text-mac-textMuted italic p-1 bg-black/[0.01] rounded">
                      无下游调用（终端执行节点）
                    </div>
                  )}
                </div>

                {selectedNode.snippet && (
                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-mac-textSecondary">正文内容提要:</span>
                    <div className="p-2.5 rounded-xl bg-mac-canvas dark:bg-black/30 border border-mac-border/60 dark:border-white/10 text-xs text-mac-textPrimary font-mono leading-relaxed max-h-32 overflow-y-auto whitespace-pre-wrap">
                      {selectedNode.snippet}...
                    </div>
                  </div>
                )}
              </div>

              {/* 底部跳转按钮 */}
              {selectedNode.type === 'prompt' && (
                <button
                  type="button"
                  onClick={() => handleNavigateToPrompt(selectedNode.id)}
                  className="w-full mt-4 py-2 px-3 rounded-xl bg-mac-accentBlue hover:brightness-105 active:scale-98 text-white text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ExternalLink size={13} />
                  <span>一键跳转并编辑此模块</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
