const { test } = require('node:test'), assert = require('node:assert/strict');
const { readFileSync } = require('node:fs'), { join } = require('node:path'), ts = require('typescript');
const vue = require('vue'), pinia = require('pinia');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function loadFile(path, dependencies = {}) {
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', 'localStorage', 'sessionStorage', 'crypto', compile(readFileSync(join(__dirname, '../src/' + path), 'utf8')))(
    mod, mod.exports, name => {
      if (!Object.hasOwn(dependencies, name)) throw Error('Unexpected import ' + name); return dependencies[name];
    }, { getItem: () => null, setItem() {}, removeItem() {} }, { getItem: () => null, setItem() {}, removeItem() {} }, require('node:crypto').webcrypto);
  return mod.exports;
}
const defaults = loadFile('utils/roleplay-defaults.ts'), catalogPolicy = loadFile('utils/coding-skills.ts');
const checklistPolicy = loadFile('utils/coding-checklist.ts');
const workPolicy = loadFile('utils/agent-work.ts', { './coding-checklist': checklistPolicy });
const skill = (name = 'frontend-design') => ({ name, title: '前端设计', description: '制作具有清晰层次的界面。', hash: 'a'.repeat(64),
  sourceUrl: `https://github.com/anthropics/skills/blob/${'b'.repeat(40)}/skills/${name}/SKILL.md`, license: 'Apache-2.0', version: '1.0.0' });

test('catalog accepts only bounded public metadata and never keeps instructions or unsafe source links', () => {
  const parsed = catalogPolicy.readCodingSkillCatalog([{ ...skill(), instructions: 'SECRET BODY', command: 'UNSAFE' }]);
  assert.deepEqual(parsed, [skill()]); assert(!JSON.stringify(parsed).includes('SECRET'));
  for (const invalid of [null, {}, Array(33).fill(skill()), [skill(), skill()], [{ ...skill(), name: '../read' }],
    [{ ...skill(), hash: 'old' }], [{ ...skill(), sourceUrl: 'javascript:alert(1)' }],
    [{ ...skill(), sourceUrl: 'https://github.com.attacker.invalid/skills' }], [{ ...skill(), sourceUrl: 'https://user:secret@github.com/skills' }]])
    assert.throws(() => catalogPolicy.readCodingSkillCatalog(invalid));
});

test('auto, custom and off serialize only workflow IDs, separately from tool permissions', () => {
  const options = { codingEnabled: true };
  assert.deepEqual(defaults.conversationCodingSkills(options, 'ASSISTANT', ['code_workspace']), { codingAgent: true });
  assert.deepEqual(defaults.conversationCodingSkills({ ...options, codingSkillMode: 'off' }, 'ASSISTANT', ['code_workspace']), { codingAgent: true, codingSkills: [] });
  assert.deepEqual(defaults.conversationCodingSkills({ ...options, codingSkillMode: 'custom', codingSkillNames: ['frontend-design', 'webapp-testing', 'frontend-design'] },
    'ASSISTANT', ['code_workspace']), { codingAgent: true, codingSkills: ['frontend-design', 'webapp-testing'] });
  for (const names of [undefined, {}, ['../escape'], ['load_coding_skill'], ['x'.repeat(65)], Array(13).fill('frontend-design')])
    assert.deepEqual(defaults.conversationCodingSkills({ ...options, codingSkillMode: 'custom', codingSkillNames: names }, 'ASSISTANT', ['code_workspace']), { codingAgent: true, codingSkills: [] });
  for (const type of ['ROLEPLAY', 'LEGACY', 'UNKNOWN'])
    assert.deepEqual(defaults.conversationCodingSkills({ ...options, codingSkillMode: 'custom', codingSkillNames: ['frontend-design'] }, type, ['code_workspace']), {});
  assert.deepEqual(defaults.conversationCodingSkills({ ...options, codingSkillMode: 'off' }, 'ASSISTANT', []), {});
  assert.deepEqual(defaults.conversationCodingSkills({ codingEnabled: false, codingSkillMode: 'off' }, 'ASSISTANT', ['code_workspace']), {});
  assert.deepEqual(defaults.conversationCodingSkills({ ...options, codingSkillMode: 'off' }, 'ASSISTANT', ['code_workspace'], true), {});
});

