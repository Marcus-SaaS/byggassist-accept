import { getBaseUrl, isValidToken } from '../../../lib/config';
import { actionRateLimit } from '../../../lib/rate-limit';

export default async function handler(req, res) {
  const { token } = req.query;
  
  try {
    // Rate limiting
    const rateLimitResult = await actionRateLimit.limit(req);
    if (!rateLimitResult.success) {
      return res.status(429).json({ error: 'För många förfrågningar' });
    }
    
    if (!token || !isValidToken(token)) {
      return res.status(400).json({ error: 'Ogiltig token' });
    }

    const UPSTREAM_BASE = getBaseUrl();
    const response = await fetch(
      `${UPSTREAM_BASE}/functions/publicAccept?token=${token}`,
      { method: 'POST' }
    );

    if (response.ok) {
      res.redirect(302, `/tack?status=accepted&token=${token}`);
    } else {
      res.redirect(302, `/tack?status=error&token=${token}`);
    }
  } catch (error) {
    console.error('Accept Error:', error);
    res.redirect(302, `/tack?status=error&token=${token}`);
  }
}
