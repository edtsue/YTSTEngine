/* ════════════════════════════════════════════════════════════════════
   POST /api/generate  → { image: "data:image/png;base64,..." }
   Proxies a text prompt to the Gemini image model using YTST_KEY.
   The key never reaches the browser.
   ════════════════════════════════════════════════════════════════════ */
import sharp from 'sharp';

// give the function room past the default Hobby timeout so a cold start +
// a ~6s Gemini render never gets killed mid-flight.
export const config = { maxDuration: 60 };

// warm-instance cache: an identical prompt within a live instance returns instantly.
const cache = new Map();
const CACHE_MAX = 40;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method', message: 'POST only' });
  }

  const key = process.env.YTST_KEY;
  if (!key) {
    return res.status(503).json({ error: 'no_key', message: 'Set YTST_KEY in Vercel env to enable generation.' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const prompt = body && body.prompt;
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'prompt', message: 'A `prompt` string is required.' });
  }

  if (cache.has(prompt)) {
    return res.status(200).json({ image: cache.get(prompt), cached: true });
  }

  const model = process.env.YTST_IMAGE_MODEL || 'gemini-2.5-flash-image';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

  try {
    const gem = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
    });

    const data = await gem.json().catch(() => null);
    if (!gem.ok) {
      const detail = data?.error?.message || `Gemini returned ${gem.status}`;
      return res.status(gem.status).json({ error: 'gemini', message: detail });
    }

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const imgPart = parts.find(p => p.inlineData || p.inline_data);
    const inline = imgPart && (imgPart.inlineData || imgPart.inline_data);
    if (!inline?.data) {
      const text = parts.map(p => p.text).filter(Boolean).join(' ');
      return res.status(502).json({ error: 'no_image', message: text || 'Model returned no image.' });
    }

    // Re-encode to a right-sized 16:9 JPEG — cuts the payload ~10x (2.4MB → ~200KB)
    // so it transfers fast. Falls back to the raw image if sharp ever fails.
    let dataUrl;
    try {
      const png = Buffer.from(inline.data, 'base64');
      const jpg = await sharp(png)
        .resize({ width: 1280, height: 720, fit: 'cover' })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
      dataUrl = `data:image/jpeg;base64,${jpg.toString('base64')}`;
    } catch {
      const mime = inline.mimeType || inline.mime_type || 'image/png';
      dataUrl = `data:${mime};base64,${inline.data}`;
    }

    cache.set(prompt, dataUrl);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return res.status(200).json({ image: dataUrl });
  } catch (e) {
    return res.status(500).json({ error: 'fetch', message: String(e && e.message || e) });
  }
}