function storeFixture(options={}) {
  const sent = [], conversation = { id: 11, userId: 7, title: 'Synthetic', conversationType: 'ASSISTANT', personaKey: 'assistant' };
  let get = async () => [];
  const request = { get: (...args) => get(...args), async post(path, body) {
    if (path === '/chat/runs') { sent.push(body); return { id: options.runId || 'synthetic-run' }; } return conversation;
  }, async delete() {} };
  let watchRun = async () => ({ status: 'COMPLETED', result: { content: 'Synthetic answer', ragMetadata: {} } });
  const module = loadFile('stores/chat.ts', { pinia, vue, '@/utils/request': { default: request },
    '@/utils/chat-stream': { watchChatRun: (...args) => watchRun(...args) },
    '@/utils/local-workspace': { disconnectLocalWorkspace() {} }, '@/utils/chat-navigation': loadFile('utils/chat-navigation.ts'),
    '@/utils/chat-files': { chatFileRef: file => ({ id: file.id, kind: file.kind, revision: file.revision }) },
    '@/utils/chat-model-selection': { selectedChatModel: () => 'qwen3.8-max' }, '@/utils/roleplay-defaults': defaults,
    '@/utils/file-resume': loadFile('utils/file-resume.ts'), '@/utils/coding-checklist': checklistPolicy, '@/utils/agent-work': workPolicy });
  pinia.setActivePinia(pinia.createPinia()); const store = module.useChatStore(); store.currentConversation = conversation;
  return { store, sent, conversation, watch(handler) { watchRun = handler; }, read(handler) { get = handler; } };
}

test('real request body carries selected IDs while remaining account/conversation scoped', async () => {
  const f = storeFixture();
  f.store.saveConversationSettings(11, { codingEnabled: true, codingSkillMode: 'auto' });
  await f.store.sendConfigured('Explain a function', 'agent', ['code_workspace']);
  assert(!Object.hasOwn(f.sent[0], 'codingSkills')); assert.equal(f.sent[0].codingAgent, true);
  f.store.saveConversationSettings(11, { codingSkillMode: 'custom', codingSkillNames: ['frontend-design'] });
  await f.store.sendConfigured('Build a page', 'agent', ['code_workspace']);
  assert.deepEqual(f.sent[1].codingSkills, ['frontend-design']); assert.deepEqual(f.sent[1].enabledSkills, ['code_workspace']);
  f.store.saveConversationSettings(11, { codingSkillMode: 'off' });
  await f.store.sendConfigured('Plain code', 'agent', ['code_workspace']); assert.deepEqual(f.sent[2].codingSkills, []);
  await f.store.sendConfigured('Continue bound draft', 'agent', ['code_workspace'], undefined, undefined, undefined, undefined, undefined, undefined,
    { draftId: '10000000-0000-4000-8000-000000000001', revision: 1, hash: 'a'.repeat(64) });
  assert(!Object.hasOwn(f.sent[3], 'codingSkills')); assert(!Object.hasOwn(f.sent[3], 'codingAgent'));
  f.store.currentConversation = { ...f.conversation, id: 12, conversationType: 'ROLEPLAY', personaKey: 'kato_megumi_persona' };
  f.store.saveConversationSettings(12, { codingEnabled: true, codingSkillMode: 'custom', codingSkillNames: ['frontend-design'] });
  await f.store.sendConfigured('Synthetic roleplay', 'agent', ['code_workspace'], 'kato_megumi_persona');
  assert(!Object.hasOwn(f.sent[4], 'codingSkills')); assert(!Object.hasOwn(f.sent[4], 'codingAgent'));
  f.store.resetForUser(); assert.deepEqual(f.store.conversationSettings, {});
});

test('refresh enables live checklist only from the server codingAgent flag, never stale saved preferences', async () => {
  const runId = '10000000-0000-4000-8000-000000000001';
  for (const flag of [true, false, undefined]) {
    const f = storeFixture(); f.store.saveConversationSettings(11, { codingEnabled: true });
    f.read(async path => path.startsWith('/chat/runs/recovery?') ? [{ id: runId, status: 'RUNNING', codingAgent: flag }] : []);
    f.watch((_id, signal) => new Promise(resolve => signal.addEventListener('abort', () => resolve({ status: 'CANCELLED' }), { once: true })));
    try {
      await f.store.selectConversation(f.conversation);
      const reply = f.store.messages.at(-1);
      assert.equal(f.store.codingChecklistRunIdForMessage(11, reply.id), flag === true ? runId : undefined);
    } finally { f.store.resetForUser(); }
  }
});

