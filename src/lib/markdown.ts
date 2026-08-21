import { Marked, type Tokens } from 'marked';

/**
 * Markdown to HTML for the CMS.
 *
 * The editor is reachable by anyone with an admin account, and whatever it
 * produces is served from this site's own origin — so the two ways markdown
 * can smuggle script through are closed here rather than trusted:
 *
 *   1. **Raw HTML is escaped, not passed through.** marked emits it verbatim
 *      by default. A marketing page needs headings, links and lists; it does
 *      not need a script tag.
 *   2. **Link and image URLs are limited to safe schemes.** `[click](javascript:alert(1))`
 *      is valid markdown and marked renders it as-is, which is a stored XSS
 *      with no HTML involved at all.
 *
 * Sanitising the rendered output instead would mean running a DOM
 * implementation on the server for a feature nobody asked for.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Anything that is not plainly a document reference is dropped.
 *
 * An allow-list, not a block-list: `javascript:` has enough spellings
 * (whitespace, entities, mixed case) that enumerating them is a losing game.
 */
function safeUrl(href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed) return null;

  // Relative paths, anchors and query-only links are always fine.
  if (/^[/#?]/.test(trimmed) || /^\.{1,2}\//.test(trimmed)) return trimmed;

  // Strip whitespace before looking for a scheme, so "java\tscript:" cannot
  // hide one from this check while the browser still honours it.
  const collapsed = trimmed.replace(/\s/g, '');
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(collapsed);
  if (!scheme) return trimmed; // schemeless, e.g. "about.html"

  return ['http', 'https', 'mailto', 'tel'].includes(scheme[1].toLowerCase()) ? trimmed : null;
}

const marked = new Marked({ gfm: true, breaks: false });

marked.use({
  renderer: {
    html(token: Tokens.HTML | Tokens.Tag) {
      // Block-level raw HTML becomes its own paragraph; inline raw HTML is
      // spliced into the surrounding one, so wrapping it would nest <p> tags.
      const text = escapeHtml(token.text);
      return token.block ? `<p>${text}</p>` : text;
    },

    link(token: Tokens.Link) {
      const href = safeUrl(token.href);
      const text = this.parser.parseInline(token.tokens);
      // A blocked link keeps its text and loses its destination, so the copy
      // still reads correctly.
      if (!href) return text;
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
      // Editor-authored links point off-site more often than not; noopener
      // costs nothing and closes window.opener access.
      const rel = /^https?:/i.test(href) ? ' rel="noopener noreferrer"' : '';
      return `<a href="${escapeHtml(href)}"${title}${rel}>${text}</a>`;
    },

    image(token: Tokens.Image) {
      const src = safeUrl(token.href);
      if (!src) return escapeHtml(token.text);
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
      return `<img src="${escapeHtml(src)}" alt="${escapeHtml(token.text)}"${title} loading="lazy" />`;
    },
  },
});

export function renderMarkdown(source: string): string {
  return marked.parse(source, { async: false });
}

/**
 * Plain text for a meta description, taken from the body when the author has
 * not written one.
 *
 * Deliberately crude — it strips markdown punctuation rather than parsing,
 * because the result is never rendered as HTML, only truncated into a tag.
 */
export function excerptFromMarkdown(source: string, limit = 155): string {
  const text = source
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trimEnd()}…`;
}
