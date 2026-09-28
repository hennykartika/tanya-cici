const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

function renderInline(text) {
  // Escaping happens before any markup is added, so model output can never
  // introduce tags or attributes of its own.
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*(?!\s)([^*\n]+?)\*(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_(?!\s)([^_\n]+?)_(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>');
}

/**
 * Renders the small Markdown subset the persona is allowed to produce:
 * paragraphs, bold, italic, bullet and numbered lists. Anything else (links,
 * images, raw HTML, code blocks) is rendered as plain text on purpose - it
 * keeps the attack surface of model output at zero.
 */
export function renderMarkdown(source) {
  const lines = String(source).replace(/\r/g, '').split('\n');
  let html = '';
  let listTag = null;
  let paragraph = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    html += `<p>${paragraph.map(renderInline).join('<br>')}</p>`;
    paragraph = [];
  };
  const closeList = () => {
    if (!listTag) return;
    html += `</${listTag}>`;
    listTag = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*(\d{1,3})[.)]\s+(.*)$/);

    if (bullet) {
      flushParagraph();
      if (listTag !== 'ul') {
        closeList();
        html += '<ul>';
        listTag = 'ul';
      }
      html += `<li>${renderInline(bullet[1])}</li>`;
    } else if (numbered) {
      flushParagraph();
      if (listTag !== 'ol') {
        closeList();
        html += `<ol start="${Number(numbered[1]) || 1}">`;
        listTag = 'ol';
      }
      html += `<li>${renderInline(numbered[2])}</li>`;
    } else if (!line.trim()) {
      flushParagraph();
      closeList();
    } else {
      closeList();
      paragraph.push(line.replace(/^#{1,6}\s*/, ''));
    }
  }

  flushParagraph();
  closeList();
  return html;
}