test('live checklist accessor identifies only the current coding reply, not historical or other-conversation messages', async () => {
  const f = storeFixture(); let finish;
  f.store.saveConversationSettings(11, { codingEnabled: true });
  f.watch(() => new Promise(resolve => { finish = resolve; }));
  const sending = f.store.sendConfigured('Implement a page', 'agent', ['code_workspace']);
  await Promise.resolve(); await Promise.resolve();
  const reply = f.store.messages.at(-1);
  assert.equal(f.store.codingChecklistRunIdForMessage(11, reply.id), 'synthetic-run');
  assert.equal(f.store.codingChecklistRunIdForMessage(11, reply.id - 99), undefined);
  assert.equal(f.store.codingChecklistRunIdForMessage(12, reply.id), undefined);
  finish({ status: 'COMPLETED', result: { content: 'Synthetic answer', ragMetadata: { codingChecklist: { items: [] } } } }); await sending;
  assert.equal(f.store.codingChecklistRunIdForMessage(11, reply.id), undefined);
});

const flush = async () => { await Promise.resolve(); await vue.nextTick(); await Promise.resolve(); };
function preferencesFixture(mode = 'custom', conversationId = 11) {
  const calls = [], events = [], pending = [], unmount = [];
  const props = vue.reactive({ conversationId, mode, selected: [], busy: false });
  const user = vue.reactive({ userId: 7, epoch: 2, token: 'synthetic', getAuthSession() { return { userId: this.userId, epoch: this.epoch }; } });
  const request = { get(path, options) { calls.push({ path, options }); return new Promise((resolve, reject) => pending.push({ resolve, reject })); } };
  const source = readFileSync(join(__dirname, '../src/components/CodingSkillPreferences.vue'), 'utf8');
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const scope = vue.effectScope(), mod = { exports: {} };
  scope.run(() => new Function('module', 'exports', 'require', 'defineProps', 'defineEmits', compile(script + '\nexport { catalog, loading, error, load, setMode, setSelection, ownsSession };'))(
    mod, mod.exports, name => ({ vue: { ...vue, onUnmounted: callback => unmount.push(callback) },
      '@/utils/request': { default: request }, '@/stores/user': { useUserStore: () => user }, '@/utils/coding-skills': catalogPolicy }[name]),
    () => props, () => (...args) => events.push(args)));
  return { ...mod.exports, props, user, calls, pending, events, close() { for (const callback of unmount) callback(); scope.stop(); } };
}

test('only custom selection loads a metadata catalog and busy controls never mutate preferences', async () => {
  const f = preferencesFixture('auto');
  try {
    assert.equal(f.calls.length, 0);
    f.props.mode = 'off'; assert.equal(f.calls.length, 0);
    f.props.mode = 'custom'; assert.equal(f.calls.length, 1); assert.equal(f.calls[0].path, '/coding/11/skills');
    f.pending[0].resolve([skill()]); await flush(); assert.deepEqual(f.catalog.value, [skill()]);
    f.setSelection(['frontend-design']); assert.deepEqual(f.events.pop(), ['update:selected', ['frontend-design']]);
    f.setSelection(['unlisted']); assert.equal(f.events.length, 0);
    f.props.busy = true; f.setMode('off'); f.setSelection([]); assert.equal(f.events.length, 0);
  } finally { f.close(); }
});

test('account replacement or same-account relogin clears and discards a late catalog without rebinding ownership', async () => {
  for (const key of ['userId', 'epoch']) {
    const f = preferencesFixture();
    try {
      assert.equal(f.calls.length, 1); f.user[key]++;
      assert(f.calls[0].options.signal.aborted); f.pending[0].resolve([skill()]); await flush();
      assert.deepEqual(f.catalog.value, []); assert.equal(f.loading.value, false); assert.equal(f.ownsSession(), false);
      f.setMode('off'); f.setSelection(['frontend-design']); assert.equal(f.events.length, 0); assert.equal(f.calls.length, 1);
    } finally { f.close(); }
  }
});

