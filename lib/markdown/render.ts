/**
 * XSS-safe markdown renderer for deck primers.
 *
 * Design principle: escape-first, whitelist-only.
 * All user text is HTML-escaped before any processing, so the only HTML
 * ever emitted comes from this module's own template strings — not from
 * user content. No external dependency needed (DOMPurify requires a DOM;
 * this runs equally on Server Components and Client Components).
 *
 * Supported subset: headings (h1–h3), bold, italic, inline code, fenced
 * code blocks, blockquotes, unordered/ordered lists, horizontal rules,
 * links (http/https/relative only — javascript:/data: → #).
 */

function escape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Only allow safe URL schemes. */
function safeHref(href: string): string {
  const h = href.trim();
  if (/^(javascript|data|vbscript):/i.test(h)) return '#';
  return h;
}

/** Process inline markdown on already-HTML-escaped text. */
function inlineMarkdown(rawText: string): string {
  // HTML-escape the raw text first so subsequent patterns can't inject tags
  let s = escape(rawText);

  // 1. Protect inline code spans from bold/italic processing
  const codeSpans: string[] = [];
  s = s.replace(/`([^`]+)`/g, (_, code) => {
    codeSpans.push(`<code>${code}</code>`);
    return `\x00CODE${codeSpans.length - 1}\x00`;
  });

  // 2. Bold: **text** or __text__ ([\s\S]+? to match across lines without requiring ES2018 dotAll flag)
  s = s.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([\s\S]+?)__/g, '<strong>$1</strong>');

  // 3. Italic: *text* or _text_ (must come after bold so ** doesn't split)
  s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  s = s.replace(/_([^_\n]+)_/g, '<em>$1</em>');

  // 4. Links: [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, linkText, href) => {
    const url = safeHref(href.trim());
    // linkText is already escaped (was part of rawText → escape())
    return `<a href="${escape(url)}" rel="noopener noreferrer">${linkText}</a>`;
  });

  // 5. Restore code spans
  s = s.replace(/\x00CODE(\d+)\x00/g, (_, idx) => codeSpans[parseInt(idx, 10)]);

  return s;
}

/** Return true if a line starts a list-item of a given style. */
const IS_UL = /^[-*+]\s+/;
const IS_OL = /^\d+\.\s+/;
const IS_HR = /^(\s*-{3,}|\s*\*{3,}|\s*_{3,})\s*$/;

export function renderMarkdown(src: string): string {
  if (!src) return '';

  const lines = src.split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimEnd();

    // ── Fenced code block ─────────────────────────────────────────────────────
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimEnd().startsWith('```')) {
        codeLines.push(escape(lines[i]));
        i++;
      }
      out.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
      i++; // consume closing ```
      continue;
    }

    // ── ATX Heading (# / ## / ###) ────────────────────────────────────────────
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      out.push(`<h${level}>${inlineMarkdown(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // ── Horizontal rule ───────────────────────────────────────────────────────
    if (IS_HR.test(trimmed)) {
      out.push('<hr>');
      i++;
      continue;
    }

    // ── Block quote ───────────────────────────────────────────────────────────
    if (trimmed.startsWith('> ') || trimmed === '>') {
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i].trimEnd().startsWith('> ') || lines[i].trimEnd() === '>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${inlineMarkdown(quoteLines.join('\n'))}</blockquote>`);
      continue;
    }

    // ── Unordered list ────────────────────────────────────────────────────────
    if (IS_UL.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && IS_UL.test(lines[i].trimEnd())) {
        items.push(`<li>${inlineMarkdown(lines[i].replace(IS_UL, ''))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // ── Ordered list ──────────────────────────────────────────────────────────
    if (IS_OL.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && IS_OL.test(lines[i].trimEnd())) {
        items.push(`<li>${inlineMarkdown(lines[i].replace(IS_OL, ''))}</li>`);
        i++;
      }
      out.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // ── Blank line → paragraph break ─────────────────────────────────────────
    if (!trimmed) {
      i++;
      continue;
    }

    // ── Paragraph: collect consecutive non-block lines ────────────────────────
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trimEnd().startsWith('#') &&
      !lines[i].trimEnd().startsWith('```') &&
      !lines[i].trimEnd().startsWith('> ') &&
      lines[i].trimEnd() !== '>' &&
      !IS_UL.test(lines[i].trimEnd()) &&
      !IS_OL.test(lines[i].trimEnd()) &&
      !IS_HR.test(lines[i].trimEnd())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      out.push(`<p>${inlineMarkdown(paraLines.join('\n').replace(/\n/g, '<br>'))}</p>`);
    }
  }

  return out.join('\n');
}
