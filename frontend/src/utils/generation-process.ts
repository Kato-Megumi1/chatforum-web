// Public progress is telemetry, not model reasoning. Never forward server-supplied
// labels, descriptions, tool arguments or model text into this presentation model.
const phaseDefinitions = {
  queued: '等待开始',
  context: '整理上下文',
  understanding: '理解问题',
  retrieving: '检索原文',
  evidence: '整理依据',
  generating: '生成回答',
  tools: '处理任务',
  verifying: '核对依据',
  delivering: '输出回答',
  completed: '已完成',
} as const;

export type PublicGenerationPhase = keyof typeof phaseDefinitions;
const legacyPhases: Record<string, PublicGenerationPhase> = {
  preparing: 'context', generating: 'generating', tools: 'tools', verifying: 'verifying', completed: 'completed',
};
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const duration = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : null;
const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const phaseKey = (value: unknown): PublicGenerationPhase | undefined =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(phaseDefinitions, value) ? value as PublicGenerationPhase : undefined;
const legacyKey = (value: unknown): PublicGenerationPhase | undefined =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(legacyPhases, value) ? legacyPhases[value] : undefined;

export interface GenerationProcessPhase {
  phase: PublicGenerationPhase;
  label: string;
  durationMs: number | null;
  modelCalls: number | null;
  active: boolean;
}

export function generationProcessView(input: unknown, pending: boolean, extensionMs = 0) {
  const source = record(input);
  const elapsed = duration(source?.elapsedMs);
  const phase = elapsed !== null ? phaseKey(source?.phase) || legacyKey(source?.stage) : undefined;
  const hasProgress = phase !== undefined;
  // A terminal snapshot never advances, even if a delayed pending flag is still true.
  const extra = hasProgress && phase !== 'completed' ? duration(extensionMs) ?? 0 : 0;
  const elapsedMs = hasProgress ? Math.min(Number.MAX_SAFE_INTEGER, elapsed! + extra) : null;
  const firstToken = duration(source?.firstTokenMs);
  const firstTokenMs = hasProgress && firstToken !== null && firstToken <= elapsedMs! ? firstToken : null;
  const rows = Array.isArray(source?.phases) ? source.phases : Array.isArray(source?.stages) ? source.stages : [];
  const phases: GenerationProcessPhase[] = [];
  const seen = new Set<PublicGenerationPhase>();
  if (hasProgress) for (const item of rows.slice(0, 40)) {
    const row = record(item);
    const key = phaseKey(row?.phase) || legacyKey(row?.stage);
    const ms = duration(row?.durationMs);
    if (!key || key === 'completed' || ms === null || seen.has(key)) continue;
    seen.add(key);
    phases.push({ phase: key, label: phaseDefinitions[key],
      durationMs: Math.min(Number.MAX_SAFE_INTEGER, ms + (key === phase ? extra : 0)),
      modelCalls: count(row?.modelCalls), active: pending && key === phase });
  }
  if (phase && phase !== 'completed' && !seen.has(phase)) {
    const phaseMs = duration(source?.phaseElapsedMs);
    phases.push({ phase, label: phaseDefinitions[phase],
      durationMs: phaseMs === null ? null : Math.min(Number.MAX_SAFE_INTEGER, phaseMs + extra),
      modelCalls: null, active: pending });
  }
  return {
    hasProgress, phase, elapsedMs, firstTokenMs, phases,
    label: pending ? phase ? phaseDefinitions[phase] : '等待中' : '已结束',
    modelCalls: hasProgress ? count(source?.modelCalls) : null,
    activeModelCalls: hasProgress && pending && phase !== 'completed' ? count(source?.activeModelCalls) : null,
    queueMs: hasProgress ? duration(source?.queueMs) : null,
  };
}

export function generationSeconds(ms: number): string {
  return ((duration(ms) ?? 0) / 1000).toFixed(1);
}
