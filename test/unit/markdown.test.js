import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, renderMarkdown } from '../../public/js/markdown.js';

test('escapes every HTML metacharacter', () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

// Everything the renderer is allowed to emit. Anything else in the output would
// mean model or user text escaped into markup.
const ALLOWED_TAGS = /<\/?(?:p|br|strong|em|ul|ol|li)(?: start="\d+")?>/g;

test('model output cannot inject markup', () => {
  const payloads = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<iframe src="javascript:alert(1)"></iframe>',
    '**<svg/onload=alert(1)>**',
    '[klik](javascript:alert(1))',
    '<p onclick="steal()">halo</p>',
  ];

  for (const payload of payloads) {
    const remainder = renderMarkdown(payload).replace(ALLOWED_TAGS, '');
    assert.ok(!remainder.includes('<'), `markup leaked for: ${payload}`);
  }
});

test('renders the supported subset', () => {
  assert.equal(renderMarkdown('halo **bestie**'), '<p>halo <strong>bestie</strong></p>');
  assert.equal(renderMarkdown('- satu\n- dua'), '<ul><li>satu</li><li>dua</li></ul>');
  assert.equal(renderMarkdown('2. dua\n3. tiga'), '<ol start="2"><li>dua</li><li>tiga</li></ol>');
  assert.equal(renderMarkdown('baris satu\nbaris dua'), '<p>baris satu<br>baris dua</p>');
});

test('emphasis does not swallow arithmetic or stray asterisks', () => {
  assert.equal(renderMarkdown('5 * 3 = 15'), '<p>5 * 3 = 15</p>');
  assert.equal(renderMarkdown('bintang * sendirian'), '<p>bintang * sendirian</p>');
});

test('headings are flattened, tags never reach the output', () => {
  assert.equal(renderMarkdown('# Judul'), '<p>Judul</p>');
});

test('handles empty and whitespace-only input', () => {
  assert.equal(renderMarkdown(''), '');
  assert.equal(renderMarkdown('\n\n  \n'), '');
});
