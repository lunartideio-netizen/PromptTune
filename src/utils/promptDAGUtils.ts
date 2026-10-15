/**
 * promptDAGUtils.ts
 * 提示词工程模块化拓扑依赖图计算引擎 (FEAT-DAG)
 * 解析跨提示词引用 {{@名称}} 与父子链条 parentPromptId，构建有向无环图 (DAG) 并分配层级网格坐标
 */

import { PromptItem, SkillItem } from '../types';
import { extractPromptReferences } from '../services/llmService';

export interface DAGNode {
  id: string;
  title: string;
  type: 'prompt' | 'skill';
  framework?: string;
  inDegree: number;
  outDegree: number;
  layer: number; // 拓扑深度层级 (0, 1, 2...)
  x: number;
  y: number;
  isCyclic?: boolean;
  folderId?: string | null;
  snippet?: string;
}

export interface DAGEdge {
  id: string;
  from: string;
  to: string;
  type: 'reference' | 'chain'; // 引用语法 {{@}} 或 父子多步链路
  label?: string;
  isCyclic?: boolean;
}

export interface DAGGraph {
  nodes: DAGNode[];
  edges: DAGEdge[];
  hasCycle: boolean;
  cycleNodes: string[];
  maxLayer: number;
  isolatedCount: number;
}

/**
 * 构建提示词工程全量模块依赖拓扑图
 */
