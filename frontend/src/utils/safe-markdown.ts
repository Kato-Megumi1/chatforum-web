import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { resolveForumLinks } from './forum-links';

// Untrusted replies, tool output and legacy posts are prose, not UI. In
// particular, removing style *attributes* alone does not stop <style> rules
// from hiding or impersonating controls elsewhere in the document.
const proseTags = [
  'a', 'p', 'br', 'strong', 'em', 'b', 'i', 's', 'del', 'u', 'blockquote',
  'pre', 'code', 'kbd', 'ul', 'ol', 'li', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'div', 'span',
];

export function renderSafeMarkdown(
  content: string,
  resolve: (path: string) => string,
  options: { allowImages?: boolean } = {},
): string {
  const safe = DOMPurify.sanitize(marked.parse(content, { async: false }) as string, {
    ALLOWED_TAGS: options.allowImages ? [...proseTags, 'img'] : proseTags,
    ALLOWED_ATTR: ['href', 'title', 'alt', 'src', 'start', 'colspan', 'rowspan'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    FORBID_TAGS: ['style', 'script', 'svg', 'math', 'template', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'select', 'textarea', 'link', 'meta', 'base'],
    FORBID_ATTR: ['style', 'id', 'name', 'class', 'data-forum-post-path'],
    SANITIZE_DOM: true,
    SANITIZE_NAMED_PROPS: true,
  });
  // Only this trusted helper may add our router's data attribute after cleaning.
  return resolveForumLinks(safe, resolve);
}
