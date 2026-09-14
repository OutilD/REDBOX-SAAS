import { utilisateurDe, versPage } from "@/lib/auth";
import { FONDS, peutReglerFond, reglerFond, salonDe, type Fond } from "@/lib/salons";

export const dynamic = "force-dynamic";

/**
 * POST /api/salons/fond (salon_id, fond) — le fond anime d'un salon.
 *
 * Un formulaire ordinaire, qui revient sur le salon : le choix se voit sur la
 * page d'apres, sans JavaScript. Qui n'administre pas le salon est renvoye
 * dessus sans rien changer — il n'avait pas le bouton, il n'a pas le droit.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  const f = await req.formData();
  const id = Number(f.get("salon_id"));
  const fond = String(f.get("fond") ?? "");
  if (!Number.isInteger(id)) return versPage(req, "/messages");

  const s = await salonDe(u, id);
  if (!s) return versPage(req, "/messages");
  if (!peutReglerFond(u, s) || !FONDS.some((x) => x.cle === fond)) return versPage(req, `/messages/${id}`);

  await reglerFond(id, fond as Fond);
  return versPage(req, `/messages/${id}`);
}
