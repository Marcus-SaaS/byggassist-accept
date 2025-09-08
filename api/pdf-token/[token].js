export const config = { runtime: "nodejs" };

const UPSTREAM_BASE =
  process.env.UPSTREAM_BASE ||
  "https://preview--bygg-assist-78c09474.base44.app";

async function fetchCandidate(url) {
  const r = await fetch(url, {
    cache: "no-store",
    // hinta att vi vill ha pdf – vissa backends bryr sig
    headers: { Accept: "application/pdf,*/*;q=0.9" },
    redirect: "follow",
  });
  const ct = r.headers.get("content-type") || "";
  return { r, ct, url };
}

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

  // Testa först path-varianten (troligast enligt din skärmdump),
  // sen fallback till query-varianten.
  const candidates = [
    `${UPSTREAM_BASE}/functions/serveQuotePdfToken=${encodeURIComponent(token)}`,
    `${UPSTREAM_BASE}/functions/serveQuotePdf?token=${encodeURIComponent(token)}`,
  ];

  try {
    // DEBUG-läge: hämta och visa vad upstream faktiskt svarar
    if (debug === "1") {
      const results = [];
      for (const url of candidates) {
        try {
          const { r, ct } = await fetchCandidate(url);
          const bodyPreview = await r.text().catch(() => "");
          results.push({
            url,
            status: r.status,
            contentType: ct,
            ok: r.ok,
            bodyPreview: bodyPreview.slice(0, 800),
          });
        } catch (e) {
          results.push({ url, error: String(e) });
        }
      }
      return res.status(200).json({ ok: true, tried: results });
    }

    // PROD-läge: hitta första kandidat som faktiskt ger PDF
    for (const url of candidates) {
      const { r, ct } = await fetchCandidate(url);
      if (!r.ok) continue;
      if (!ct.toLowerCase().includes("application/pdf")) continue;

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
    }

    // Ingen kandidat gav PDF → returnera tydligt fel
    return res.status(502).json({
      ok: false,
      error: "no_pdf_from_upstream",
      note:
        "Upstream responded but not with application/pdf. Check the exact function path/name.",
      tried: candidates,
    });
  } catch (e) {
    res.status(502);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({ ok: false, error: "proxy_exception", detail: String(e) }));
  }
}
