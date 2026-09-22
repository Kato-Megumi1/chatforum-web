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
