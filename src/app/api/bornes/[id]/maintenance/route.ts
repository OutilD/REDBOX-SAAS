import { q1 } from "@/db";
import { peutCharger, peutVoirBorne, utilisateurDe, versPage } from "@/lib/auth";
import { renouvelerPin } from "@/lib/maintenance";
import { reveiller } from "@/lib/borne";

export const dynamic = "force-dynamic";

/**
 * Renouveler le code de la console de maintenance.
 *
 * On perime le code et on reveille la borne dans la foulee : sans ce reveil,
 * l'exploitant resterait jusqu'a cinq minutes devant une page qui annonce un
 * renouvellement sans effet visible.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return versPage(req, "/bornes");
  if (!peutCharger(u)) return versPage(req, `/bornes/${id}`);
  // CETTE BORNE LUI EST-ELLE OUVERTE ? Le compte ne suffit plus : quelqu'un
  // invite pour une seule machine appartient bien au compte, et pourrait
  // agir sur les autres en tapant leur numero dans l'adresse.
  if (!peutVoirBorne(u, id)) return versPage(req, "/bornes");

  // La borne doit etre du compte : sans ce controle, un identifiant devine
  // ferait tourner le code de la machine du voisin.
  const b = await q1("SELECT 1 FROM borne WHERE id = $1 AND compte_id = $2", [id, u.compte_id]);
  if (!b) return versPage(req, "/bornes");

  await renouvelerPin(id, u.compte_id);
  await reveiller(id, "renouvellement du code de maintenance");

  return versPage(req, `/bornes/${id}?pin=1`);
}
