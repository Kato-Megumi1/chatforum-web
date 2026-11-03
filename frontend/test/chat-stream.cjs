const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const ts = require('typescript');
function load(name, deps = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(readFileSync(join(__dirname, '../src/utils/' + name + '.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('module', 'exports', 'require', code)(mod, mod.exports, key => {
    if (key === './agent-work') return load('agent-work', { './coding-checklist': load('coding-checklist') });
    if (!deps[key]) throw Error('Unexpected import ' + key); return deps[key];
  });
  return mod.exports;
}
test('SSE reconnect still waits for the same task after an hour, with no total time allowance', async t => {
  let clock = 0, calls = 0;
  t.mock.method(Date, 'now', () => clock);
  const module = load('chat-stream', {
    './api': { apiUrl: p => 'http://fixture.invalid' + p },
    './request': { default: { get() { throw Error('No polling expected'); } } },
    '@/stores/user': { useUserStore: () => ({ token: 'fixture' }) }, './sse': load('sse'),
  });
  t.mock.method(globalThis, 'fetch', async url => {
    assert.match(url, /\/chat\/runs\/fixture-run\/events\?offset=0$/);
    calls++; clock += 60 * 60 * 1000;
    const data = calls === 1 ? '' : 'event: complete\ndata: {"status":"COMPLETED","result":{"content":"fixture"}}\n\n';
    return new Response(data, { headers: { 'content-type': 'text/event-stream' } });
  });
  const result = await module.watchChatRun('fixture-run', new AbortController().signal, () => {});
  assert.equal(result.status, 'COMPLETED'); assert.equal(calls, 2);
});
test('progress frames stay separate from answer text and survive normal completion', async t => {
  const module = load('chat-stream', {
    './api': { apiUrl: p => 'http://fixture.invalid' + p }, './request': { default: {} },
    '@/stores/user': { useUserStore: () => ({ token: 'fixture' }) }, './sse': load('sse'),
  });
  const progress = {stage:'verifying',elapsedMs:1700,firstTokenMs:null,stages:[]};
  t.mock.method(globalThis,'fetch',async()=>new Response(
    'event: progress\ndata: '+JSON.stringify(progress)+'\n\nevent: reasoning\ndata: {"text":"SECRET_REASONING"}\n\nevent: delta\ndata: {"text":"回答","offset":2}\n\nevent: complete\ndata: {"status":"COMPLETED","result":{"content":"回答"}}\n\n',
    {headers:{'content-type':'text/event-stream'}}));
  const chunks=[],phases=[];
  const result=await module.watchChatRun('fixture',new AbortController().signal,text=>chunks.push(text),value=>phases.push(value));
  assert.equal(result.status,'COMPLETED');assert.deepEqual(chunks,['回答']);assert.deepEqual(phases,[progress]);
});

test('public progress keeps only valid timing and phase counters, never arbitrary model text', () => {
  const module = load('chat-stream', { './api': {}, './request': {}, '@/stores/user': {}, './sse': {} });
  const value = module.parseGenerationProgress({ stage: 'generating', phase: 'tools', elapsedMs: 4000,
    firstTokenMs: 8000, phaseElapsedMs: 3000, queueMs: 100, modelCalls: 3, activeModelCalls: 1,
    reasoning_content: 'SECRET_REASONING', system: 'SECRET_PROMPT', toolArguments: { content: 'SECRET_CODE' },
    stages: [{ stage: 'generating', durationMs: 4000, text: 'SECRET_TEXT' }, { stage: 'private', durationMs: 100 }],
    phases: [{ phase: 'thinking', durationMs: 700, modelCalls: 1, description: 'SECRET_SUMMARY' },
      { phase: 'tools', durationMs: 3000, modelCalls: 2, output: 'SECRET_OUTPUT' },
      { phase: 'tools', durationMs: 999, modelCalls: 4 }, { phase: 'context', durationMs: -1, modelCalls: 0 }],
  });
  assert.deepEqual(value, { stage: 'generating', phase: 'tools', elapsedMs: 4000, firstTokenMs: null,
    phaseElapsedMs: 3000, queueMs: 100, modelCalls: 3, activeModelCalls: 1,
    stages: [{ stage: 'generating', durationMs: 4000 }], phases: [
      { phase: 'thinking', durationMs: 700, modelCalls: 1 }, { phase: 'tools', durationMs: 3000, modelCalls: 2 }] });
  assert(!JSON.stringify(value).includes('SECRET_'));
  assert.equal(module.parseGenerationProgress({ stage: 'private', elapsedMs: 0 }), null);
  assert.equal(module.parseGenerationProgress({ stage: 'generating', elapsedMs: Infinity }), null);
});

test('activity and live output telemetry cannot carry model text or tool arguments', () => {
  const module = load('chat-stream', { './api': {}, './request': {}, '@/stores/user': {}, './sse': {} });
  const input = { stage: 'generating', phase: 'thinking', elapsedMs: 77000, firstTokenMs: null, activity: 'preview_html',
    modelOutput: { thinkingChars: 1200, textChars: 0, toolChars: 300, lastDataElapsedMs: 76900,
      reasoning_content: 'SECRET_THOUGHTS', arguments: 'SECRET_FILE' } };
  const value = module.parseGenerationProgress(input);
  assert.equal(value.activity, 'preview_html');
  assert.deepEqual(value.modelOutput, { thinkingChars: 1200, textChars: 0, toolChars: 300, lastDataElapsedMs: 76900 });
  assert(!JSON.stringify(value).includes('SECRET_'));
  assert.equal(module.parseGenerationProgress({ ...input, activity: 'SECRET_STATUS' }).activity, undefined);
  assert.equal(module.parseGenerationProgress({ ...input, modelOutput: { ...input.modelOutput, textChars: -1 } }).modelOutput, undefined);
});

test('work SSE is same-run projected public state, independent from answer deltas and terminal recovery', async t => {
  const module=load('chat-stream',{'./api':{apiUrl:path=>'http://fixture.invalid'+path},'./request':{default:{}},'@/stores/user':{useUserStore:()=>({token:'fixture'})},'./sse':load('sse')});
  const runId='10000000-0000-4000-8000-000000000001';
  const work={version:'agent-work-v1',runId,revision:'a'.repeat(64),activities:[],reasoning:'PRIVATE_REASONING',toolArguments:'PRIVATE_FILE',
    plan:{version:'agent-task-plan-v1',revision:1,readyForAnswer:false,summary:'已核对资料，正在整理结果。',items:[
      {id:'read',title:'核对资料',kind:'research',status:'done'},{id:'answer',title:'整理结果',kind:'deliver',status:'in_progress'}]}};
  const terminal={...work,revision:'b'.repeat(64),plan:{...work.plan,revision:2,readyForAnswer:true,items:work.plan.items.map(item=>({...item,status:'done'}))}};
  const frames=[['work',{...work,runId:'20000000-0000-4000-8000-000000000002'}],['work',work],['delta',{text:'合成回答',offset:4}],['complete',{status:'COMPLETED',result:{content:'合成回答',ragMetadata:{agentWork:terminal}}}]];
  t.mock.method(globalThis,'fetch',async()=>new Response(frames.map(([event,value])=>'event: '+event+'\ndata: '+JSON.stringify(value)+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}}));
  const texts=[],snapshots=[];const result=await module.watchChatRun(runId,new AbortController().signal,text=>texts.push(text),undefined,value=>snapshots.push(value));
  assert.deepEqual(texts,['合成回答']);assert.equal(snapshots.length,2);assert.equal(result.work.plan.readyForAnswer,true);
  assert.equal(snapshots[0].plan.summary,work.plan.summary);assert(!JSON.stringify(snapshots).includes('PRIVATE_'));
});
