const {test}=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs'),{join}=require('node:path'),ts=require('typescript');
function load(request){const mod={exports:{}};new Function('module','exports','require',ts.transpileModule(readFileSync(join(__dirname,'../src/utils/chat-files.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(mod,mod.exports,()=>({default:request}));return mod.exports;}
test('mixed uploads retain original selection order; references contain identity, never names/content',async()=>{
 let n=0;const api=load({post:async(url,input)=>url.endsWith('/files')?{files:input.files.map(f=>({id:++n,path:f.path,kind:'text',revision:1}))}:{id:++n,name:input.get('file').name,kind:'image',revision:1}});
 let selected;await api.uploadChatFiles(1,[new File(['image'],'one.png'),new File(['text'],'two.txt'),new File(['image'],'three.png')],files=>selected=files);
 assert.deepEqual(selected.map(f=>f.path),['one.png','two.txt','three.png']);assert.deepEqual(api.chatFileRef(selected[0]),{id:2,kind:'attachment',revision:1});assert.deepEqual(api.chatFileRef(selected[1]),{id:1,kind:'text',revision:1});
 assert.notEqual(api.chatFileKey({id:1,kind:'image'}),api.chatFileKey({id:1,kind:'text'}));
});
test('partial upload failure still selects already-saved files',async()=>{
 let selected;const api=load({post:async(url)=>{if(url.endsWith('/files'))return{files:[{id:1,path:'ok.txt',revision:1,kind:'text'}]};throw Error('synthetic failure');}});
 await assert.rejects(api.uploadChatFiles(1,[new File(['text'],'ok.txt'),new File(['image'],'fail.png')],files=>selected=files),/已保存1个文件/);assert.equal(selected.length,1);assert.equal(selected[0].path,'ok.txt');
});
test('message downloads use immutable ID and text revision; removal handles explicit text kind',async()=>{
 const calls=[],api=load({get:async(...args)=>calls.push(args),delete:async(...args)=>calls.push(args)});
 await api.fetchChatFile(5,{id:2,path:'a.txt',kind:'text',revision:3});assert.equal(calls[0][0],'/coding/5/files/2/download');assert.deepEqual(calls[0][1].params,{revision:3});
 await api.fetchChatFile(5,{id:2,path:'b.png',kind:'image',revision:1});assert.equal(calls[1][0],'/coding/5/attachments/2/download');
 await api.deleteChatFile(5,{id:2,path:'a.txt',kind:'text',revision:3});assert.deepEqual(calls[2][1].params,{kind:'text',revision:3});
});

const recoveryModule={exports:{}};
new Function('module','exports',ts.transpileModule(readFileSync(join(__dirname,'../src/utils/chat-draft-recovery.ts'),'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(recoveryModule,recoveryModule.exports);
const {recoverChatDraft,sameDraftFiles,sameDraftSession}=recoveryModule.exports;
const roleplayDefaultsModule={exports:{}};
new Function('module','exports',ts.transpileModule(readFileSync(join(__dirname,'../src/utils/roleplay-defaults.ts'),'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(roleplayDefaultsModule,roleplayDefaultsModule.exports);
const owner={userId:7,epoch:3}, attachment={id:42,path:'fixture.png',kind:'image',revision:1};
const failed={text:'Describe this fixture image',files:[attachment]};
const recoveryInput=(overrides={})=>({expectedSession:owner,currentSession:{...owner},navigationUserId:7,conversationExists:true,
 current:{text:'',files:[]},failed,...overrides});

test('failed/aborted durable sends restore text and accepted attachments even while the chat route is absent',()=>{
 // Recovery is a store operation with no mounted-view requirement. A new route
 // instance reads this same per-conversation state when it opens again.
 const before=structuredClone(failed), input=recoveryInput();
 const recovered=recoverChatDraft(input);
 assert.deepEqual(recovered,failed);assert.notEqual(recovered.files,failed.files);
 const drafts={},selections={};drafts[11]=recovered.text;selections[11]=recovered.files;
 assert.equal(drafts[11],failed.text);assert.deepEqual(selections[11],[attachment]);
 assert.deepEqual(failed,before);assert.deepEqual(input.current,{text:'',files:[]});
});

test('late acceptance and failed-send recovery are invalid after account/epoch changes, including same-id relogin',()=>{
 for(const currentSession of [{userId:8,epoch:3},{userId:null,epoch:4},{userId:7,epoch:5}]){
  assert.equal(sameDraftSession(owner,currentSession,7),false);
  assert.equal(recoverChatDraft(recoveryInput({currentSession})),undefined);
 }
 assert.equal(recoverChatDraft(recoveryInput({navigationUserId:8})),undefined);
 assert.equal(recoverChatDraft(recoveryInput({conversationExists:false})),undefined);
});

test('recovery preserves a newer text draft or changed attachment selection rather than overwriting it',()=>{
 for(const text of ['A newer question',' '])assert.equal(recoverChatDraft(recoveryInput({current:{text,files:[]}})),undefined);
 for(const files of [[{...attachment,id:43}],[{...attachment,revision:2}],[attachment,{...attachment,id:43}]]){
  const current={text:'',files},before=structuredClone(current);
  assert.equal(recoverChatDraft(recoveryInput({current})),undefined);assert.deepEqual(current,before);
 }
 // A pre-admission failure has not consumed its original selection yet.
 assert.deepEqual(recoverChatDraft(recoveryInput({current:{text:'',files:[attachment]}})),failed);
});

test('attachment admission/recovery compares immutable identity and revision, not names or current route',()=>{
 assert.equal(sameDraftSession(owner,{...owner},7),true);
 assert.equal(sameDraftFiles([attachment],[{...attachment,path:'renamed-display.png'}]),true);
 assert.equal(sameDraftFiles([attachment],[{...attachment,id:43}]),false);
 assert.equal(sameDraftFiles([attachment],[{...attachment,revision:2}]),false);
 assert.equal(sameDraftFiles([attachment],[{...attachment,kind:'text'}]),false);
 assert.equal(sameDraftFiles([{...attachment,kind:undefined}],[{...attachment,kind:'text'}]),true);
});

const vue=require('vue');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function draftConversation(id=11,userId=7){return{id,userId,title:'Synthetic fixture',conversationType:'ASSISTANT',personaKey:'assistant'};}
function chatRecoveryFixture({acceptImmediately=true,knowledgeBaseId=0}={}){
 let epoch=3,admission,sentArguments;
 const run=deferred(),errors=[],request={get:async path=>path.startsWith('/coding/')?{files:[attachment]}:[]};
 const store=vue.reactive({currentConversation:draftConversation(),conversations:[draftConversation()],navigation:{userId:7,space:'ASSISTANT',conversationId:11,scroll:{}},
  messages:[],drafts:{},draftAttachments:{11:[{...attachment}]},failedAttempts:{},isStreaming:false,isLoadingConversation:false,
  llmConfig:{models:[{id:'fixture-model',available:true}],defaultModelId:'fixture-model'},
  initializeNavigation(){},setSpace(space){this.navigation.space=space;},selectedModelId(){return'fixture-model';},
  getConversationSettings(){return{agentMode:'normal',knowledgeBaseId,codingEnabled:false};},saveConversationSettings(){},
  saveView(id,scroll,draft){this.drafts[id]=draft;},loadDefaultConfig:async()=>{},loadConversations:async()=>{},
  async selectConversation(conversation){this.currentConversation=conversation;},clearSelection(){this.currentConversation=null;},
  sendConfigured(...args){sentArguments=args;this.isStreaming=true;admission=args[8]?.onAccepted;if(acceptImmediately)admission?.();return run.promise.finally(()=>{this.isStreaming=false;});},
 });
 const user=vue.reactive({user:{id:7,username:'Fixture'},getAuthSession:()=>({userId:user.user?.id??null,epoch})});
 const navigationModule={exports:{}};
 new Function('module','exports',ts.transpileModule(readFileSync(join(__dirname,'../src/utils/chat-navigation.ts'),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(navigationModule,navigationModule.exports);
 function view(){
  const mounted=[],unmounted=[],scope=vue.effectScope();
  const imports={vue:{...vue,onMounted:fn=>mounted.push(fn),onBeforeUnmount:fn=>unmounted.push(fn)},
   'vue-router':{useRoute:()=>({query:{}}),useRouter:()=>({replace:async()=>{},resolve:path=>({href:'#'+path})}),onBeforeRouteLeave(){}},
   'element-plus':{ElMessage:{error:value=>errors.push(value),warning(){},info(){},success(){}},ElMessageBox:{}},
   '@/stores/chat':{useChatStore:()=>store},'@/stores/user':{useUserStore:()=>user},'@/utils/request':request,
   '@/utils/api':{publicAsset:path=>path,CONNECTION_SETTINGS_ENABLED:false},'@/utils/chat-navigation':navigationModule.exports,
   '@/utils/chat-draft-recovery':recoveryModule.exports,'@/utils/chat-files':load(request),
   '@/utils/roleplay-defaults':roleplayDefaultsModule.exports,
   '@/utils/forum-links':{},marked:{marked:{}},dompurify:{},dayjs:()=>({format:()=>''}),
  };
  const script=readFileSync(join(__dirname,'../src/views/Chat.vue'),'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const code=ts.transpileModule(script+'\nexport {handleSendMessage,retryFailedAnswer,inputText};',{
   compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const mod={exports:{}};
  scope.run(()=>new Function('require','module','exports','window',code)(name=>{
   if(Object.hasOwn(imports,name))return imports[name];
   if(name.endsWith('.vue'))return{};
   throw Error('Unexpected Chat.vue import: '+name);
  },mod,mod.exports,{matchMedia:()=>({matches:false}),addEventListener(){},removeEventListener(){}}));
  return{...mod.exports,mount:async()=>{for(const fn of mounted)await fn();await tick();},unmount(){for(const fn of unmounted)fn();scope.stop();}};
 }
 return{store,user,run,errors,view,sentArguments:()=>sentArguments,accept:()=>admission?.(),switchSession(id){epoch++;user.user=id?{id,username:'Fixture '+id}:null;store.navigation.userId=id??0;}};
}

test('ordinary AI does not send an obsolete saved novel knowledge base with an attachment',async()=>{
 const f=chatRecoveryFixture({knowledgeBaseId:73}),active=f.view();await active.mount();active.inputText.value='Read the attached file';
 const sending=active.handleSendMessage();await tick();
 assert(f.sentArguments(),'The ordinary request must still be sent');
 assert.equal(f.sentArguments()[5],undefined,'A hidden old knowledge-base selection must not affect ordinary AI');
 assert.deepEqual(f.sentArguments()[8].files,[attachment],'Message attachments remain independent and available');
 f.run.resolve(true);await sending;active.unmount();assert.deepEqual(f.errors,[]);
});

test('real Chat.vue send recovers a failed accepted draft after leaving and hydrates it on return',async()=>{
 const f=chatRecoveryFixture(),old=f.view();await old.mount();old.inputText.value=failed.text;
 const sending=old.handleSendMessage();await tick();assert.deepEqual(f.store.draftAttachments[11],[]);
 old.unmount();f.run.reject(Error('Synthetic provider failure'));await sending;
 assert.equal(f.store.drafts[11],failed.text);assert.deepEqual(f.store.draftAttachments[11],[attachment]);
 const returned=f.view();await returned.mount();assert.equal(returned.inputText.value,failed.text);
 returned.unmount();assert.deepEqual(f.errors,[]);
});

test('a returned Chat.vue observes late recovery from its unmounted predecessor',async()=>{
 const f=chatRecoveryFixture(),old=f.view();await old.mount();old.inputText.value=failed.text;
 const sending=old.handleSendMessage();await tick();old.unmount();
 const returned=f.view();await returned.mount();assert.equal(returned.inputText.value,'');
 f.run.resolve(false);await sending;assert.equal(returned.inputText.value,failed.text);
 assert.deepEqual(f.store.draftAttachments[11],[attachment]);returned.unmount();
});

test('late failure does not replace a newer returned-view draft or attachment version',async()=>{
 const f=chatRecoveryFixture(),old=f.view();await old.mount();old.inputText.value=failed.text;
 const sending=old.handleSendMessage();await tick();old.unmount();
 const returned=f.view();await returned.mount();returned.inputText.value='Keep the newer draft';
 f.store.draftAttachments[11]=[{...attachment,revision:2}];f.run.reject(Error('Synthetic failure'));await sending;
 assert.equal(returned.inputText.value,'Keep the newer draft');assert.equal(f.store.drafts[11],'Keep the newer draft');
 assert.equal(f.store.draftAttachments[11][0].revision,2);returned.unmount();
});

test('late admission/cancellation for conversation A cannot clear or recover into current conversation B',async()=>{
 const f=chatRecoveryFixture({acceptImmediately:false}),active=f.view();await active.mount();active.inputText.value=failed.text;
 const sending=active.handleSendMessage();await tick();const other=draftConversation(12);
 f.store.conversations.push(other);f.store.drafts[12]='B draft';f.store.draftAttachments[12]=[{...attachment,id:43}];
 f.store.currentConversation=other;f.store.navigation.conversationId=12;await tick();f.accept();
 assert.deepEqual(f.store.draftAttachments[11],[]);assert.equal(f.store.draftAttachments[12][0].id,43);
 f.run.resolve(false);await sending;assert.equal(f.store.drafts[11],failed.text);assert.equal(f.store.drafts[12],'B draft');
 assert.equal(active.inputText.value,'B draft');assert.deepEqual(f.store.draftAttachments[11],[attachment]);active.unmount();
});

test('old-view admission and failure cannot alter a new account or same-account relogin',async()=>{
 for(const userId of [8,7]){
  const f=chatRecoveryFixture({acceptImmediately:false}),old=f.view();await old.mount();old.inputText.value=failed.text;
  const sending=old.handleSendMessage();await tick();old.unmount();f.switchSession(userId);
  f.store.drafts[11]='New session draft';f.store.draftAttachments[11]=[{...attachment,id:99}];
  f.accept();f.run.reject(Error('Synthetic failure'));await sending;
  assert.equal(f.store.drafts[11],'New session draft');assert.equal(f.store.draftAttachments[11][0].id,99);assert.deepEqual(f.errors,[]);
 }
});

test('retry button preserves newer drafts and only explicitly resubmits the matching failed attempt',async()=>{
 const f=chatRecoveryFixture(),active=f.view();await active.mount();
 const message={id:-2,conversationId:11,failure:{retryable:true}};
 f.store.failedAttempts[11]={question:{content:failed.text,ragMetadata:{messageAttachments:[attachment]}},reply:message};
 active.inputText.value='A newer unsent question';await active.retryFailedAnswer(message);
 assert.equal(f.sentArguments(),undefined);assert.equal(active.inputText.value,'A newer unsent question');
 active.inputText.value=failed.text;const sending=active.retryFailedAnswer(message);await tick();
 assert.equal(f.sentArguments()[0],failed.text);assert.deepEqual(f.sentArguments()[8].files,[attachment]);
 f.run.resolve(true);await sending;active.unmount();
});

function durableStoreFixture(){
 const persisted=[],requests=[],waiters=[],saved=new Map();let runNumber=0,recoveredState={status:'RUNNING'};
 const original=draftConversation(),other=draftConversation(12);
 const request={get:async path=>{
  requests.push(['get',path]);
  if(path==='/chat/conversations')return[original,other];
  if(path.startsWith('/chat/runs/'))return recoveredState;
  return saved.get(Number(path.split('/')[3]))||[];
 },post:async(path,input)=>{requests.push(['post',path,input]);return{id:'run-'+(++runNumber),status:'RUNNING'};},delete:async path=>requests.push(['delete',path])};
 const storage={getItem:()=>null,setItem:(...args)=>persisted.push(args),removeItem(){}};
 const navigationModule={exports:{}};
 new Function('module','exports',ts.transpileModule(readFileSync(join(__dirname,'../src/utils/chat-navigation.ts'),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(navigationModule,navigationModule.exports);
 const imports={pinia:{defineStore:(_name,setup)=>()=>vue.reactive(setup())},vue, '@/utils/request':request,
  '@/utils/chat-stream':{watchChatRun:(_id,_signal,onDelta,onProgress)=>{const wait=deferred();waiters.push({...wait,onDelta,onProgress});return wait.promise;}},
  '@/utils/local-workspace':{disconnectLocalWorkspace(){}},'@/utils/chat-navigation':navigationModule.exports,
  '@/utils/chat-files':load(request),'@/utils/chat-model-selection':{selectedChatModel:()=> 'fixture-model'},
  '@/utils/roleplay-defaults':roleplayDefaultsModule.exports};
 const mod={exports:{}},code=ts.transpileModule(readFileSync(join(__dirname,'../src/stores/chat.ts'),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 new Function('require','module','exports','localStorage','sessionStorage',code)(name=>{
  if(Object.hasOwn(imports,name))return imports[name];throw Error(name);
 },mod,mod.exports,storage,storage);
 const store=mod.exports.useChatStore();store.conversations=[original,other];store.currentConversation=original;
 return{store,original,other,requests,persisted,waiters,saved,setState:value=>{recoveredState=value;}};
}

test('failed durable task retains its question, attachments, error and elapsed time across conversation reloads without persisting history',async()=>{
 const f=durableStoreFixture(),sending=f.store.sendConfigured(failed.text,'normal',[],undefined,undefined,undefined,undefined,undefined,{files:[attachment]});
 await tick();assert.equal(f.waiters.length,1);
 let visible;const stop=vue.watchEffect(()=>{const reply=f.store.messages.at(-1);visible={elapsed:reply?.ragMetadata?.performance?.elapsedMs,content:reply?.content};});
 f.waiters[0].onProgress({elapsedMs:205123});f.waiters[0].onDelta('Unfinished public answer');await vue.nextTick();
 assert.deepEqual(visible,{elapsed:205123,content:'Unfinished public answer'},'Streaming callbacks must update the reactive UI');stop();
 f.waiters[0].resolve({status:'FAILED',error:'Generic failure',result:{failure:{code:'MODEL_REQUEST_TIMEOUT',message:'模型等待超时，请重新发送'}}});
 assert.equal(await sending,false);
 assert.equal(f.store.messages.length,2);assert.equal(f.store.messages[0].content,failed.text);
 assert.deepEqual(f.store.messages[0].ragMetadata.messageAttachments,[attachment]);
 assert.equal(f.store.messages[1].failure.message,'模型等待超时，请重新发送');
 assert.equal(f.store.messages[1].failure.elapsedMs,205123);assert.equal(f.store.messages[1].failure.retryable,true);
 assert(f.store.messages.every(message=>message.localAttempt&&!message.pending));
 await f.store.selectConversation(f.other);assert.deepEqual(f.store.messages,[]);
 await f.store.selectConversation(f.original);assert.equal(f.store.messages.length,2);
 assert.equal(f.requests.filter(([method,path])=>method==='post'&&path==='/chat/runs').length,1,'No automatic paid retry');
 assert(f.persisted.every(([,value])=>!String(value).includes(failed.text)),'Failed question does not enter browser persistence');
 assert.equal(f.saved.size,0,'No server message write for a failed answer');
});

test('explicit new send replaces a local failure and completed server history replaces pending state once',async()=>{
 const f=durableStoreFixture(),one=f.store.sendMessage('First failed question');await tick();
 f.waiters[0].resolve({status:'FAILED',error:'Synthetic failure'});await one;
 const next=f.store.sendMessage('Explicit retry');await tick();
 assert.equal(f.store.messages.length,2);assert.equal(f.store.messages[0].content,'Explicit retry');
 assert.equal(Object.keys(f.store.failedAttempts).length,0);
 f.saved.set(11,[{id:101,role:'USER',content:'Explicit retry',conversationId:11},{id:102,role:'ASSISTANT',content:'Done',conversationId:11}]);
 f.waiters[1].resolve({status:'COMPLETED',result:{content:'Done'}});assert.equal(await next,true);
 assert.deepEqual(f.store.messages.map(message=>message.id),[101,102]);
 assert(f.store.messages.every(message=>!message.localAttempt&&!message.failure));
});

test('transport failure checks the existing durable run and cannot offer a duplicate paid retry while it is still running',async()=>{
 const f=durableStoreFixture(),sending=f.store.sendMessage('Network interrupted question');await tick();
 f.waiters[0].reject(Error('SSE disconnected'));assert.equal(await sending,false);
 assert.equal(f.store.messages.length,2);assert.equal(f.store.messages[1].failure.retryable,false);
 assert.match(f.store.messages[1].failure.message,/可能仍在生成/);
 assert(f.requests.some(([method,path])=>method==='get'&&path==='/chat/runs/run-1'));
 assert.equal(f.requests.filter(([method])=>method==='post').length,1);
 f.saved.set(11,[{id:91,role:'USER',content:'Network interrupted question',conversationId:11},{id:92,role:'ASSISTANT',content:'Finished after disconnect',conversationId:11}]);
 f.setState({status:'COMPLETED',result:{content:'Finished after disconnect'}});
 await f.store.selectConversation(f.other);await f.store.selectConversation(f.original);
 assert.deepEqual(f.store.messages.map(message=>message.id),[91,92]);assert.equal(Object.keys(f.store.failedAttempts).length,0);
 const g=durableStoreFixture(),recovery=g.store.sendMessage('Completed while disconnected');await tick();
 g.saved.set(11,[{id:1,role:'USER',content:'Completed while disconnected',conversationId:11},{id:2,role:'ASSISTANT',content:'Recovered result',conversationId:11}]);
 g.setState({status:'COMPLETED',result:{content:'Recovered result'}});g.waiters[0].reject(Error('SSE disconnected'));
 assert.equal(await recovery,true);assert.equal(g.store.messages[1].content,'Recovered result');assert.equal(Object.keys(g.store.failedAttempts).length,0);
});

test('late failed run from an expired account epoch cannot remove the new account pending answer or reintroduce old question',async()=>{
 const f=durableStoreFixture(),old=f.store.sendMessage('Old account question');await tick();
 f.store.resetForUser();const replacement=draftConversation(21,8);f.store.conversations=[replacement];f.store.currentConversation=replacement;
 const next=f.store.sendMessage('New account question');await tick();assert.equal(f.store.isStreaming,true);
 f.waiters[0].resolve({status:'FAILED',error:'Old session failed'});await old;
 assert.equal(f.store.isStreaming,true);assert.equal(f.store.messages[0].content,'New account question');assert.equal(f.store.messages[1].pending,true);
 assert.deepEqual(Object.keys(f.store.failedAttempts),[]);f.waiters[1].resolve({status:'CANCELLED'});await next;
 assert.equal(f.store.messages[1].failure.cancelled,true);assert.equal(f.store.messages[1].failure.retryable,true);
 f.store.dismissFailedAttempt(21);assert.deepEqual(f.store.messages,[]);
});
