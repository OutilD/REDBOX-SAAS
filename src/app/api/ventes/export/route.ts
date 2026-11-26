import { q, FUSEAU } from "@/db";
import { utilisateurDe } from "@/lib/auth";
import { periodeDe } from "@/lib/tableau";
import { LIBELLES, filtresDe, sqlFiltres } from "@/lib/ventes";

export const dynamic = "force-dynamic";

/** Le taux de TVA applique pour recomposer le HT : la vente en RedBox est au taux plein. */
const TVA = 0.20;

/**
 * GET /api/ventes/export?f=30&b=12          les ventes de la periode, ligne par ligne
 *     (ou du=…&au=…, et q, statut, produit : les memes filtres que la page Ventes)
 * GET /api/ventes/export?resume=1&b=12      le resume des douze derniers mois
 *
 * L'EXPORT COMPTABLE. Un fichier CSV que l'expert-comptable ouvre dans Excel
 * sans rien regler : point-virgule, virgule decimale, marque d'ordre des
 * octets pour les accents. Les montants sont ceux qu'ont remonte les RedBox ;
 * le HT et la TVA sont recomposes au taux plein — c'est ecrit en tete du fichier.
 */
export async function GET(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return new Response("non connecté", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const b = Number(sp.get("b")) || null;
  const bornes = b ? (u.bornes === null || u.bornes.includes(b) ? [b] : []) : u.bornes;
  const resume = sp.get("resume") === "1";
  const per = await periodeDe(sp.get("f") ?? undefined, sp.get("du") ?? undefined, sp.get("au") ?? undefined);
  const fl = filtresDe({ q: sp.get("q"), statut: sp.get("statut"), produit: sp.get("produit") });

  const euros = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const cellule = (v: string | number | null | undefined) => {
    let s = v === null || v === undefined ? "" : String(v);
    // Un nom de produit ou de borne qui commence par « = » serait une formule
    // pour Excel. Les montants negatifs (« -1,20 ») restent des nombres.
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(,\d+)?$/.test(s)) s = "'" + s;
    return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, "\"\"")}"` : s;
  };
  const lignes: (string | number | null)[][] = [];

  if (resume) {
    const mois = await q<{ mois: string; ventes: number; ca: number; litiges: number }>(`
      SELECT to_char(date_trunc('month', v.faite_le AT TIME ZONE '${FUSEAU}'), 'YYYY-MM') AS mois,
             COUNT(*) FILTER (WHERE v.statut = 'distribue')::int AS ventes,
             COALESCE(SUM(v.prix_c) FILTER (WHERE v.statut = 'distribue'), 0)::int AS ca,
             COUNT(*) FILTER (WHERE v.statut IN ('litige', 'chute_non_detectee', 'non_distribue'))::int AS litiges
        FROM vente v JOIN borne b ON b.id = v.borne_id
       WHERE b.compte_id = $1 AND ($2::bigint[] IS NULL OR b.id = ANY($2))
         -- Le 1er du mois, il y a onze mois, a minuit A PARIS : l'heure murale
         -- ramenee en instant, sinon le debut glisse d'une ou deux heures.
         AND v.faite_le >= (date_trunc('month', now() AT TIME ZONE '${FUSEAU}') - interval '11 months')
                           AT TIME ZONE '${FUSEAU}'
       GROUP BY 1 ORDER BY 1`, [u.compte_id, bornes]);
    lignes.push(["Mois", "Articles vendus", "CA TTC (€)", "CA HT (€)", "TVA (€)", "Ventes en litige"]);
    for (const m of mois) {
      const ht = Math.round(m.ca / (1 + TVA));
      lignes.push([m.mois, m.ventes, euros(m.ca), euros(ht), euros(m.ca - ht), m.litiges]);
    }
  } else {
    // LES MEMES BORNES QUE LE TABLEAU : « 7 jours » commence a minuit, heure de
    // Paris, il y a six jours. L'export de now() - 7 jours ne contenait pas les
    // memes ventes que l'ecran dont on l'avait tire. Les memes parametres, aux
    // memes rangs, et le meme fragment de filtres que la page.
    const ventes = await q<{ faite_le: string; borne: string; produit: string | null; sku: string | null; prix_c: number;
                             statut: string; commande_id: string; lane: number | null }>(`
      SELECT to_char(v.faite_le AT TIME ZONE '${FUSEAU}', 'YYYY-MM-DD HH24:MI') AS faite_le,
             b.nom AS borne, p.nom AS produit, p.sku, v.prix_c, v.statut, v.commande_id, v.lane
        FROM vente v JOIN borne b ON b.id = v.borne_id
        LEFT JOIN produit p ON p.id = v.produit_id
       WHERE b.compte_id = $1 AND ($4::bigint[] IS NULL OR b.id = ANY($4))
         AND v.faite_le >= $2 AND v.faite_le < $3 ${sqlFiltres(5)}
       ORDER BY v.faite_le`, [u.compte_id, per.debut, per.fin, bornes, fl.q, fl.statut, fl.produit]);
    lignes.push(["Date", "RedBox", "Produit", "Référence", "Spire", "Prix TTC (€)", "Prix HT (€)", "TVA (€)", "Statut", "Commande"]);
    for (const v of ventes) {
      const ht = Math.round(v.prix_c / (1 + TVA));
      const vendue = v.statut === "distribue";
      lignes.push([v.faite_le, v.borne, v.produit ?? "produit inconnu", v.sku, v.lane, euros(v.prix_c), euros(ht), euros(v.prix_c - ht),
                   LIBELLES[v.statut] ?? (vendue ? "Vendue" : v.statut), v.commande_id]);
    }
  }

  const filtres = [fl.q ? `commande contenant « ${fl.q} »` : "", fl.statut ? `statut ${LIBELLES[fl.statut] ?? "vendue"}` : "",
                   fl.produit ? `produit n° ${fl.produit}` : ""].filter(Boolean).join(", ");
  const entete = `# RedBox — ${resume ? "résumé mensuel, douze derniers mois"
                                     : `ventes ${per.cle === "perso" ? per.nom : `sur ${per.nom.toLowerCase()}`}${filtres ? ` (${filtres})` : ""}`}`
    + ` — compte ${u.compte} — export du ${new Date().toLocaleDateString("fr-FR", { timeZone: FUSEAU })}`
    + ` — HT et TVA recomposés au taux de ${Math.round(TVA * 100)} %\n`;
  const corps = "﻿" + cellule(entete.trimEnd()) + "\r\n" + lignes.map((l) => l.map(cellule).join(";")).join("\r\n") + "\r\n";
  const nom = `redbox-${resume ? "resume-mensuel" : `ventes-${per.cle === "perso" ? "perso" : `${per.cle}j`}`}${b ? `-redbox-${b}` : ""}.csv`;
  return new Response(corps, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${nom}"`, "Cache-Control": "no-store" },
  });
}
