import { q1 } from "@/db";
import { peutCharger, peutVoirBorne, utilisateurDe, versPage } from "@/lib/auth";
import { reveiller } from "@/lib/borne";
import { nomAffiche } from "@/lib/personnes";
import { donnerOrdre, saitRecevoirDesOrdres } from "@/lib/ordres";

export const dynamic = "force-dynamic";

/**
 * POST /api/bornes/[id]/ordre   (formulaire : genre=reset_paiement)
 *
 * Reinitialiser le terminal de paiement d'une machine sans y aller. L'ordre
 * est range, la machine reveillee : en ligne, elle le prend dans la seconde.
 * Elle le refuse d'elle-meme si une vente est en cours — un RESET apres une
 * approbation vaudrait encaissement (MDB 7.4.7) — et le dit en retour.
 *
 * Memes droits que la mise hors service : qui peut charger cette machine.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return versPage(req, "/bornes");
  if (!peutCharger(u)) return versPage(req, `/bornes/${id}`);
  if (!peutVoirBorne(u, id)) return versPage(req, "/bornes");

  const f = await req.formData();
  if (String(f.get("genre") ?? "") !== "reset_paiement") return versPage(req, `/bornes/${id}`);

  const b = await q1<{ version: string | null; jeton: string | null }>(
    "SELECT version, jeton FROM borne WHERE id = $1 AND compte_id = $2", [id, u.compte_id]);
  if (!b) return versPage(req, "/bornes");
  if (!b.jeton || !saitRecevoirDesOrdres(b.version)) return versPage(req, `/bornes/${id}?ordre=version#ordres`);

  const ordre = await donnerOrdre(id, "reset_paiement", { id: u.id, nom: nomAffiche(u) });
  if (ordre === null) return versPage(req, `/bornes/${id}?ordre=deja#ordres`);

  await reveiller(id, "réinitialisation du terminal de paiement");
  return versPage(req, `/bornes/${id}?ordre=ok#ordres`);
}
