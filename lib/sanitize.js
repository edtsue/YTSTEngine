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

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const RGB = /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/;
const SIZE = /^(?:12|14|18)px$/;

export function sanitizeNoteHtml(html) {
  return sanitizeHtml(String(html ?? ''), {
    allowedTags: ['b', 'strong', 'i', 'em', 'u', 'br', 'div', 'span'],
    allowedAttributes: { span: ['style'] },
    allowedStyles: { span: { color: [HEX, RGB], 'font-size': [SIZE] } },
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
