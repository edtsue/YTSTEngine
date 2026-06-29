/* ════════════════════════════════════════════════════════════════════
   Edge middleware — password gate for the whole site.

   Unauthenticated requests are rewritten to /gate.html. Authentication is
   a cookie holding sha256('ytst:' + YTST_GATE); the middleware recomputes
   that hash from the env var and compares, so the only secret is the single
   YTST_GATE password. If YTST_GATE is unset, the site is left open.

   The matcher lets the gate page (/gate.html) and the gate endpoint
   (/api/gate) through unauthenticated; everything else requires the cookie.
   ════════════════════════════════════════════════════════════════════ */
import { rewrite, next } from '@vercel/edge';

export const config = {
  matcher: ['/((?!api/gate|gate.html).*)'],
};

const COOKIE = 'ytst_gate';

function readCookie(req, name) {
  const header = req.headers.get('cookie') || '';
  const m = header.match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

async function tokenFor(secret) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ytst:' + secret));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export default async function middleware(request) {
  const secret = process.env.YTST_GATE;
  if (!secret) return next(); // no password configured → don't lock anyone out

  const cookie = readCookie(request, COOKIE);
  if (cookie && cookie === await tokenFor(secret)) return next();

  return rewrite(new URL('/gate.html', request.url));
}
