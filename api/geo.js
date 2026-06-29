/* ════════════════════════════════════════════════════════════════════
   GET /api/geo  → { city, region, country }
   Reads Vercel's edge geolocation headers (populated automatically on
   Vercel). Locally these are empty, so the client falls back to a sample
   market. No third-party lookup, no PII stored — derived per request.
   ════════════════════════════════════════════════════════════════════ */
export default function handler(req, res) {
  const dec = v => { try { return decodeURIComponent(v || ''); } catch { return v || ''; } };
  const h = req.headers;
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    city: dec(h['x-vercel-ip-city']),
    region: dec(h['x-vercel-ip-country-region']), // e.g. "NY", "CA"
    country: dec(h['x-vercel-ip-country']),
  });
}
