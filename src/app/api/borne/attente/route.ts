import { q1 } from "@/db";
import { parJeton, RYTHME_CALME, sqlCanalServi } from "@/lib/borne";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Duree pendant laquelle on garde la question ouverte, et pas au-dela. */
const TENUE_MS = 25_000;
/** Chaque tour est une requete en base, qui garde Neon eveille et se paie. */
const PAS_MS = 5_000;

/**
 * GET /api/borne/attente   (Bearer jeton)
 *
 * L'attente longue. La borne pose sa question et le serveur NE REPOND PAS tout
 * de suite : il garde la ligne ouverte jusqu'a ce qu'il ait quelque chose, ou
 * vingt-cinq secondes, selon ce qui arrive en premier.
 *
 * C'est ce qui donne l'effet d'une notification alors qu'on ne peut pas appeler
 * la borne — elle est derriere le routeur d'un bar, sans adresse publique. Rien
 * a installer, rien a maintenir, et ca survit a un changement de box internet.
 *
 * Vingt-cinq secondes, parce que les intermediaires coupent souvent a trente et
 * qu'une reponse coupee ressemble a une panne. La borne repose simplement la
 * question : cette boucle EST le rythme calme. Un tour toutes les cinq
 * secondes, pas chaque seconde : sur Vercel et Neon, chaque tour se paie.
 */
export async function GET(req: Request) {
  const borne = await parJeton(req.headers);
  if (!borne) return Response.json({ erreur: "jeton invalide" }, { status: 401 });

  const fin = Date.now() + TENUE_MS;
  while (Date.now() < fin) {
    if (req.signal.aborted) return new Response(null, { status: 499 });

    // Seuls comptent les transferts que la machine peut appliquer : vers une
    // spire qu'elle sert, et de moins de sept jours. Un transfert orphelin —
    // spire masquee ou produit suspendu depuis — n'est jamais acquitte ; le
    // compter reveillait la borne a chaque tour, sans fin.
    const r = await q1<{ reveil: boolean; motif: string | null; transferts: number }>(`
      SELECT (b.reveil_le IS NOT NULL) AS reveil, b.reveil_motif AS motif,
             (SELECT COUNT(*)::int FROM mouvement m
                JOIN canal c ON c.borne_id = b.id AND c.lane = m.lane
                LEFT JOIN produit p ON p.id = c.produit_id
               WHERE m.vers_lieu_id = b.lieu_id AND m.motif = 'transfert'
                 AND m.confirme_le IS NULL AND m.annule_le IS NULL
                 AND m.fait_le > now() - interval '7 days'
                 AND ${sqlCanalServi("c", "p")}) AS transferts
        FROM borne b WHERE b.id = $1`, [borne.id]);

    if (r && (r.reveil || r.transferts > 0)) {
      // Le drapeau est consomme ici : la borne va synchroniser dans la foulee,
      // et le laisser leve la ferait boucler sans fin.
      await q1("UPDATE borne SET reveil_le = NULL, reveil_motif = NULL WHERE id = $1", [borne.id]);
      return Response.json({
        reveil: true,
        motif: r.motif ?? (r.transferts > 0 ? "transfert en attente" : "changement"),
        transferts: r.transferts,
      });
    }
    await new Promise((s) => setTimeout(s, PAS_MS));
  }

  return Response.json({ reveil: false, prochain_appel_s: RYTHME_CALME });
}
