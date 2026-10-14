const {test}=require('node:test'),assert=require('node:assert/strict'),{readFileSync}=require('node:fs'),{join}=require('node:path'),ts=require('typescript');
function fixture(){
 const actions=[],messages=[];let rejected;
 const store={token:'another-account-token',refreshToken:'another-account-refresh',clearAuth:()=>actions.push('clear'),setToken:(...args)=>actions.push(['token',...args]),setUser:()=>actions.push('user')};
 const http=config=>{actions.push(['retry',config.url]);return Promise.resolve('retried');};
 http.interceptors={request:{use(){}},response:{use(_fulfilled,error){rejected=error;}}};
 const axios={create:()=>http,post:async()=>{actions.push('refresh');return{data:{success:true,data:{accessToken:'rotated',refreshToken:'next-refresh'}}};}};
 const mod={exports:{}},code=ts.transpileModule(readFileSync(join(__dirname,'../src/utils/request.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(name=>{
  if(name==='axios')return axios;if(name==='./api')return{API_BASE:'/api',apiUrl:p=>'/api'+p,normalizeMedia:v=>v};
  if(name==='element-plus')return{ElMessage:{error:message=>messages.push(message)}};
  if(name==='@/stores/user')return{useUserStore:()=>store};throw Error(name);
 },mod,mod.exports);return{rejected,actions,messages};
}
test('incorrect login credentials never rotate or clear a separately stored session',async()=>{
 const f=fixture(),error={config:{url:'/auth/login'},response:{status:401,data:{message:'Invalid credentials'}}};
 await assert.rejects(f.rejected(error),e=>e===error);assert.deepEqual(f.actions,[]);assert.deepEqual(f.messages,['邮箱或密码不正确']);
});
test('protected API still refreshes and retries on401; registration errors keep stored authentication',async()=>{
 const f=fixture();assert.equal(await f.rejected({config:{url:'/forum/me/posts',headers:{}},response:{status:401,data:{}}}),'retried');
 assert.deepEqual(f.actions,['refresh',['token','rotated','next-refresh'],['retry','/forum/me/posts']]);assert.deepEqual(f.messages,[]);
 const g=fixture(),error={config:{url:'/auth/register'},response:{status:409,data:{message:'邮箱、用户名或手机号已被使用'}}};
 await assert.rejects(g.rejected(error),e=>e===error);assert.deepEqual(g.actions,[]);
});