export function buildPromptDAG(
  prompts: PromptItem[],
  skills: SkillItem[] = []
): DAGGraph {
  const nodesMap = new Map<string, DAGNode>();
  const edges: DAGEdge[] = [];
  const edgeSet = new Set<string>();

  // 1. 初始化提示词节点
  prompts.forEach((p) => {
    nodesMap.set(p.id, {
      id: p.id,
      title: p.title || '未命名提示词',
      type: 'prompt',
      framework: p.framework,
      inDegree: 0,
      outDegree: 0,
      layer: 0,
      x: 0,
      y: 0,
      folderId: p.folderId,
      snippet: (p.currentOptimized || p.originalDraft || '').slice(0, 80),
    });
  });

  // 快速映射 title -> id (不区分大小写)
  const titleToIdMap = new Map<string, string>();
  prompts.forEach((p) => {
    titleToIdMap.set(p.title.trim().toLowerCase(), p.id);
  });
  const skillTitleToIdMap = new Map<string, SkillItem>();
  skills.forEach((s) => {
    skillTitleToIdMap.set(s.title.trim().toLowerCase(), s);
  });

  // 2. 扫描父子提示词链路关系 (Chaining)
  prompts.forEach((p) => {
    if (p.parentPromptId && nodesMap.has(p.parentPromptId)) {
      const edgeKey = `chain:${p.parentPromptId}->${p.id}`;
      if (!edgeSet.has(edgeKey)) {
        edgeSet.add(edgeKey);
        edges.push({
          id: edgeKey,
          from: p.parentPromptId,
          to: p.id,
          type: 'chain',
          label: '上游链路协同',
        });
      }
    }
  });

  // 3. 扫描正文与草稿中的跨模块语法引用 {{@名称}}
  prompts.forEach((p) => {
    const fullText = (p.originalDraft || '') + '\n' + (p.currentOptimized || '');
    const refs = extractPromptReferences(fullText);

    refs.forEach((refTitle) => {
      const cleanRef = refTitle.trim().toLowerCase();
      // 命中项目提示词
      const targetPromptId = titleToIdMap.get(cleanRef);
      if (targetPromptId) {
        // 注意：p 引用了 targetPrompt，说明数据流动为 targetPrompt -> p
        const edgeKey = `ref:${targetPromptId}->${p.id}`;
        if (!edgeSet.has(edgeKey)) {
          edgeSet.add(edgeKey);
          edges.push({
            id: edgeKey,
            from: targetPromptId,
            to: p.id,
            type: 'reference',
            label: `{{@${refTitle}}}`,
          });
        }
      } else {
        // 检查是否命中已装配技能
        const targetSkill = skillTitleToIdMap.get(cleanRef);
        if (targetSkill) {
          const skillNodeId = `skill-${targetSkill.id}`;
          if (!nodesMap.has(skillNodeId)) {
            nodesMap.set(skillNodeId, {
              id: skillNodeId,
              title: targetSkill.title,
              type: 'skill',
              inDegree: 0,
              outDegree: 0,
              layer: 0,
              x: 0,
              y: 0,
              snippet: (targetSkill.distilledPrompt || targetSkill.systemPersona || '').slice(0, 80),
            });
          }
          const edgeKey = `ref:${skillNodeId}->${p.id}`;
          if (!edgeSet.has(edgeKey)) {
            edgeSet.add(edgeKey);
            edges.push({
              id: edgeKey,
              from: skillNodeId,
              to: p.id,
              type: 'reference',
              label: `{{@${refTitle}}}`,
            });
          }
        }
      }
    });
  });

  // 4. 计算入度与出度
  edges.forEach((edge) => {
    const fromNode = nodesMap.get(edge.from);
    const toNode = nodesMap.get(edge.to);
    if (fromNode) fromNode.outDegree++;
    if (toNode) toNode.inDegree++;
  });

  // 5. 拓扑排序与分层 (Layer Assignment) + 环路检测 (Tarjan / DFS)
  const adj = new Map<string, string[]>();
  nodesMap.forEach((_, id) => adj.set(id, []));
  edges.forEach((e) => adj.get(e.from)?.push(e.to));

  const visitedState = new Map<string, number>(); // 0: unvisited, 1: visiting, 2: visited
  const cycleNodeSet = new Set<string>();

  function dfsDetectCycle(u: string, path: string[]) {
    visitedState.set(u, 1);
    const neighbors = adj.get(u) || [];
    for (const v of neighbors) {
      if (visitedState.get(v) === 1) {
        // 发现环路
        const cycleStartIndex = path.indexOf(v);
        if (cycleStartIndex !== -1) {
          path.slice(cycleStartIndex).forEach((nodeId) => cycleNodeSet.add(nodeId));
        }
        cycleNodeSet.add(v);
      } else if (!visitedState.get(v)) {
        dfsDetectCycle(v, [...path, v]);
      }
    }
    visitedState.set(u, 2);
  }

  nodesMap.forEach((_, id) => {
    if (!visitedState.get(id)) {
      dfsDetectCycle(id, [id]);
    }
  });

  // 标记环路节点与边
  edges.forEach((e) => {
    if (cycleNodeSet.has(e.from) && cycleNodeSet.has(e.to)) {
      e.isCyclic = true;
    }
  });
  nodesMap.forEach((node) => {
    if (cycleNodeSet.has(node.id)) {
      node.isCyclic = true;
    }
  });

  // 计算分层 (入度为 0 的节点层级为 0，依次向下递增)
  const inDegreeMap = new Map<string, number>();
  nodesMap.forEach((node, id) => inDegreeMap.set(id, node.inDegree));

  // 简单 Kahn 分层 (遇环防御最大 10 层)
  let currentLayer = 0;
  let remaining = new Set(nodesMap.keys());
  let maxLayer = 0;

  while (remaining.size > 0 && currentLayer < 10) {
    const layerNodes: string[] = [];
    remaining.forEach((id) => {
      const deg = inDegreeMap.get(id) || 0;
      if (deg === 0 || cycleNodeSet.has(id)) {
        layerNodes.push(id);
      }
    });

    if (layerNodes.length === 0) {
      // 存在未破除环，将剩余节点全部放入当前层
      remaining.forEach((id) => {
        const node = nodesMap.get(id);
        if (node) node.layer = currentLayer;
      });
      break;
    }

    layerNodes.forEach((id) => {
      remaining.delete(id);
      const node = nodesMap.get(id);
      if (node) node.layer = currentLayer;

      // 递减下游节点的入度
      (adj.get(id) || []).forEach((nextId) => {
        const currDeg = inDegreeMap.get(nextId) || 0;
        if (currDeg > 0) inDegreeMap.set(nextId, currDeg - 1);
      });
    });

    maxLayer = currentLayer;
    currentLayer++;
  }

  // 6. 为每个节点分配 2D 画布网格坐标 (x, y)
  const layerBuckets: Map<number, DAGNode[]> = new Map();
  nodesMap.forEach((node) => {
    if (!layerBuckets.has(node.layer)) layerBuckets.set(node.layer, []);
    layerBuckets.get(node.layer)?.push(node);
  });

  const NODE_WIDTH = 220;
  const NODE_HEIGHT = 80;
  const GAP_X = 140;
  const GAP_Y = 36;

  layerBuckets.forEach((bucket, layer) => {
    const totalHeight = bucket.length * NODE_HEIGHT + (bucket.length - 1) * GAP_Y;
    const startY = 60;

    bucket.forEach((node, idx) => {
      node.x = 60 + layer * (NODE_WIDTH + GAP_X);
      node.y = startY + idx * (NODE_HEIGHT + GAP_Y);
    });
  });

  const allNodes = Array.from(nodesMap.values());
  const isolatedCount = allNodes.filter((n) => n.inDegree === 0 && n.outDegree === 0).length;

  return {
    nodes: allNodes,
    edges,
    hasCycle: cycleNodeSet.size > 0,
    cycleNodes: Array.from(cycleNodeSet),
    maxLayer,
    isolatedCount,
  };
}
