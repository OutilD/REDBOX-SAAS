import { q1 } from "@/db";
import { peutConfigurer, peutVoirBorne, utilisateurDe } from "@/lib/auth";
import { reveiller } from "@/lib/borne";
import { ledValide } from "@/lib/led";

export const dynamic = "force-dynamic";

/**
 * POST /api/bornes/[id]/led   { couleur, effet, luminosite }
 *
 * La couleur du bandeau d'une RedBox. Appelee en direct par l'anneau de la page
 * Affichage a chaque geste : JSON en retour, pas de redirection.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await utilisateurDe(req);
  if (!u) return Response.json({ erreur: "non connecté" }, { status: 401 });

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0 || !peutVoirBorne(u, id))
    return Response.json({ erreur: "machine inconnue" }, { status: 404 });
  if (!peutConfigurer(u)) return Response.json({ erreur: "droit insuffisant" }, { status: 403 });

  const led = ledValide(await req.json().catch(() => ({})));
  if (!led) return Response.json({ erreur: "réglage invalide" }, { status: 400 });

  const b = await q1("UPDATE borne SET led = $3 WHERE id = $1 AND compte_id = $2 RETURNING id",
                     [id, u.compte_id, JSON.stringify(led)]);
  if (!b) return Response.json({ erreur: "machine inconnue" }, { status: 404 });

  // Sans reveil, la couleur attendrait le prochain appel : jusqu'a cinq minutes.
  await reveiller(id, "couleur du bandeau");
  return Response.json({ ok: true, led });
}
