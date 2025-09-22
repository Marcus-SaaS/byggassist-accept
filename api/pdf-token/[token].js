// pages/api/pdf-token/[token].js
export const config = { runtime: "nodejs" };

// Ren redirect till Base44 serveQuotePdf, med robust token-rensning
export default async function handler(req, res) {
  try {
    const raw = req.query?.token ? String(req.query.token) : "";
    if (!raw) return res.status(400).json({ error: "Missing token" });

    // Rensa token: ta bort "quote_" och allt efter första "_"
    const clean = raw.replace(/^quote_/, "").split("_")[0];

    const base = process.env.BASE44_PDF_URL;
    if (!base) return res.status(500).json({ error: "Missing env BASE44_PDF_URL" });

    const url = `${base}?token=${encodeURIComponent(clean)}`;

    // Debug-läge: visa vart vi redirectar i stället för att göra det.
    if (req.query.debug === "1") {
      return res.status(200).json({ ok: true, redirectTo: url, rawToken: raw, cleanToken: clean });
    }

    // 307 Temporary Redirect (bevarar metod/Body om nånsin POSTas)
    res.setHeader("Cache-Control", "no-store");
    return res.redirect(307, url);
  } catch (e) {
    console.error("pdf-token redirect error:", e);
    return res.status(500).json({ error: "Redirect failed", message: String(e?.message || e) });
  }
}
