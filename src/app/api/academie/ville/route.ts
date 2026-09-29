import { q, q1 } from "@/db";
import { utilisateurDe, versPage } from "@/lib/auth";
import { situerPersonne } from "@/lib/geo";

export const dynamic = "force-dynamic";

/**
 * POST /api/academie/ville — le futur redboxer dit ou il veut se lancer. C'est
 * la ville de son profil. On la cherche tout de suite : une ville inconnue est
 * redemandee plutot que gardee fausse.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  const ville = String((await req.formData()).get("ville") ?? "").trim().slice(0, 60);
  if (!ville) return versPage(req, "/academie");
  await q("UPDATE utilisateur SET ville = $2 WHERE id = $1", [u.id, ville]);
  await situerPersonne(u.id);
  const x = await q1<{ latitude: number | null }>("SELECT latitude FROM utilisateur WHERE id = $1", [u.id]);
  if (x?.latitude === null || x?.latitude === undefined) {
    await q("UPDATE utilisateur SET ville = NULL, situe_pour = NULL WHERE id = $1", [u.id]);
    return versPage(req, "/academie?e=ville");
  }
  return versPage(req, "/academie?ok=ville");
}
