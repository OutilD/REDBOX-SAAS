import { q } from "@/db";
import { peutCharger, utilisateurDe, versPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Marquer un souci comme traite.
 *
 * On ne change JAMAIS le statut de la vente : ce que la borne a remonte reste ce
 * qu'elle a remonte. Reecrire l'histoire pour faire disparaitre une ligne rouge,
 * c'est se priver du seul moyen de voir qu'un canal en produit trois par semaine.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!peutCharger(u)) return versPage(req, "/ventes");
  const f = await req.formData();
  await q(`UPDATE vente SET traite_le = now(), traite_par = $1, note = $2
            WHERE id = $3 AND traite_le IS NULL
              AND borne_id IN (SELECT id FROM borne WHERE compte_id = $4)
              -- Et dans la portee : un litige d'une machine qu'on ne voit pas
              -- ne doit pas pouvoir etre classe depuis un identifiant devine.
              AND ($5::bigint[] IS NULL OR borne_id = ANY($5))`,
          [u.email, String(f.get("note") ?? "").trim() || null, Number(f.get("id")),
           u.compte_id, u.bornes]);
  return versPage(req, "/ventes");
}
