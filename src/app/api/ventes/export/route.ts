import { q } from "@/db";
import { utilisateurDe } from "@/lib/auth";
import { FENETRES } from "@/lib/tableau";
import { LIBELLES } from "@/lib/ventes";

export const dynamic = "force-dynamic";

/** Le taux de TVA applique pour recomposer le HT : la vente en RedBox est au taux plein. */
const TVA = 0.20;

/**
 * GET /api/ventes/export?f=30&b=12          les ventes de la periode, ligne par ligne
 * GET /api/ventes/export?resume=1&b=12      le resume des douze derniers mois
 *
 * L'EXPORT COMPTABLE. Un fichier CSV que l'expert-comptable ouvre dans Excel
 * sans rien regler : point-virgule, virgule decimale, marque d'ordre des
 * octets pour les accents. Les montants sont ceux qu'ont remonte les RedBox ;
 * le HT et la TVA sont recomposes au taux plein, la marge au dernier prix
 * d'achat connu — c'est ecrit en tete du fichier.
 */
export async function GET(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return new Response("non connecté", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const fen = FENETRES.find((x) => x.cle === sp.get("f")) ?? FENETRES.find((x) => x.cle === "30")!;
  const b = Number(sp.get("b")) || null;
  const bornes = b ? (u.bornes === null || u.bornes.includes(b) ? [b] : []) : u.bornes;
  const resume = sp.get("resume") === "1";

  const euros = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const cellule = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, "\"\"")}"` : s;
  };
  const lignes: (string | number | null)[][] = [];

  if (resume) {
    const mois = await q<{ mois: string; ventes: number; ca: number; marge: number; litiges: number }>(`
      SELECT to_char(date_trunc('month', v.faite_le AT TIME ZONE 'Europe/Paris'), 'YYYY-MM') AS mois,
             COUNT(*) FILTER (WHERE v.statut = 'distribue')::int AS ventes,
             COALESCE(SUM(v.prix_c) FILTER (WHERE v.statut = 'distribue'), 0)::int AS ca,
             COALESCE(SUM(v.prix_c - COALESCE(a.prix_achat_c, 0)) FILTER (WHERE v.statut = 'distribue'), 0)::int AS marge,
             COUNT(*) FILTER (WHERE v.statut IN ('litige', 'chute_non_detectee', 'non_distribue'))::int AS litiges
        FROM vente v JOIN borne b ON b.id = v.borne_id
        LEFT JOIN v_prix_achat a ON a.produit_id = v.produit_id
       WHERE b.compte_id = $1 AND ($2::bigint[] IS NULL OR b.id = ANY($2))
         AND v.faite_le >= date_trunc('month', now() AT TIME ZONE 'Europe/Paris') - interval '11 months'
       GROUP BY 1 ORDER BY 1`, [u.compte_id, bornes]);
    lignes.push(["Mois", "Articles vendus", "CA TTC (€)", "CA HT (€)", "TVA (€)", "Marge estimée (€)", "Ventes en litige"]);
    for (const m of mois) {
      const ht = Math.round(m.ca / (1 + TVA));
      lignes.push([m.mois, m.ventes, euros(m.ca), euros(ht), euros(m.ca - ht), euros(m.marge), m.litiges]);
    }
  } else {
    const ventes = await q<{ faite_le: string; borne: string; produit: string | null; sku: string | null; prix_c: number;
                             achat_c: number | null; statut: string; commande_id: string; lane: number | null }>(`
      SELECT to_char(v.faite_le AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD HH24:MI') AS faite_le,
             b.nom AS borne, p.nom AS produit, p.sku, v.prix_c, a.prix_achat_c AS achat_c, v.statut, v.commande_id, v.lane
        FROM vente v JOIN borne b ON b.id = v.borne_id
        LEFT JOIN produit p ON p.id = v.produit_id
        LEFT JOIN v_prix_achat a ON a.produit_id = v.produit_id
       WHERE b.compte_id = $1 AND ($2::bigint[] IS NULL OR b.id = ANY($2))
         AND v.faite_le >= now() - ($3 || ' days')::interval
       ORDER BY v.faite_le`, [u.compte_id, bornes, String(fen.jours)]);
    lignes.push(["Date", "RedBox", "Produit", "Référence", "Spire", "Prix TTC (€)", "Prix HT (€)", "TVA (€)", "Prix d’achat (€)", "Marge (€)", "Statut", "Commande"]);
    for (const v of ventes) {
      const ht = Math.round(v.prix_c / (1 + TVA));
      const vendue = v.statut === "distribue";
      lignes.push([v.faite_le, v.borne, v.produit ?? "produit inconnu", v.sku, v.lane, euros(v.prix_c), euros(ht), euros(v.prix_c - ht),
                   v.achat_c === null ? "" : euros(v.achat_c), vendue && v.achat_c !== null ? euros(v.prix_c - v.achat_c) : "",
                   LIBELLES[v.statut] ?? (vendue ? "Vendue" : v.statut), v.commande_id]);
    }
  }

  const entete = `# RedBox — ${resume ? "résumé mensuel, douze derniers mois" : `ventes sur ${fen.nom.toLowerCase()}`}`
    + ` — compte ${u.compte} — export du ${new Date().toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}`
    + ` — HT et TVA recomposés au taux de ${Math.round(TVA * 100)} %, marge au dernier prix d’achat connu\n`;
  const corps = "﻿" + entete + lignes.map((l) => l.map(cellule).join(";")).join("\r\n") + "\r\n";
  const nom = `redbox-${resume ? "resume-mensuel" : `ventes-${fen.cle}j`}${b ? `-redbox-${b}` : ""}.csv`;
  return new Response(corps, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${nom}"`, "Cache-Control": "no-store" },
  });
}
