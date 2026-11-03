export interface CodingSkillInfo {
  name: string;
  title: string;
  description: string;
  hash: string;
  sourceUrl: string;
  license: string;
  version: string;
}

/** Only metadata is a browser contract. Skill instructions remain server-side. */
export function readCodingSkillCatalog(value: unknown): CodingSkillInfo[] {
  if (!Array.isArray(value) || value.length > 32) throw Error('技能列表格式无效');
  const names = new Set<string>();
  return value.map(item => {
    if (!item || typeof item !== 'object' || typeof item.name !== 'string' || item.name.length > 64 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.name) || names.has(item.name) ||
      typeof item.hash !== 'string' || !/^[a-f0-9]{64}$/.test(item.hash)) throw Error('技能列表格式无效');
    const text = (key: string, max: number) => {
      const result = item[key];
      if (typeof result !== 'string' || !result.trim() || result.length > max) throw Error('技能列表格式无效');
      return result;
    };
    const sourceUrl = text('sourceUrl', 600);
    try {
      const source = new URL(sourceUrl);
      if (source.protocol !== 'https:' || source.hostname !== 'github.com' || source.username || source.password || source.port) throw Error();
    } catch { throw Error('技能来源链接无效'); }
    names.add(item.name);
    return { name: item.name, title: text('title', 80), description: text('description', 1200), hash: item.hash,
      sourceUrl, license: text('license', 128), version: text('version', 80) };
  });
}
