import { readCodingChecklist, type CodingChecklist } from './coding-checklist';

export type WorkStatus = 'pending' | 'in_progress' | 'done' | 'blocked';
export interface AgentWorkItem { id: string; title: string; kind: 'research' | 'analysis' | 'deliver'; status: WorkStatus; summary?: string; evidence?: 'sources' | 'file_proposal' | 'self_reported' }
export type WorkActivityKind = 'web_search' | 'forum_search' | 'read_files' | 'save_file' | 'review_html' | 'load_skill' | 'plan' | 'calculate' | 'lookup';
export type WorkActivityStatus = 'running' | 'done' | 'failed' | 'waiting_approval' | 'blocked' | 'uncertain' | 'cancelled';
export interface AgentWork { version: 'agent-work-v1'; runId: string; revision: string;
  plan?: { version: 'agent-task-plan-v1'; revision: number; readyForAnswer: boolean; summary?: string; items: AgentWorkItem[] };
  activities: Array<{ id: string; sequence: number; kind: WorkActivityKind; status: WorkActivityStatus; startedAt: string; finishedAt?: string }>;
  codingChecklist?: CodingChecklist }
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const text = (value: unknown, max: number): value is string => typeof value === 'string' && !!value.trim() && value.length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
const date = (value: unknown): value is string => typeof value === 'string' && value.length <= 40 && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));
const kinds: WorkActivityKind[] = ['web_search', 'forum_search', 'read_files', 'save_file', 'review_html', 'load_skill', 'plan', 'calculate', 'lookup'];
const states: WorkActivityStatus[] = ['running', 'done', 'failed', 'waiting_approval', 'blocked', 'uncertain', 'cancelled'];

/** Project only the public work contract; never retain tool inputs, output or model reasoning. */
export function readAgentWork(value: unknown, expectedRunId?: string): AgentWork | undefined {
  if (!object(value) || value.version !== 'agent-work-v1' || !uuid(value.runId) || expectedRunId !== undefined && value.runId !== expectedRunId ||
      typeof value.revision !== 'string' || !/^[a-f\d]{64}$/.test(value.revision) || !Array.isArray(value.activities) || value.activities.length > 12) return undefined;
  const seen = new Set<string>();
  const activities: AgentWork['activities'] = [];
  for (const item of value.activities) {
    if (!object(item) || !uuid(item.id) || seen.has(item.id) || !integer(item.sequence) || !kinds.includes(item.kind) || !states.includes(item.status) ||
        !date(item.startedAt) || item.finishedAt !== undefined && (!date(item.finishedAt) || Date.parse(item.finishedAt) < Date.parse(item.startedAt))) return undefined;
    seen.add(item.id);
    activities.push({ id: item.id, sequence: item.sequence, kind: item.kind, status: item.status, startedAt: item.startedAt,
      ...(item.finishedAt ? { finishedAt: item.finishedAt } : {}) });
  }
  const result: AgentWork = { version: 'agent-work-v1', runId: value.runId, revision: value.revision, activities: activities.sort((a, b) => a.sequence - b.sequence) };
  if (value.codingChecklist !== undefined && value.codingChecklist !== null) {
    try { result.codingChecklist = readCodingChecklist(value.codingChecklist, value.runId); } catch { return undefined; }
  }
  // Strict coding evidence and generic model plans must not become two competing checklists.
  if (!result.codingChecklist && value.plan !== undefined && value.plan !== null) {
    const plan = value.plan;
    if (!object(plan) || plan.version !== 'agent-task-plan-v1' || !integer(plan.revision) ||
        plan.readyForAnswer !== undefined && typeof plan.readyForAnswer !== 'boolean' || plan.summary !== undefined && !text(plan.summary, 160) || !Array.isArray(plan.items) || plan.items.length < 2 || plan.items.length > 8) return undefined;
    const ids = new Set<string>(), items: AgentWorkItem[] = [];
    for (const item of plan.items) {
      if (!object(item) || !text(item.id, 40) || ids.has(item.id) || !text(item.title, 90) || !['research', 'analysis', 'deliver'].includes(item.kind) ||
          !['pending', 'in_progress', 'done', 'blocked'].includes(item.status) || item.summary !== undefined && !text(item.summary, 160) ||
          item.evidence !== undefined && !['sources', 'file_proposal', 'self_reported'].includes(item.evidence)) return undefined;
      ids.add(item.id); items.push({ id: item.id, title: item.title, kind: item.kind, status: item.status,
        ...(item.summary ? { summary: item.summary } : {}), ...(item.evidence ? { evidence: item.evidence } : {}) });
    }
    result.plan = { version: 'agent-task-plan-v1', revision: plan.revision, readyForAnswer: plan.readyForAnswer === true,
      ...(plan.summary ? { summary: plan.summary } : {}), items };
  }
  return result;
}

export const workActivityLabels: Record<WorkActivityKind, string> = {
  web_search: '搜索网页', forum_search: '查询社区', read_files: '读取附件', save_file: '保存文件', review_html: '检查页面',
  load_skill: '读取技能', plan: '更新计划', calculate: '计算', lookup: '检查信息',
};
export const workStatusLabels: Record<WorkActivityStatus | WorkStatus, string> = {
  pending: '未开始', in_progress: '进行中', running: '进行中', done: '已完成', failed: '失败', waiting_approval: '待确认',
  blocked: '受阻', uncertain: '待核实', cancelled: '已停止',
};

export function currentWorkAction(work: AgentWork | undefined): string | undefined {
  const activities = work?.activities.filter(item => item.status === 'running' || item.status === 'waiting_approval') || [];
  const active = activities[activities.length - 1];
  if (!active) return undefined;
  return active.status === 'waiting_approval' ? '等待你的确认' : '正在' + workActivityLabels[active.kind];
}
