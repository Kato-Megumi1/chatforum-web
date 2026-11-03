const {test}=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs'),{join}=require('node:path'),ts=require('typescript');
function load(file,deps={}){const mod={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(join(__dirname,'../src/utils/'+file+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>deps[name],mod,mod.exports);return mod.exports;}
const policy=load('agent-work',{'./coding-checklist':load('coding-checklist')}),runId='10000000-0000-4000-8000-000000000001';
const sample=()=>({version:'agent-work-v1',runId,revision:'a'.repeat(64),plan:{version:'agent-task-plan-v1',revision:2,readyForAnswer:false,
 summary:'先确认公开信息，再对比两种方案。',items:[{id:'find',title:'查找公开资料',kind:'research',status:'done',summary:'已核对可访问的来源。',evidence:'sources'},
 {id:'compare',title:'比较方案',kind:'analysis',status:'in_progress'}]},activities:[{id:'20000000-0000-4000-8000-000000000002',sequence:1,kind:'web_search',status:'done',startedAt:'2026-11-03T00:00:00.000Z',finishedAt:'2026-11-03T00:00:01.000Z'}]});
test('public work projects only explicit summaries, real plan state and fixed operation receipts',()=>{
 const value=sample();value.reasoning_content='PRIVATE';value.plan.privateDraft='PRIVATE';value.plan.items[0].arguments='PRIVATE';value.activities[0].result='PRIVATE';
 const parsed=policy.readAgentWork(value,runId);assert(parsed);assert.equal(parsed.plan.summary,sample().plan.summary);assert.equal(parsed.plan.items[0].status,'done');
 assert(!JSON.stringify(parsed).includes('PRIVATE'));assert.equal(policy.currentWorkAction(parsed),undefined);
});
test('missing, wrong-run, malformed or unbounded work never manufactures a plan',()=>{
 assert.equal(policy.readAgentWork(undefined),undefined);assert.equal(policy.currentWorkAction(undefined),undefined);
 const invalid=[{...sample(),runId:'other'}, {...sample(),revision:'invalid'}, {...sample(),activities:Array(13).fill(sample().activities[0])},
 {...sample(),plan:{...sample().plan,items:[]}}, {...sample(),plan:{...sample().plan,summary:'x'.repeat(161)}},
 {...sample(),activities:[{...sample().activities[0],kind:'shell'}]}, {...sample(),activities:[{...sample().activities[0],finishedAt:'bad'}]}];
 for(const value of invalid)assert.equal(policy.readAgentWork(value,runId),undefined);
 assert.equal(policy.readAgentWork(sample(),'30000000-0000-4000-8000-000000000003'),undefined);
});
test('strict coding checklist is reused instead of duplicating a generic plan or weakening verification',()=>{
 const value={...sample(),codingChecklist:{version:'coding-checklist-v1',runId,items:[{id:'syntax',title:'检查语法',kind:'verify',status:'done',evidence:{kind:'syntax_check',paths:['src/main.js']}}]}};
 const parsed=policy.readAgentWork(value,runId);assert.equal(parsed.plan,undefined);assert.equal(parsed.codingChecklist.items[0].verificationKind,'syntax_check');
 value.codingChecklist.items[0].evidence={kind:'self_reported'};assert.equal(policy.readAgentWork(value,runId),undefined);
});
test('readyForAnswer is only recorded readiness, not invented summary generation or tool activity',()=>{
 const value=sample();value.plan.readyForAnswer=true;value.plan.items[1].status='done';
 const parsed=policy.readAgentWork(value,runId);assert.equal(parsed.plan.readyForAnswer,true);assert.equal(policy.currentWorkAction(parsed),undefined);
 value.activities[0].status='running';delete value.activities[0].finishedAt;assert.equal(policy.currentWorkAction(policy.readAgentWork(value,runId)),'正在搜索网页');
});
test('work presentation uses escaped plain text and no provider reasoning, parameter panels or polling',()=>{
 const status=readFileSync(join(__dirname,'../src/components/GenerationStatus.vue'),'utf8'),checklist=readFileSync(join(__dirname,'../src/components/CodingChecklist.vue'),'utf8');
 assert.match(status,/\{\{ work.plan.summary \}\}/);assert.match(status,/\{\{ item.title \}\}/);assert.match(status,/\{\{ item.summary \}\}/);
 assert.doesNotMatch(status,/v-html|阶段累计用时|thinkingChars\}\}|思考数据/);assert.doesNotMatch(checklist,/request\.get|setTimeout|setInterval/);
});
