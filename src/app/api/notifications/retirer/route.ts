import { q } from "@/db";
import { utilisateurDe, versPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/retirer
 *
 * Deux facons d'arriver ici : le formulaire de la liste (un `id`, et on revient
 * a la page), ou le bouton « désactiver sur cet appareil », en JSON avec
 * l'`endpoint` que le navigateur vient de resilier. Dans les deux cas on
 * n'efface que ce qui appartient a la personne connectee.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  const json = (req.headers.get("content-type") ?? "").includes("application/json");
  if (!u) return json ? Response.json({ erreur: "non connecté" }, { status: 401 }) : versPage(req, "/connexion");

  if (json) {
    const corps = await req.json().catch(() => ({})) as { endpoint?: unknown };
    if (typeof corps.endpoint === "string") {
      await q("DELETE FROM abonnement_push WHERE utilisateur_id = $1 AND endpoint = $2", [u.id, corps.endpoint]);
    }
    return Response.json({ ok: true });
  }

  const f = await req.formData();
  const id = Number(f.get("id"));
  if (Number.isInteger(id)) {
    await q("DELETE FROM abonnement_push WHERE utilisateur_id = $1 AND id = $2", [u.id, id]);
  }
  return versPage(req, "/reglages/notifications?fait=desabonne");
}
