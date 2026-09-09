import { estRestreint, peutConfigurer, utilisateurDe, versPage } from "@/lib/auth";
import { reglerLecteurs, salonDe } from "@/lib/salons";

export const dynamic = "force-dynamic";

/**
 * POST /api/salons/lecteurs (salon_id, membre[]) — qui lit un salon d'equipe.
 *
 * Un salon du compte, sans borne, regle par un gerant ou le proprietaire qui
 * n'est pas restreint a une machine. Aucune case cochee rend le salon a tout
 * le compte.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  const f = await req.formData();
  const salon_id = Number(f.get("salon_id"));
  if (!Number.isInteger(salon_id)) return versPage(req, "/messages");
  const s = await salonDe(u, salon_id);
  if (!s || s.portee !== "compte" || s.borne_id !== null || s.nom === "general"
      || !peutConfigurer(u) || estRestreint(u)) {
    return versPage(req, `/messages/${salon_id}?qui=1&e=droit`);
  }
  const ids = f.getAll("membre").map(Number).filter(Number.isInteger);
  await reglerLecteurs(salon_id, ids, u.id);
  return versPage(req, `/messages/${salon_id}?qui=1&fait=enregistre`);
}
