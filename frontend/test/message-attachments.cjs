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
function chatRecoveryFixture({acceptImmediately=true}={}){
 let epoch=3,admission;
 const run=deferred(),errors=[],request={get:async path=>path.startsWith('/coding/')?{files:[attachment]}:[]};
 const store=vue.reactive({currentConversation:draftConversation(),conversations:[draftConversation()],navigation:{userId:7,space:'ASSISTANT',conversationId:11,scroll:{}},
  messages:[],drafts:{},draftAttachments:{11:[{...attachment}]},isStreaming:false,isLoadingConversation:false,
  llmConfig:{models:[{id:'fixture-model',available:true}],defaultModelId:'fixture-model'},
  initializeNavigation(){},setSpace(space){this.navigation.space=space;},selectedModelId(){return'fixture-model';},
  getConversationSettings(){return{agentMode:'normal',knowledgeBaseId:0,codingEnabled:false};},saveConversationSettings(){},
  saveView(id,scroll,draft){this.drafts[id]=draft;},loadDefaultConfig:async()=>{},loadConversations:async()=>{},
  async selectConversation(conversation){this.currentConversation=conversation;},clearSelection(){this.currentConversation=null;},
  sendConfigured(...args){this.isStreaming=true;admission=args[8]?.onAccepted;if(acceptImmediately)admission?.();return run.promise.finally(()=>{this.isStreaming=false;});},
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
   '@/utils/forum-links':{},marked:{marked:{}},dompurify:{},dayjs:()=>({format:()=>''}),
  };
  const script=readFileSync(join(__dirname,'../src/views/Chat.vue'),'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const code=ts.transpileModule(script+'\nexport {handleSendMessage,inputText};',{
   compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const mod={exports:{}};
  scope.run(()=>new Function('require','module','exports','window',code)(name=>{
   if(Object.hasOwn(imports,name))return imports[name];
   if(name.endsWith('.vue'))return{};
   throw Error('Unexpected Chat.vue import: '+name);
  },mod,mod.exports,{matchMedia:()=>({matches:false}),addEventListener(){},removeEventListener(){}}));
  return{...mod.exports,mount:async()=>{for(const fn of mounted)await fn();await tick();},unmount(){for(const fn of unmounted)fn();scope.stop();}};
 }
 return{store,user,run,errors,view,accept:()=>admission?.(),switchSession(id){epoch++;user.user=id?{id,username:'Fixture '+id}:null;store.navigation.userId=id??0;}};
}

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
