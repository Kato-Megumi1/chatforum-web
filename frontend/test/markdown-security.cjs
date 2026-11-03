const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const ts = require('typescript');

function fixture() {
  const calls = [], mod = { exports: {} };
  const code = ts.transpileModule(readFileSync(join(__dirname, '../src/utils/safe-markdown.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => ({
    dompurify: { sanitize: (html, options) => { calls.push({ html, options }); return 'clean-prose'; } },
    marked: { marked: { parse: value => 'parsed:' + value } },
    './forum-links': { resolveForumLinks: (html, resolve) => `${html}:${resolve('/forum/post/1')}` },
  })[name], mod, mod.exports);
  return { calls, render: mod.exports.renderSafeMarkdown };
}

test('untrusted Markdown uses a prose allowlist, not the browser DOMPurify default UI/CSS surface', () => {
  const f = fixture();
  assert.equal(f.render('fixture', path => '#' + path), 'clean-prose:#/forum/post/1');
  const { html, options } = f.calls[0];
  assert.equal(html, 'parsed:fixture');
  for (const tag of ['style', 'script', 'svg', 'math', 'iframe', 'form', 'input', 'button', 'select', 'textarea', 'link', 'meta', 'base']) {
    assert(!options.ALLOWED_TAGS.includes(tag), tag);
    assert(options.FORBID_TAGS.includes(tag), tag);
  }
  for (const attr of ['style', 'id', 'name', 'class', 'data-forum-post-path']) {
    assert(!options.ALLOWED_ATTR.includes(attr), attr);
    assert(options.FORBID_ATTR.includes(attr), attr);
  }
  assert.equal(options.ALLOW_DATA_ATTR, false);
  assert.equal(options.ALLOW_ARIA_ATTR, false);
  assert(!options.ALLOWED_TAGS.includes('img'));
  assert(options.ALLOWED_TAGS.includes('pre'));
  assert(options.ALLOWED_TAGS.includes('table'));
});

test('legacy forum images are explicit and cannot loosen a subsequent chat render', () => {
  const f = fixture();
  f.render('post', x => x, { allowImages: true });
  f.render('chat', x => x);
  assert(f.calls[0].options.ALLOWED_TAGS.includes('img'));
  assert(!f.calls[1].options.ALLOWED_TAGS.includes('img'));
});

test('chat messages/tool output and legacy forum posts share the same sanitizer entry point', () => {
  const chat = readFileSync(join(__dirname, '../src/views/Chat.vue'), 'utf8');
  const post = readFileSync(join(__dirname, '../src/views/PostDetail.vue'), 'utf8');
  assert.match(chat, /v-html="renderMarkdown\(result\)"/);
  assert.match(chat, /v-html="renderMarkdown\(getCleanContent\(msg.content\)\)"/);
  assert.match(chat, /return renderSafeMarkdown\(content,/);
  assert.match(post, /renderSafeMarkdown\(post.value\?\.content/);
  assert(!chat.includes('DOMPurify.sanitize'));
  assert(!post.includes('DOMPurify.sanitize'));
});
