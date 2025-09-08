export const config = { runtime: "nodejs" };

const UPSTREAM_BASE =
  process.env.UPSTREAM_BASE ||
  "https://preview--bygg-assist-78c09474.base44.app"; // ändra via env i Vercel när du går mot prod

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const { token, debug } = req.query;
  if (!token) return res.status(400).json({ ok: false, error: "missing token" });
  if (!/^[a-zA-Z0-9-_]+$/.test(String(token))) {
    return res.status(400).json({ ok: false, error: "invalid token format" });
  }

  // ⚠️ Byt path nedan till EXAKT den du ser i DevTools.
  // På din bild ser det ut som en functions-route, typ:
  //   /functions/serveQuotePdf?token=<TOKEN>
  // eller /functions/serveQuotePdfToken=<TOKEN>
  // Testa först varianten med query-param:
  const upstream = `${UPSTREAM_BASE}/functions/serveQuotePdf?token=${encodeURIComponent(token)}`;

  try {
    // Debug-läge: hämta men streama inte
    if (debug === "1") {
      const r2 = await fetch(upstream, { cache: "no-store" });
      const body2 = await r2.text().catch(() => "");
      return res.status(r2.status).json({
        ok: r2.ok,
        upstream,
        note: "Debug fetch only. Not streaming.",
        upstreamStatus: r2.status,
        upstreamBodyPreview: body2?.slice(0, 800) || null,
      });
    }

    const r = await fetch(upstream, { cache: "no-store" });

    if (!r.ok) {
      const body = await r.text().catch(() => "");
      return res.status(r.status).json({
        ok: false,
        error: "upstream_error",
        status: r.status,
        upstream,
        upstreamBodyPreview: body?.slice(0, 500) || null,
      });
    }

    // HEAD support
    if (req.method === "HEAD") {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="offer-${token}.pdf"`);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).end();
    }

    // Streama PDF
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="offer-${token}.pdf"`);
    res.setHeader("Cache-Control", "no-store");

    const reader = r.body.getReader();
    res.status(200);
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    return res.end();
  } catch (e) {
    res.status(502);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.end(`<!doctype html><html><head><meta charset="utf-8"><title>PDF not available</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:2rem;background:#fafafa}
.card{max-width:560px;margin:auto;background:#fff;border:1px solid #eee;border-radius:16px;padding:24px;box-shadow:0 2px 10px rgba(0,0,0,.04)}
h1{font-size:20px;margin:0 0 8px} p{margin:8px 0 0;line-height:1.5} code{background:#f3f3f3;padding:2px 6px;border-radius:6px}</style>
</head><body><div class="card">
<h1>PDF not available right now</h1>
<p>We couldn’t fetch the PDF for token <code>${String(token)}</code>. Please try again or contact support.</p>
<p style="color:#555;margin-top:12px;">Technical detail: ${String(e)}</p>
</div></body></html>`);
  }
}
