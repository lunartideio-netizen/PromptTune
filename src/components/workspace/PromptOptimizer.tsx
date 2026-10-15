import React, { useCallback } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { PromptWorkspaceCore } from './PromptWorkspaceCore';
import { Sparkles } from 'lucide-react';

export const PromptOptimizer: React.FC = () => {
  const { 
    activePromptId, 
    prompts, 
    updatePrompt, 
    addPromptVersion, 
    addOptimizationTurn,
    getInheritedContextForPrompt,
  } = useAppStore();

  const currentPrompt = prompts.find((p) => p.id === activePromptId);

  const handleDraftChange = useCallback((newDraft: string) => {
    if (!currentPrompt) return;
    updatePrompt(currentPrompt.id, { originalDraft: newDraft });
  }, [currentPrompt?.id, updatePrompt]);

  const handleOptimizedChange = useCallback((newOptimized: string) => {
    if (!currentPrompt) return;
    updatePrompt(currentPrompt.id, { currentOptimized: newOptimized });
  }, [currentPrompt?.id, updatePrompt]);

  const handleFrameworkChange = useCallback((framework: any) => {
    if (!currentPrompt) return;
    updatePrompt(currentPrompt.id, { framework });
  }, [currentPrompt?.id, updatePrompt]);

  const handleSaveVersion = useCallback(async (version: any) => {
    if (!currentPrompt) return;
    await addPromptVersion(currentPrompt.id, version);
  }, [currentPrompt?.id, addPromptVersion]);

  const handleAddTurn = useCallback(async (turn: any) => {
    if (!currentPrompt) return;
    await addOptimizationTurn(currentPrompt.id, turn);
  }, [currentPrompt?.id, addOptimizationTurn]);

  const handleUpdateVariables = useCallback(async (variables: any) => {
    if (!currentPrompt) return;
    await updatePrompt(currentPrompt.id, { variables });
  }, [currentPrompt?.id, updatePrompt]);

  const handleAutoTitle = useCallback((title: string) => {
    if (!currentPrompt) return;
    updatePrompt(currentPrompt.id, { title });
  }, [currentPrompt?.id, updatePrompt]);

  if (!currentPrompt) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-mac-textMuted">
        <Sparkles size={36} strokeWidth={1.5} className="text-mac-textMuted/40 mb-3" />
        <p className="text-xs">请在左侧选择一个提示词，或点击顶部新建按钮开始。</p>
      </div>
    );
  }

  const { combinedSystemContext, combinedDomainRules } = getInheritedContextForPrompt(currentPrompt.id);

  return (
    <PromptWorkspaceCore
      mode="prompt"
      promptId={currentPrompt.id}
      title={currentPrompt.title}
      initialDraft={currentPrompt.originalDraft || ''}
      initialOptimized={currentPrompt.currentOptimized || ''}
      initialFramework={currentPrompt.framework || 'CO-STAR'}
      variables={currentPrompt.variables || []}
      versions={currentPrompt.versions || []}
      turns={currentPrompt.turns || []}
      systemContext={combinedSystemContext}
      domainRules={combinedDomainRules}
      onDraftChange={handleDraftChange}
      onOptimizedChange={handleOptimizedChange}
      onFrameworkChange={handleFrameworkChange}
      onSaveVersion={handleSaveVersion}
      onAddTurn={handleAddTurn}
      onUpdateVariables={handleUpdateVariables}
      onAutoTitle={handleAutoTitle}
    />
  );
};

export default PromptOptimizer;
