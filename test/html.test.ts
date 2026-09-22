import { describe, expect, it } from 'vitest';
import { escapeHtml, html, raw } from '../src/ui/html';

describe('html', () => {
  it('escapes interpolated values', () => {
    const name = `<img src=x onerror="alert('x')">`;
    expect(html`<p>${name}</p>`.value).toBe(
      `<p>&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;</p>`,
    );
  });

  it('escapes ampersands first so entities are not double-decoded', () => {
    expect(escapeHtml('a & <b>')).toBe('a &amp; &lt;b&gt;');
  });

  it('leaves literal markup in the template alone', () => {
    expect(html`<b>3 &times; 4</b>`.value).toBe('<b>3 &times; 4</b>');
  });

  it('passes nested Html through unescaped', () => {
    const inner = html`<b>${'<ok>'}</b>`;
    expect(html`<p>${inner}</p>`.value).toBe('<p><b>&lt;ok&gt;</b></p>');
  });

  it('concatenates arrays', () => {
    const items = ['a', '<b>'];
    expect(
      html`<ul>
        ${items.map((item) => html`<li>${item}</li>`)}
      </ul>`.value,
    ).toContain('<li>a</li><li>&lt;b&gt;</li>');
  });

  it('renders false, null and undefined as nothing', () => {
    const missing = undefined;
    expect(html`<p>${false}${null}${missing}</p>`.value).toBe('<p></p>');
  });

  it('stringifies other values', () => {
    expect(html`<td>${42}</td>`.value).toBe('<td>42</td>');
  });

  it('raw() trusts its input', () => {
    expect(html`<p>${raw('<b>hi</b>')}</p>`.value).toBe('<p><b>hi</b></p>');
  });

  it('handles a template with no interpolations', () => {
    expect(html`<hr />`.value).toBe('<hr />');
  });
});
