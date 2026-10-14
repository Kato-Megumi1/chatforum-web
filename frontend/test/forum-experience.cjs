const {test}=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs'),{join}=require('node:path'),ts=require('typescript');
const mod={exports:{}};
const code=ts.transpileModule(readFileSync(join(__dirname,'../src/utils/forum-experience.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const entries=new Map(); const storage={getItem:key=>entries.get(key)||null,setItem:(key,val)=>entries.set(key,val)};
new Function('module','exports','sessionStorage',code)(mod,mod.exports,storage);
const {forumFilters,forumQuery,forumDraftKey,readForumNavigation,saveForumNavigation,notificationTarget}=mod.exports;
test('forum query round-trips filter state and rejects malformed pagination',()=>{
 const f=forumFilters({category:'7',q:'中文搜索',sort:'popular',period:'today',page:'3',limit:'10'});
 assert.deepEqual(forumFilters(forumQuery(f)),f);
 const invalid=forumFilters({category:'../x',tag:['2'],page:'-5',limit:'1000',sort:'random',period:'random'});
 assert.equal(invalid.page,1);assert.equal(invalid.limit,20);assert.equal(invalid.categoryId,'');assert.equal(invalid.sortBy,'createdAt');
});
test('forum navigation and drafts cannot cross accounts',()=>{
 saveForumNavigation(1,'/forum?category=7&page=3',432);assert.equal(readForumNavigation(1).scroll,432);assert.equal(readForumNavigation(2),null);
 assert.notEqual(forumDraftKey(1),forumDraftKey(2));assert.notEqual(forumDraftKey(1),forumDraftKey(1,'3'));
 saveForumNavigation(1,'https://evil.example',100);assert.equal(readForumNavigation(1),null);
});
test('notification fallback only creates numeric internal destinations',()=>{
 assert.equal(notificationTarget({postId:3,commentId:11}),'/forum/post/3?comment=11');
 assert.equal(notificationTarget({postId:'javascript:alert(1)'}),null);assert.equal(notificationTarget({actorId:7}),'/user/7');
});
