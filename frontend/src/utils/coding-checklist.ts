export type CodingChecklistStatus = 'pending' | 'in_progress' | 'done' | 'blocked';
export interface CodingChecklistItem {
  id: string;
  title: string;
  kind: string;
  status: CodingChecklistStatus;
  note?: string;
  verificationKind?: string;
  paths?: string[];
}
export interface CodingChecklist { items: CodingChecklistItem[]; runId?: string; updatedAt?: string }

/** Checklists are reported action state, never synthesized from a finished chat run. */
export function readCodingChecklist(value: unknown, expectedRunId?: string): CodingChecklist | undefined {
  if (value === null || value === undefined) return undefined;
  const input = value as any;
  if (!input || typeof input !== 'object' || !Array.isArray(input.items) || input.items.length > 20) throw Error('清单格式无效');
  if (input.version !== undefined && input.version !== 'coding-checklist-v1' || input.runId !== undefined &&
    (typeof input.runId !== 'string' || !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(input.runId) ||
      expectedRunId !== undefined && input.runId !== expectedRunId)) throw Error('清单版本无效');
  const ids = new Set<string>();
  const items = input.items.map((item: any): CodingChecklistItem => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id || item.id.length > 64 || ids.has(item.id) ||
      typeof item.title !== 'string' || !item.title.trim() || item.title.length > 180 ||
      typeof item.kind !== 'string' || !item.kind || item.kind.length > 40 ||
      !['pending', 'in_progress', 'done', 'blocked'].includes(item.status)) throw Error('清单格式无效');
    ids.add(item.id);
    const optional = (key: 'note' | 'verificationKind', max: number) => {
      if (item[key] === undefined) return {};
      if (typeof item[key] !== 'string' || item[key].length > max) throw Error('清单格式无效');
      return { [key]: item[key] };
    };
    const evidenceKind = item.evidence?.kind ?? item.verificationKind;
    const verificationKind = ['file_read', 'file_proposal', 'syntax_check', 'visual_review', 'self_reported'].includes(evidenceKind) ? evidenceKind : undefined;
    if (item.kind === 'verify' && item.status === 'done' && !['syntax_check', 'visual_review'].includes(verificationKind || ''))
      throw Error('清单验证依据无效');
    let paths: string[] | undefined;
    const sourcePaths = item.evidence?.paths ?? item.paths;
    if (item.kind === 'verify' && item.status === 'done' && sourcePaths !== undefined) {
      const supplied = sourcePaths;
      if (!Array.isArray(supplied) || supplied.length > 10 || supplied.some(path => typeof path !== 'string' || path.length > 180 ||
        !/\.[a-z0-9]{1,12}$/i.test(path) || /[\\:\x00-\x1f\x7f]/.test(path) ||
        path.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.')))) throw Error('清单来源格式无效');
      paths = [...new Set(supplied)] as string[];
    }
    if (item.kind === 'verify' && item.status === 'done' && !paths?.length) throw Error('清单验证来源缺失');
    return { id: item.id, title: item.title, kind: item.kind, status: item.status, ...optional('note', 800),
      ...(verificationKind ? { verificationKind } : {}), ...(paths?.length ? { paths } : {}) };
  });
  return { items, ...(input.runId ? { runId: input.runId } : {}),
    ...(typeof input.updatedAt === 'string' && input.updatedAt.length <= 40 && Number.isFinite(Date.parse(input.updatedAt)) ? { updatedAt: input.updatedAt } : {}) };
}
