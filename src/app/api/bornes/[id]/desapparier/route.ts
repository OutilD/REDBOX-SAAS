import { q } from "@/db";
import { peutConfigurer, peutVoirBorne, utilisateurDe, versPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Delier une borne de ce compte.
 *
 * On EFFACE LE JETON, on ne supprime pas la ligne : les ventes, les mouvements
 * et l'historique restent rattaches a ce compte — c'est son passe, il lui
 * appartient. La machine, elle, redevient libre : son identite materielle n'est
 * plus portee par aucune borne appairee, donc un autre compte peut l'adopter.
 *
 * Cote machine, le jeton devient invalide : la prochaine synchronisation recoit
 * un 401, la borne se delie toute seule et reaffiche un code d'appairage. Elle
 * GARDE son catalogue et ses visuels — le compte suivant les reprendra.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  const id = Number((await ctx.params).id);
  if (!peutConfigurer(u)) return versPage(req, `/bornes/${id}`);
  // CETTE BORNE LUI EST-ELLE OUVERTE ? Le compte ne suffit plus : quelqu'un
  // invite pour une seule machine appartient bien au compte, et pourrait
  // agir sur les autres en tapant leur numero dans l'adresse.
  if (!peutVoirBorne(u, id)) return versPage(req, "/bornes");

  const n = await q(`
    UPDATE borne SET jeton = NULL, depairee_le = now(), reveil_le = NULL, reveil_motif = NULL
     WHERE id = $1 AND compte_id = $2 AND jeton IS NOT NULL
     RETURNING id`, [id, u.compte_id]);

  return versPage(req, n.length > 0 ? "/bornes?d=1" : `/bornes/${id}`);
}
