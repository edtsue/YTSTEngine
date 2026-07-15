import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeNoteHtml } from '../lib/sanitize.js';

test('keeps allowed formatting tags', () => {
  assert.equal(sanitizeNoteHtml('<b>bold</b> <i>it</i> <u>u</u>'), '<b>bold</b> <i>it</i> <u>u</u>');
});

test('strips script tags entirely', () => {
  assert.equal(sanitizeNoteHtml('hi<script>alert(1)</script>'), 'hi');
});

test('strips event handler attributes', () => {
  assert.equal(sanitizeNoteHtml('<b onclick="alert(1)">x</b>'), '<b>x</b>');
});

test('strips img/onerror payloads', () => {
  assert.equal(sanitizeNoteHtml('<img src=x onerror=alert(1)>'), '');
});

test('keeps span colour within the allowlist', () => {
  assert.equal(
    sanitizeNoteHtml('<span style="color:#d92d20">red</span>'),
    '<span style="color:#d92d20">red</span>'
  );
});

test('strips a non-palette hex colour', () => {
  const out = sanitizeNoteHtml('<span style="color:#123456">x</span>');
  assert.equal(out, '<span>x</span>');
});

test('strips a non-palette rgb colour', () => {
  const out = sanitizeNoteHtml('<span style="color:rgb(1, 2, 3)">x</span>');
  assert.equal(out, '<span>x</span>');
});

const PALETTE = [
  { name: 'ink', hex: '#1a1a1a', rgb: [26, 26, 26] },
  { name: 'red', hex: '#d92d20', rgb: [217, 45, 32] },
  { name: 'blue', hex: '#1d4ed8', rgb: [29, 78, 216] },
  { name: 'green', hex: '#15803d', rgb: [21, 128, 61] },
];

for (const { name, hex } of PALETTE) {
  test(`keeps palette colour ${name} in hex form`, () => {
    const out = sanitizeNoteHtml(`<span style="color:${hex}">x</span>`);
    assert.equal(out, `<span style="color:${hex}">x</span>`);
  });
}

for (const { name, rgb } of PALETTE) {
  test(`keeps palette colour ${name} in rgb form, including with spaces after commas`, () => {
    const [r, g, b] = rgb;
    const out = sanitizeNoteHtml(`<span style="color:rgb(${r}, ${g}, ${b})">x</span>`);
    assert.ok(out.includes(`rgb(${r}, ${g}, ${b})`), `expected colour preserved, got: ${out}`);
  });
}

test('drops disallowed style properties', () => {
  const out = sanitizeNoteHtml('<span style="position:fixed;color:#1a1a1a">x</span>');
  assert.ok(!out.includes('position'));
  assert.ok(out.includes('color'));
});

test('normalises legacy font tags into spans', () => {
  const out = sanitizeNoteHtml('<font color="#1d4ed8" size="6">big blue</font>');
  assert.ok(out.startsWith('<span'), `expected span, got: ${out}`);
  assert.ok(out.includes('color:#1d4ed8'));
  assert.ok(out.includes('font-size:18px'));
  assert.ok(out.includes('big blue'));
});

test('handles null and undefined without throwing', () => {
  assert.equal(sanitizeNoteHtml(null), '');
  assert.equal(sanitizeNoteHtml(undefined), '');
});
