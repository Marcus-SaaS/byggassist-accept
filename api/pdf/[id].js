export const config = { runtime: "nodejs" }; // force Node runtime

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const { id, debug } = req.query;
  if (!id) return res.status(400).json({ ok: false, error: "missing id" });
  if (!/^[a-zA-Z0-9-_]+$/.test(String(id))) {
    return res.status(400).json({ ok: false, error: "invalid id format" });
  }

  const upstream = `https://preview--bygg-assist-78c09474.base44.app/api/quotes/${id}/pdf`;

  try {
    const r = await fetch(upstream, { cache: "no-store" });

    if (!r.ok) {
      return res.status(r.status).json({ ok: false, error: "upstream_error", status: r.status });
    }

    if (req.method === "HEAD") {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="offert-${id}.pdf"`);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).end();
    }

    if (debug === "1") {
      return res.status(200).json({ ok: true, upstream, note: "PDF would be streamed" });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="offert-${id}.pdf"`);
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
<p>We couldn’t fetch the PDF for quote <code>${String(id)}</code>. Please try again or contact support.</p>
<p style="color:#555;margin-top:12px;">Technical detail: ${String(e)}</p>
</div></body></html>`);
  }
}
