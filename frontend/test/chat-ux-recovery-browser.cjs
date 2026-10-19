// Synthetic UI acceptance only: all APIs (including run/file writes) are intercepted.
// Never send real chats, attachments, model calls, login or mail requests.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const base = (process.env.CHAT_UX_TEST_BASE || 'http://127.0.0.1:4190/').replace(/\/?$/, '/');
const origin = new URL(base).origin;
assert(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const output = join(__dirname, '../../.local/chat-ux-review'); mkdirSync(output, { recursive: true });
const testKinds = (process.env.CHAT_UX_TEST_KINDS || 'ASSISTANT,ROLEPLAY').split(',');
assert(testKinds.length && testKinds.every(kind => ['ASSISTANT', 'ROLEPLAY'].includes(kind)));
const viewer = { id: 99231, username: '虚构体验测试', email: 'synthetic@example.test', role: 'USER' };
const conversations = [
  { id: 12001, title: '合成普通对话', conversationType: 'ASSISTANT' },
  { id: 12002, title: '合成角色对话', conversationType: 'ROLEPLAY', personaKey: 'kato_megumi_persona', personaLabel: '加藤惠' },
].map(row => ({ ...row, userId: viewer.id, updatedAt: '2026-10-19T01:00:00Z' }));
const gate = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
// Element Plus exposes a zero-size native switch input for AT/keyboard and a
// visible clickable parent track. Exercise that visible track, not force-click.
const toggleSwitch = locator => locator.locator('..').click();
const waitForPopoverPaint = page => page.waitForFunction(() => {
  const popover = document.querySelector('.answer-preferences-popover');
  return popover && getComputedStyle(popover).opacity === '1' &&
    popover.getAnimations().every(animation => animation.playState !== 'running');
});
const performance = phase => ({ stage: phase === 'completed' ? 'completed' : phase === 'verifying' ? 'verifying' : 'generating',
  phase, elapsedMs: 47000, phaseElapsedMs: 45000, firstTokenMs: null, queueMs: 200,
  modelCalls: 2, activeModelCalls: phase === 'completed' ? 0 : 1, stages: [], phases: [
    { phase: 'queued', durationMs: 200, modelCalls: 0 }, { phase: 'context', durationMs: 1800, modelCalls: 0 },
    { phase, durationMs: 45000, modelCalls: 2 },
  ], reasoning_content: 'PRIVATE_REASONING_MUST_NOT_APPEAR', prompt: 'PRIVATE_PROMPT_MUST_NOT_APPEAR' });

async function fixture(browser, width, kind, libraryMode = 'ready') {
  const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: width <= 900, hasTouch: width <= 900, reducedMotion: 'reduce' });
  page.setDefaultTimeout(12000);
  const state = { messages: [], files: [], writes: [], calls: [], errors: [], runs: [], nextOutcome: 'success', library: gate() };
  const cid = kind === 'ROLEPLAY' ? 12002 : 12001;
  page.on('pageerror', error => state.errors.push(error.message));
  await page.addInitScript(viewer => {
    localStorage.setItem('chatforum-user', JSON.stringify({ user: viewer, token: 'synthetic-ux-only', refreshToken: '' }));
    localStorage.setItem('chatforum-chat', JSON.stringify({ conversationSettings: {
      12001: { agentMode: 'normal', knowledgeBaseId: 0 },
      12002: { selectedPersona: 'kato_megumi_persona', agentMode: 'agent', knowledgeBaseId: 73, deepThinking: true, webSearch: true },
    } }));
  }, viewer);
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method();
    if (!path.startsWith('/api/')) return url.origin === origin ? route.continue() : route.abort();
    state.calls.push({ path, method });
    const headers = { 'Access-Control-Allow-Origin': origin };
    const json = (data, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify({ success: status < 400, data }) });
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...headers, 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
    if (path === '/api/chat/config') return json({ configured: true, defaultModelId: 'qwen3.8-max', models: [{ id: 'qwen3.8-max', label: 'Qwen3.8-Max', available: true }] });
    if (path === '/api/chat/conversations') return json(conversations);
    if (/\/chat\/conversations\/\d+\/messages$/.test(path)) return json(state.messages);
    if (path === '/api/rag/knowledge-bases') {
      if (libraryMode === 'slow') await state.library.promise;
      return json([{ id: 73, name: '路人女主 · 加藤惠的原作记忆', permission: 'READER',
        chatReady: libraryMode !== 'unavailable', activeIndexVersion: 1,
        ...(libraryMode === 'unavailable' ? { chatUnavailableReason: '合成知识库尚未准备好，请稍后重试。' } : {}) }]);
    }
    if (path.includes('unread-count')) return json({ unreadCount: 0, inbox: 0, requests: 0, total: 0 });
    if (/^\/api\/coding\/\d+$/.test(path)) return json({ files: state.files, changes: [] });
    if (/^\/api\/coding\/\d+\/files$/.test(path) && method === 'POST') {
      const body = request.postDataJSON();
      state.files.push(...body.files.map((file, index) => ({ id: 700 + index, path: file.path, kind: 'text', revision: 1, bytes: Buffer.byteLength(file.content) })));
      return json({ files: state.files });
    }
    if (path === '/api/chat/runs' && method === 'POST') {
      const input = request.postDataJSON(), run = { id: 'synthetic-ux-' + (state.runs.length + 1), input,
        outcome: state.nextOutcome, status: 'RUNNING', reads: 0, finish: gate() };
      state.runs.push(run); state.writes.push(input); return json({ id: run.id, status: run.status });
    }
    const run = state.runs.find(item => path.startsWith('/api/chat/runs/' + item.id));
    if (run && method === 'DELETE') { run.status = 'CANCELLED'; run.finish.resolve(); return json({ id: run.id, status: run.status }); }
    if (run && path.endsWith('/events')) {
      const sse = body => route.fulfill({ contentType: 'text/event-stream', headers, body }).catch(() => undefined);
      if (!run.reads++) return sse('event: progress\ndata: ' + JSON.stringify(performance(kind === 'ROLEPLAY' ? 'verifying' : 'generating')) + '\n\n');
      await run.finish.promise;
      if (run.status === 'CANCELLED') return sse('event: terminal\ndata: {"status":"CANCELLED"}\n\n');
      if (run.outcome === 'failure') {
        run.status = 'FAILED'; return sse('event: terminal\ndata: ' + JSON.stringify({ status: 'FAILED', error: '合成模型服务暂时不可用，请稍后重试。',
          result: { failure: { code: 'MODEL_REQUEST_TIMEOUT', message: '合成模型等待超时，请重新发送。' } } }) + '\n\n');
      }
      run.status = 'COMPLETED';
      const content = kind === 'ROLEPLAY' ? '嗯，那就随便聊聊吧。你今天有没有碰到什么有意思的事？' : '联网暂时不可用，本轮没有获取到新的公开资料。';
      const metadata = { state: kind === 'ROLEPLAY' ? 'roleplay' : 'general', performance: performance('completed'),
        responseOptions: { deepThinking: kind === 'ASSISTANT', webSearch: kind === 'ASSISTANT' },
        ...(kind === 'ASSISTANT' ? { webSearch: { enabled: true, sources: [], failure: 'SEARCH_UNAVAILABLE' } } : {}) };
      state.messages.push({ id: state.messages.length + 1, role: 'USER', conversationId: cid, content: run.input.question },
        { id: state.messages.length + 2, role: 'ASSISTANT', conversationId: cid, content, ragMetadata: metadata });
      return sse('event: delta\ndata: ' + JSON.stringify({ text: content, offset: content.length }) + '\n\nevent: complete\ndata: ' +
        JSON.stringify({ status: 'COMPLETED', result: { content, ragMetadata: metadata } }) + '\n\n');
    }
    if (run) return json({ id: run.id, status: run.status });
    if (method !== 'GET') throw Error('Unexpected synthetic write: ' + method + ' ' + path);
    return json([]);
  });
  await page.goto(base + 'chat'); await page.locator('.chat-layout').waitFor();
  const waitSelected = id => page.waitForFunction(id => {
    const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('chat');
    return store?.currentConversation?.id === id && !store.isLoadingConversation;
  }, id);
  await waitSelected(12001);
  if (kind === 'ROLEPLAY') {
    if (width <= 900) await page.getByRole('button', { name: '对话列表', exact: true }).click();
    await page.getByRole('tab', { name: '角色对话', exact: true }).click();
    await page.locator('.conversation-item').filter({ hasText: '合成角色对话' }).click();
    await waitSelected(12002);
  }
  const textbox = page.locator('.chat-textarea textarea');
  const busy = value => page.waitForFunction(value => document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('chat').isStreaming === value, value);
  const capture = async name => {
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal page overflow');
    assert(!(await page.locator('body').innerText()).includes('PRIVATE_'), 'No raw reasoning/system text in UI');
    await page.screenshot({ path: join(output, `${name}-${kind.toLowerCase()}-${width}.png`), fullPage: true });
  };
  const openSettings = async () => {
    if (width > 900) await page.locator('.btn-settings').click();
    else if (kind === 'ASSISTANT') await page.getByRole('button', { name: '模型设置', exact: true }).filter({ visible: true }).first().click();
    else {
      await page.getByRole('button', { name: '对话选项', exact: true }).click();
      await page.locator('.chat-toolbar').getByRole('button', { name: '设置', exact: true }).click();
    }
    await page.locator('.settings-drawer').waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const drawer = document.querySelector('.settings-drawer'); if (!drawer) return false;
      const box = drawer.getBoundingClientRect(); return box.left >= -1 && box.right <= innerWidth + 1;
    });
  };
  const closeSettings = async () => {
    await page.locator('.settings-drawer .el-drawer__close-btn').click();
    await page.locator('.settings-drawer').waitFor({ state: 'hidden' });
    const closeOptions = page.getByRole('button', { name: '收起对话选项', exact: true });
    if (await closeOptions.isVisible()) await closeOptions.click();
  };
  return { page, state, cid, textbox, busy, capture, openSettings, closeSettings,
    close: async () => { state.library.resolve(); state.runs.forEach(run => run.finish.resolve()); await page.close(); } };
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const width of [320, 390, 1440]) for (const kind of testKinds) {
      const f = await fixture(browser, width, kind);
      try {
        const { page, state, textbox, busy, capture, openSettings, closeSettings } = f;
        assert.equal(await page.locator('.chat-input-area .response-options,.assistant-welcome .response-options').count(), 0, 'No thinking/search controls in either composer');
        await openSettings();
        assert.equal(await page.locator('.settings-drawer .model-help,.settings-drawer .response-setting-row p,.assistant-footnote').count(), 0, 'No fixed explanatory copy remains in settings or below the composer');
        const deep = page.getByRole('switch', { name: '深度思考', exact: true }), web = page.getByRole('switch', { name: '联网搜索', exact: true });
        if (kind === 'ASSISTANT') assert.equal(await deep.getAttribute('aria-checked'), 'true');
        else assert.equal(await deep.count(), 0, 'Roleplay has no deep-thinking toggle');
        if (kind === 'ASSISTANT') {
          assert.equal(await web.getAttribute('aria-checked'), 'false');
          assert(!state.calls.some(call => call.path === '/api/rag/knowledge-bases'));
          await toggleSwitch(web);
        } else assert.equal(await web.count(), 0, 'Roleplay has no web-search toggle, including stale saved true options');
        await capture('settings-drawer'); await closeSettings();
        const preferences = page.getByRole('button', { name: '回答设置', exact: true });
        if (kind === 'ASSISTANT') {
          assert.equal(await preferences.count(), 1);
          assert.equal(await preferences.locator('svg').count(), 1, 'Icon-only mobile preference trigger must render its icon');
          await preferences.focus(); await page.keyboard.press('Enter');
          const panel = page.getByRole('group', { name: '本次会话的回答设置', exact: true }); await panel.waitFor(); await waitForPopoverPaint(page);
          assert.equal(await panel.locator('.preferences-heading,.preference-row small').count(), 0, 'Popover keeps functional switches without repeated captions');
          assert.equal(await panel.getByRole('switch', { name: '联网搜索', exact: true }).getAttribute('aria-checked'), 'true', 'Popover and drawer share confirmed options');
          await toggleSwitch(panel.getByRole('switch', { name: '深度思考', exact: true }));
          assert.equal(await panel.getByRole('switch', { name: '深度思考', exact: true }).getAttribute('aria-checked'), 'false');
          await toggleSwitch(panel.getByRole('switch', { name: '深度思考', exact: true }));
          const popover = page.locator('.answer-preferences-popover');
          const bounds = await popover.boundingBox();
          assert(bounds && bounds.x >= -1 && bounds.x + bounds.width <= width + 1, 'Preference popover stays horizontally in viewport');
          await capture('answer-preferences-popover'); await preferences.click(); await panel.waitFor({ state: 'hidden' });
        } else assert.equal(await preferences.count(), 0, 'Roleplay never displays assistant deep-thinking popover');
        await textbox.fill(kind === 'ROLEPLAY' ? '惠，今天想聊点轻松的话题。' : '看看今天的校园公告吧。');
        await page.getByRole('button', { name: '发送消息', exact: true }).click();
        const process = page.locator('details.generation-process').last();
        await process.locator('.process-elapsed').waitFor(); await process.locator('summary').click();
        await process.locator('.process-body').waitFor();
        assert.equal(await page.locator('.typing-indicator').count(), 1);
        const stop = page.getByRole('button', { name: '停止生成', exact: true }), stopBox = await stop.boundingBox();
        assert(stopBox && stopBox.x >= 0 && stopBox.x + stopBox.width <= width + 1 && stopBox.y + stopBox.height <= 844, 'Stop stays inside viewport');
        await capture('expanded-pending');
        await openSettings();
        if (kind === 'ASSISTANT') { assert(await web.isDisabled()); assert(await deep.isDisabled()); }
        else { assert.equal(await deep.count(), 0); assert.equal(await web.count(), 0); }
        await closeSettings();
        state.runs.at(-1).finish.resolve(); await busy(false);
        if (kind === 'ASSISTANT') await page.getByText('联网搜索暂不可用', { exact: true }).waitFor();
        else {
          await page.getByText('嗯，那就随便聊聊吧。你今天有没有碰到什么有意思的事？', { exact: true }).waitFor();
          assert.equal(await page.getByText('联网搜索暂不可用', { exact: true }).count(), 0, 'Roleplay has no search failure state');
          assert(!state.messages.at(-1).ragMetadata.webSearch, 'Roleplay response metadata has no search status');
        }
        await openSettings();
        if (kind === 'ASSISTANT') { assert.equal(await web.isDisabled(), false); assert.equal(await deep.isDisabled(), false); }
        else assert.equal(await web.count(), 0);
        await closeSettings();
        assert.equal(state.writes[0].deepThinking, kind === 'ASSISTANT'); assert.equal(state.writes[0].webSearch, kind === 'ASSISTANT');
        assert.equal(state.writes[0].mode, kind === 'ASSISTANT' ? 'normal' : 'agent');
        assert(!state.writes[0].enabledSkills.includes('web_search'));
        assert.equal(state.writes[0].knowledgeBaseId || 0, kind === 'ROLEPLAY' ? 73 : 0);
        await capture(kind === 'ASSISTANT' ? 'search-unavailable' : 'roleplay-natural-dialogue');

        if (kind === 'ASSISTANT') {
          await page.locator('.assistant-composer input[type=file]').setInputFiles({ name: '合成附件.txt', mimeType: 'text/plain', buffer: Buffer.from('synthetic attachment only') });
          await page.getByRole('button', { name: '移除待发送附件 合成附件.txt', exact: true }).waitFor();
        }
        const failedQuestion = '这条合成消息失败后应该恢复到输入框。';
        state.nextOutcome = 'failure'; await textbox.fill(failedQuestion);
        await page.getByRole('button', { name: '发送消息', exact: true }).click();
        await page.getByRole('button', { name: '停止生成', exact: true }).waitFor();
        if (kind === 'ASSISTANT') assert.equal(await page.locator('.attachment-chip').count(), 0, 'Accepted files leave pending composer');
        state.runs.at(-1).finish.resolve(); await busy(false);
        await page.waitForFunction(text => document.querySelector('.chat-textarea textarea')?.value === text, failedQuestion);
        if (kind === 'ASSISTANT') await page.getByRole('button', { name: '移除待发送附件 合成附件.txt', exact: true }).waitFor();
        const failure = page.locator('.generation-failure'); await failure.waitFor();
        assert.equal(await failure.locator('strong').innerText(), '回答未生成');
        assert.equal(await failure.locator('p').innerText(), '合成模型等待超时，请重新发送。');
        assert.equal(await page.locator('.chat-message.user').last().locator('.message-text').innerText(), failedQuestion, 'Failed question remains in the conversation');
        assert.equal(state.writes.length, 2, 'A terminal failure never starts another model task automatically');
        const failureBounds = await failure.boundingBox();
        assert(failureBounds && failureBounds.x >= -1 && failureBounds.x + failureBounds.width <= width + 1, 'Failure card stays inside the viewport');
        assert.equal(await page.locator('.typing-indicator').count(), 0); await capture('failure-draft-restored');

        state.nextOutcome = 'success'; await failure.getByRole('button', { name: '重新发送', exact: true }).click();
        await page.getByRole('button', { name: '停止生成', exact: true }).waitFor();
        await page.getByRole('button', { name: '停止生成', exact: true }).click(); await busy(false);
        await page.waitForFunction(text => document.querySelector('.chat-textarea textarea')?.value === text, failedQuestion);
        if (kind === 'ASSISTANT') await page.getByRole('button', { name: '移除待发送附件 合成附件.txt', exact: true }).waitFor();
        assert.equal(await page.locator('.generation-failure strong').innerText(), '已停止生成');
        assert.equal(state.writes.length, 3, 'Failure/cancel must not silently resubmit a paid task');
        assert.equal(await page.locator('.typing-indicator').count(), 0); await capture('cancel-draft-restored');
        if (width === 320 && kind === 'ASSISTANT') {
          await page.setViewportSize({ width, height: 480 }); await textbox.focus();
          const sendBounds = await page.getByRole('button', { name: '发送消息', exact: true }).boundingBox();
          assert(sendBounds && sendBounds.y + sendBounds.height <= 480, 'Composer send remains reachable with short keyboard viewport');
          await capture('keyboard-composer');
          await preferences.click(); await page.getByRole('group', { name: '本次会话的回答设置', exact: true }).waitFor(); await waitForPopoverPaint(page);
          const popover = await page.locator('.answer-preferences-popover').boundingBox();
          assert(popover && popover.x >= -1 && popover.x + popover.width <= width + 1 && popover.y >= -1 && popover.y + popover.height <= 481,
            'Preference popover fits the narrow keyboard viewport');
          await capture('keyboard-preferences-popover');
        }
        assert.deepEqual(state.errors, []);
        console.log(`PASS ${width}px ${kind}: real pending expansion, safe telemetry, normal/Agent flags, ${kind === 'ASSISTANT' ? 'search error' : 'natural synthetic dialogue without search controls/status'}, failure/cancel text + attachment recovery, no overflow`);
      } catch (error) {
        await f.capture('unexpected-failure');
        console.error('Synthetic UI errors:', f.state.errors);
        throw error;
      } finally { await f.close(); }
    }
    for (const libraryMode of testKinds.includes('ROLEPLAY') ? ['slow', 'unavailable'] : []) {
      const f = await fixture(browser, 390, 'ROLEPLAY', libraryMode);
      try {
        if (libraryMode === 'unavailable') {
          await f.page.getByRole('button', { name: '对话选项', exact: true }).click();
          await f.page.locator('.knowledge-notice').filter({ hasText: '合成知识库尚未准备好，请稍后重试。' }).waitFor();
          await f.capture('library-unavailable-options');
          await f.page.getByRole('button', { name: '收起对话选项', exact: true }).click();
        }
        await f.textbox.fill('想问问小说里的一件事。');
        await f.page.getByRole('button', { name: '发送消息', exact: true }).click();
        await f.page.waitForTimeout(150);
        if (libraryMode === 'unavailable') {
          assert.equal(f.state.writes.length, 0, 'Unavailable KB cannot silently run without it');
          assert.equal(await f.textbox.inputValue(), '想问问小说里的一件事。');
        } else assert(f.state.writes.every(write => write.knowledgeBaseId === 73), 'Known KB is never silently dropped while list reloads');
        await f.capture('library-' + libraryMode);
        assert.deepEqual(f.state.errors, []);
        console.log(`PASS 390px ROLEPLAY ${libraryMode} KB: ${libraryMode === 'unavailable' ? 'explicit blocked send, original draft retained, no model task' : 'known KB remains in any admitted task, no silent downgrade'}`);
      } finally { await f.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
