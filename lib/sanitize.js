/* ════════════════════════════════════════════════════════════════════
   Sticky-note HTML sanitiser.

   Note HTML is written by one reviewer and rendered into every other
   reviewer's page, so it is cleaned server-side on every write. Client-side
   cleaning is not enough: a crafted PATCH goes straight past it.

   This also normalises legacy <font> tags into spans. Browsers disagree
   about whether execCommand('fontSize'/'foreColor') emits <font ...> or
   <span style, depending on styleWithCSS — normalising here means the
   client never has to care which one it got.
   ════════════════════════════════════════════════════════════════════ */
import sanitizeHtml from 'sanitize-html';

// execCommand fontSize takes 1-7; we only ever emit 2/4/6 (small/normal/large).
const FONT_SIZE_MAP = { 1: '12px', 2: '12px', 3: '14px', 4: '14px', 5: '18px', 6: '18px', 7: '18px' };

// The rich-text toolbar offers exactly four text colours. Browsers with
// styleWithCSS enabled emit foreColor as rgb(...), not hex (Chrome's
// execCommand('foreColor', ...) is a documented example) — so each palette
// colour must be allowed in BOTH its hex and rgb form, or real toolbar output
// gets silently stripped on save.
const PALETTE = [
  { hex: '#1a1a1a', rgb: [26, 26, 26] }, // ink
  { hex: '#d92d20', rgb: [217, 45, 32] }, // red
  { hex: '#1d4ed8', rgb: [29, 78, 216] }, // blue
  { hex: '#15803d', rgb: [21, 128, 61] }, // green
];

const hexPattern = (hex) => new RegExp(`^${hex.replace('#', '\\#')}$`, 'i');
const rgbPattern = ([r, g, b]) => new RegExp(`^rgb\\(\\s*${r}\\s*,\\s*${g}\\s*,\\s*${b}\\s*\\)$`);

const COLOR = PALETTE.flatMap((c) => [hexPattern(c.hex), rgbPattern(c.rgb)]);
const SIZE = /^(?:12|14|18)px$/;

export function sanitizeNoteHtml(html) {
  return sanitizeHtml(String(html ?? ''), {
    allowedTags: ['b', 'strong', 'i', 'em', 'u', 'br', 'div', 'span'],
    allowedAttributes: { span: ['style'] },
    allowedStyles: { span: { color: COLOR, 'font-size': [SIZE] } },
    disallowedTagsMode: 'discard',
    transformTags: {
      font: (tagName, attribs) => {
        const style = [];
        if (attribs.color) style.push(`color:${attribs.color}`);
        if (attribs.size && FONT_SIZE_MAP[attribs.size]) {
          style.push(`font-size:${FONT_SIZE_MAP[attribs.size]}`);
        }
        return { tagName: 'span', attribs: style.length ? { style: style.join(';') } : {} };
      },
    },
  });
}
