// /api/pdf-token/[token].js
export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    const raw = req.query?.token ? String(req.query.token) : "";
    if (!raw) return res.status(400).json({ error: "Missing token" });

    // Ta bort "quote_" + allt efter första "_"
    const clean = raw.replace(/^quote_/, "").split("_")[0];

    // SANERA env: trimma whitespace och ta bort avslutande slash
    let base = String(process.env.BASE44_PDF_URL || "").trim();
    if (!base) return res.status(500).json({ error: "Missing env BASE44_PDF_URL" });
    base = base.replace(/\/+$/, ""); // ta bort ev. trailing /

    const url = `${base}?token=${encodeURIComponent(clean)}`;

    if (req.query.debug === "1") {
      return res.status(200).json({ ok: true, redirectTo: url, rawToken: raw, cleanToken: clean });
    }

    res.setHeader("Cache-Control", "no-store");
    return res.redirect(307, url);
  } catch (e) {
    console.error("pdf-token redirect error:", e);
    return res.status(500).json({ error: "Redirect failed", message: String(e?.message || e) });
  }
}
