// /api/publicDecline.js
import { actionRateLimit } from '../lib/rate-limit.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const token = String((req.body && req.body.token) || '');
  if (!/^quote_[A-Za-z0-9_-]{6,}$/.test(token)) {
    return res.status(400).json({ ok: false, error: 'Ogiltig token' });
  }

  const limited = await actionRateLimit.limit(req);
  if (!limited.success) {
    return res.status(429).json({ ok: false, error: 'För många förfrågningar' });
  }

  try {
    const base = process.env.BASE44_FUNCTIONS_BASE;
    if (!base) return res.status(500).json({ ok: false, error: 'Missing env BASE44_FUNCTIONS_BASE' });

    const url = `${base}/publicDecline`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token })
    });

    const text = await r.text();
    // försök tolka JSON, annars returnera fel + raw-text
    try {
      const json = JSON.parse(text);
      return res.status(200).json(json);
    } catch {
      return res.status(502).json({ ok: false, error: 'upstream-not-json', text });
    }
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