test('conversation switch and unmount abort old requests; errors can retry without reusing stale metadata', async () => {
  const f = preferencesFixture();
  try {
    f.props.conversationId = 12; assert(f.calls[0].options.signal.aborted); assert.equal(f.calls[1].path, '/coding/12/skills');
    f.pending[0].resolve([skill('old-skill')]); f.pending[1].reject(Error('synthetic network failure')); await flush();
    assert.deepEqual(f.catalog.value, []); assert.equal(f.error.value, 'Skills 加载失败');
    const retry = f.load(); f.pending[2].resolve([skill('webapp-testing')]); await retry;
    assert.deepEqual(f.catalog.value.map(row => row.name), ['webapp-testing']); assert.equal(f.error.value, '');
    f.props.conversationId = 13; f.close(); assert(f.calls[3].options.signal.aborted);
    f.pending[3].resolve([skill()]); await flush(); assert.deepEqual(f.catalog.value, []);
  } finally { f.close(); }
});

test('new conversations remain automatic and the picker stays in settings, never in roleplay/composer', () => {
  const f = preferencesFixture('auto', null);
  try { f.setMode('custom'); assert.equal(f.calls.length, 0); assert.equal(f.events.length, 0); f.setMode('off'); assert.deepEqual(f.events.pop(), ['update:mode', 'off']); }
  finally { f.close(); }
  const source = readFileSync(join(__dirname, '../src/views/Chat.vue'), 'utf8');
  const drawer = source.match(/<el-drawer v-model="showSettings"[\s\S]*?<\/el-drawer>/)[0];
  assert.match(drawer, /CodingSkillPreferences v-if="showSettings && isAssistant && codingEnabled"/);
  assert(!readFileSync(join(__dirname, '../src/components/AssistantComposer.vue'), 'utf8').includes('CodingSkillPreferences'));
});

