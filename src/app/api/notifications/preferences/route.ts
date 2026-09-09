import { q } from "@/db";
import { utilisateurDe, versPage } from "@/lib/auth";
import { GENRES } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/preferences
 *
 * Ce qu'un appareil veut recevoir. Une case decochee n'arrive pas dans le
 * formulaire : chaque genre est donc relu, present ou absent, et ecrit tel
 * quel. Les colonnes portent le nom des genres — la liste de `GENRES` est
 * la seule chose qui relie les deux, et elle est fermee.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  const f = await req.formData();
  const id = Number(f.get("id"));
  if (!Number.isInteger(id)) return versPage(req, "/reglages/notifications");

  const colonnes = GENRES.map((g, i) => `${g.cle} = $${i + 3}`).join(", ");
  await q(`UPDATE abonnement_push SET ${colonnes} WHERE utilisateur_id = $1 AND id = $2`,
          [u.id, id, ...GENRES.map((g) => f.get(g.cle) === "on")]);
  return versPage(req, "/reglages/notifications?fait=enregistre");
}
