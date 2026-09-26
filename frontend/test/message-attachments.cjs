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