test('internal skill/checklist tools cannot appear, default-enable or toggle through the ordinary tool picker', async () => {
  const source = readFileSync(join(__dirname, '../src/views/Chat.vue'), 'utf8');
  const compute = source.match(/const toolSkills = computed\([\s\S]*?(?=const codingEnabled = computed)/)[0];
  const load = source.match(/const loadSkills = async \(\) => \{[\s\S]*?(?=const loadKnowledgeBases = async)/)[0];
  const toggle = source.match(/const toggleAllSkills = \(\) => \{[\s\S]*?\n};/)[0];
  const skills = vue.ref([]), enabledSkills = vue.ref([]), mod = { exports: {} };
  const data = ['load_coding_skill', 'coding_checklist', 'task_plan', 'code_workspace', 'web_search', 'calculator'].map(name => ({ name, enabled: true, category: name === 'calculator' ? '实用工具' : '编程内部' }));
  new Function('module', 'exports', 'computed', 'skills', 'enabledSkills', 'request', compile(compute + load + toggle + '\nexport {toolSkills, loadSkills, toggleAllSkills};'))(
    mod, mod.exports, vue.computed, skills, enabledSkills, { get: async () => data });
  await mod.exports.loadSkills();
  assert.deepEqual(enabledSkills.value, ['calculator']); assert.deepEqual(mod.exports.toolSkills.value.map(item => item.name), ['calculator']);
  mod.exports.toggleAllSkills(); assert.deepEqual(enabledSkills.value, []);
  mod.exports.toggleAllSkills(); assert.deepEqual(enabledSkills.value, ['calculator']);
});

const checklist = (status = 'in_progress') => ({ items: [{ id: 'step-1', title: '实现页面', kind: 'implementation', status,
  ...(status === 'blocked' ? { note: '需要用户提供缺失文件。' } : {}) }], updatedAt: '2026-11-03T00:00:00.000Z' });
function checklistFixture(overrides = {}) {
  const calls = [], pending = [], unmount = [], timers = new Set();
  const props = vue.reactive({ conversationId: 11, runId: '10000000-0000-4000-8000-000000000001', active: true, initial: checklist('pending'), ...overrides });
  const user = vue.reactive({ userId: 7, epoch: 2, token: 'synthetic', getAuthSession() { return { userId: this.userId, epoch: this.epoch }; } });
  const request = { get(path, options) { calls.push({ path, options }); return new Promise((resolve, reject) => pending.push({ resolve, reject })); } };
  const source = readFileSync(join(__dirname, '../src/components/CodingChecklist.vue'), 'utf8');
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1], scope = vue.effectScope(), mod = { exports: {} };
  scope.run(() => new Function('module', 'exports', 'require', 'defineProps', 'setTimeout', 'clearTimeout',
    compile(script + '\nexport { snapshot, items, completed, ownsSession, itemState };'))(mod, mod.exports,
      name => ({ vue: { ...vue, onUnmounted: callback => unmount.push(callback) }, '@/utils/request': { default: request },
        '@/stores/user': { useUserStore: () => user }, '@/utils/coding-checklist': checklistPolicy }[name]), () => props,
      callback => { timers.add(callback); return callback; }, timer => timers.delete(timer)));
  return { ...mod.exports, props, user, calls, pending, timers, close() { for (const callback of unmount) callback(); scope.stop(); } };
}

test('checklist metadata is bounded and cannot synthesize completed state from unknown status or private payloads', () => {
  assert.equal(checklistPolicy.readCodingChecklist(null), undefined);
  assert.deepEqual(checklistPolicy.readCodingChecklist({ ...checklist('blocked'), thought: 'PRIVATE', items: [{ ...checklist('blocked').items[0], arguments: 'PRIVATE' }] }), checklist('blocked'));
  for (const bad of [{ items: {} }, { items: Array(21).fill(checklist().items[0]) },
    { items: [checklist().items[0], checklist().items[0]] }, { items: [{ ...checklist().items[0], status: 'completed' }] }])
    assert.throws(() => checklistPolicy.readCodingChecklist(bad));
  const runId = '10000000-0000-4000-8000-000000000001';
  assert.throws(() => checklistPolicy.readCodingChecklist({ ...checklist(), runId }, '20000000-0000-4000-8000-000000000002'));
  const parsed = checklistPolicy.readCodingChecklist({ items: [{ ...checklist('done').items[0], kind: 'verify',
    evidence: { kind: 'syntax_check', stepIds: ['PRIVATE'], paths: ['src/main.js'], sources: [{ path: 'src/main.js', sourceHash: 'PRIVATE' }] } }] });
  assert.equal(parsed.items[0].verificationKind, 'syntax_check'); assert.deepEqual(parsed.items[0].paths, ['src/main.js']); assert(!JSON.stringify(parsed).includes('PRIVATE'));
  for (const evidence of [undefined, { kind: 'self_reported', paths: ['src/main.js'] }, { kind: 'syntax_check' }])
    assert.throws(() => checklistPolicy.readCodingChecklist({ items: [{ ...checklist('done').items[0], kind: 'verify', evidence }] }));
  for (const path of ['../outside.js', 'C:/secret.js', '/host.js', '.env', 'nested/.hidden.js'])
    assert.throws(() => checklistPolicy.readCodingChecklist({ items: [{ ...checklist('done').items[0], kind: 'verify', evidence: { kind: 'syntax_check', paths: [path] } }] }));
  const f = checklistFixture({ active: false, initial: parsed });
  try { assert.equal(f.itemState(f.items.value[0]), '语法检查'); assert.equal(f.itemState({ ...f.items.value[0], verificationKind: 'visual_review' }), '视觉验收'); }
  finally { f.close(); }
});

test('live checklist follows pushed snapshots during execution without polling a missing plan', async () => {
  const f = checklistFixture();
  try {
    assert.equal(f.completed.value, 0); assert.equal(f.calls.length, 0);
    f.props.initial=checklist('blocked'); await flush();
    assert.equal(f.items.value[0].status, 'blocked'); assert.equal(f.completed.value, 0); assert.equal(f.timers.size, 0);
    f.props.initial = checklist('blocked'); f.props.active = false; await flush();
    assert.equal(f.items.value[0].status, 'blocked'); assert.equal(f.completed.value, 0); assert.equal(f.timers.size, 0);
    assert.equal(f.calls.length, 0, 'run completion does not trigger work or infer checklist completion');
  } finally { f.close(); }
});

test('account, run, and unmount boundaries reject unrelated checklist snapshots', async () => {
  const f = checklistFixture();
  try {
    f.props.initial={...checklist('done'),runId:f.props.runId};
    f.props.runId = '20000000-0000-4000-8000-000000000002'; await flush(); assert.equal(f.completed.value, 0);
    f.user.epoch++; f.props.initial=checklist('done'); await flush();
    assert.equal(f.ownsSession(), false); assert.equal(f.completed.value, 0); assert.equal(f.timers.size, 0);
  } finally { f.close(); }
  const gone = checklistFixture(); gone.close();
  gone.props.initial=checklist('done'); await flush(); assert.equal(gone.completed.value, 0); assert.equal(gone.timers.size, 0);
});

test('an empty checklist stays absent and real completion requires a later valid snapshot', async () => {
  const f = checklistFixture({initial:undefined});
  try {
    assert.equal(f.items.value.length,0);assert.equal(f.calls.length,0);assert.equal(f.timers.size,0);
    f.props.initial=checklist('done'); await flush();
    assert.equal(f.completed.value, 1); assert.equal(f.calls.length,0);assert.equal(f.timers.size,0);
  } finally { f.close(); }
});

test('failed or cancelled coding tasks recover their real checklist after refresh without a question or automatic rerun', async () => {
  const runId = '10000000-0000-4000-8000-000000000001';
  for (const status of ['FAILED', 'CANCELLED']) {
    const f = storeFixture(), initial = { ...checklist('blocked'), runId, version: 'coding-checklist-v1', privateState: 'PRIVATE' };
    f.read(async path => path.startsWith('/chat/runs/recovery?') ? [{ id: runId, status, codingAgent: true,
      result: { ragMetadata: { codingChecklist: initial } } }] : []);
    await f.store.selectConversation(f.conversation);
    const failed = f.store.failedAttempts[11];
    assert(failed); assert.equal(failed.question, undefined); assert.equal(failed.reply.failure.retryable, false);
    assert.equal(failed.reply.failure.cancelled, status === 'CANCELLED');
    assert.equal(failed.reply.ragMetadata.codingChecklist.items[0].status, 'blocked');
    assert(!JSON.stringify(failed.reply.ragMetadata).includes('PRIVATE')); assert.equal(f.sent.length, 0);
    f.store.resetForUser();
  }
});

test('wrong-run and non-coding failure snapshots do not invent a recovered coding task', async () => {
  const runId = '10000000-0000-4000-8000-000000000001';
  for (const input of [{ codingAgent: false, runId }, { codingAgent: true, runId: '20000000-0000-4000-8000-000000000002' }]) {
    const f = storeFixture();
    f.read(async path => path.startsWith('/chat/runs/recovery?') ? [{ id: runId, status: 'FAILED', codingAgent: input.codingAgent,
      result: { ragMetadata: { codingChecklist: { ...checklist('blocked'), runId: input.runId } } } }] : []);
    await f.store.selectConversation(f.conversation);
    assert.equal(f.store.failedAttempts[11], undefined); assert.equal(f.store.messages.length, 0); assert.equal(f.sent.length, 0);
    f.store.resetForUser();
  }
});

test('a failed live task keeps the last server checklist separately from its error card', async () => {
  const f = storeFixture(); f.store.conversations = [f.conversation];
  f.store.saveConversationSettings(11, { codingEnabled: true });
  f.watch(async () => ({ status: 'FAILED', result: { ragMetadata: { codingChecklist: checklist('blocked') } } }));
  await f.store.sendConfigured('Implement and verify a page', 'agent', ['code_workspace']);
  assert.equal(f.sent.length, 1);
  assert.equal(f.store.failedAttempts[11].reply.ragMetadata.codingChecklist.items[0].status, 'blocked');
  assert.equal(f.store.failedAttempts[11].reply.failure.retryable, true);
  f.store.resetForUser();
});

const publicWork=runId=>({version:'agent-work-v1',runId,revision:'a'.repeat(64),activities:[],plan:{version:'agent-task-plan-v1',revision:1,readyForAnswer:false,
 summary:'先核对公开资料，再整理方案。',items:[{id:'find',title:'核对资料',kind:'research',status:'done'},{id:'answer',title:'整理方案',kind:'deliver',status:'in_progress'}]}});
test('ordinary non-coding Agent receives real work and preserves it when final metadata is otherwise empty',async()=>{
 const runId='10000000-0000-4000-8000-000000000001',f=storeFixture({runId});let observed;
 f.watch(async(_id,_signal,_delta,_progress,onWork)=>{onWork(publicWork(runId));observed=f.store.messages.at(-1);assert.equal(observed.ragMetadata.agentWork.plan.items[0].status,'done');
  assert.equal(f.store.workRunIdForMessage(11,observed.id),runId);return{status:'COMPLETED',result:{content:'合成结果',ragMetadata:{}}};});
 await f.store.sendConfigured('比较两种方案','agent',[]);
 assert.equal(f.sent[0].codingAgent,undefined);assert.equal(observed.ragMetadata.agentWork.runId,runId);assert.equal(f.sent.length,1);f.store.resetForUser();
});

test('background work remains attached to its own conversation after switching the visible view',async()=>{
 const runId='10000000-0000-4000-8000-000000000001',f=storeFixture({runId});let onWork,finish;
 f.watch((_id,_signal,_delta,_progress,work)=>{onWork=work;return new Promise(resolve=>{finish=resolve;});});
 const sending=f.store.sendConfigured('合成后台请求','agent',[]);await flush();const background=f.store.messages.at(-1);
 f.store.currentConversation={...f.conversation,id:12};f.store.messages=[];onWork(publicWork(runId));
 assert.equal(background.ragMetadata.agentWork.runId,runId);assert.equal(f.store.messages.length,0);assert.equal(f.store.workRunIdForMessage(12,background.id),undefined);
 finish({status:'COMPLETED',result:{content:'后台合成结果',ragMetadata:{}}});await sending;assert.equal(f.store.messages.length,0);f.store.resetForUser();
});
test('refresh restores public work from the original run without requiring a saved coding preference',async()=>{
 const runId='10000000-0000-4000-8000-000000000001',f=storeFixture();f.read(async path=>path.startsWith('/chat/runs/recovery?')?[{id:runId,status:'RUNNING',work:publicWork(runId),progress:{stage:'generating',elapsedMs:4000,stages:[]}}]:[]);
 f.watch((_id,signal)=>new Promise(resolve=>signal.addEventListener('abort',()=>resolve({status:'CANCELLED'}),{once:true})));
 try{await f.store.selectConversation(f.conversation);const reply=f.store.messages.at(-1);assert.equal(reply.ragMetadata.agentWork.plan.summary,'先核对公开资料，再整理方案。');assert.equal(reply.ragMetadata.performance.elapsedMs,4000);assert.equal(f.store.workRunIdForMessage(11,reply.id),runId);assert.equal(f.sent.length,0);}finally{f.store.resetForUser();}
});
test('work callbacks are rejected after account reset and roleplay never receives new work presentation data',async()=>{
 const runId='10000000-0000-4000-8000-000000000001',f=storeFixture({runId});let onWork,finish;
 f.watch((_id,_signal,_delta,_progress,work)=>{onWork=work;return new Promise(resolve=>{finish=resolve;});});
 const sending=f.store.sendConfigured('合成请求','agent',[]);await flush();const reply=f.store.messages.at(-1);f.store.resetForUser();onWork(publicWork(runId));finish({status:'CANCELLED'});await sending;assert.equal(reply.ragMetadata.agentWork,undefined);assert.equal(f.store.messages.length,0);
 const role=storeFixture({runId});role.store.currentConversation={...role.conversation,conversationType:'ROLEPLAY',personaKey:'kato_megumi_persona'};let roleReply;
 role.watch(async(_id,_signal,_delta,_progress,work)=>{work(publicWork(runId));roleReply=role.store.messages.at(-1);return{status:'COMPLETED',work:publicWork(runId),result:{content:'合成角色台词',ragMetadata:{agentWork:publicWork(runId)}}};});
 await role.store.sendConfigured('合成角色请求','agent',[],'kato_megumi_persona');assert.equal(roleReply.ragMetadata.agentWork,undefined);role.store.resetForUser();
});
