// /api/publicAccept.js
import { actionRateLimit } from '../lib/rate-limit.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const token = String(req.query?.token || '');
  // enkel token-check: kräver prefix "quote_" och minst 10 tecken
  if (!/^quote_[A-Za-z0-9_-]{6,}$/.test(token)) {
    return res.status(400).json({ ok: false, error: 'Ogiltig token' });
  }

  // rate limit
  const limited = await actionRateLimit.limit(req);
  if (!limited.success) {
    return res.status(429).json({ ok: false, error: 'För många förfrågningar' });
  }

  try {
    const base = process.env.BASE44_FUNCTIONS_BASE; // t.ex. https://preview--bygg-assist-78c09474.base44.app/functions
    if (!base) return res.status(500).json({ ok: false, error: 'Missing env BASE44_FUNCTIONS_BASE' });

    const url = `${base}/publicAccept?token=${encodeURIComponent(token)}`;
    const r = await fetch(url, { method: 'POST' });

    if (r.ok) {
      return res.redirect(302, `/accept/?status=accepted&token=${encodeURIComponent(token)}`);
    } else {
      return res.redirect(302, `/accept/?status=error&token=${encodeURIComponent(token)}`);
    }
  } catch (e) {
    console.error('Accept Error:', e);
    return res.redirect(302, `/accept/?status=error&token=${encodeURIComponent(token)}`);
  }
}
