import { peutConfigurer, utilisateurDe, versPage, estRestreint } from "@/lib/auth";
import { creerSalon, NOM_MAX } from "@/lib/salons";

export const dynamic = "force-dynamic";

/**
 * POST /api/salons (nom, sujet) — un salon d'equipe de plus.
 *
 * Gerant ou proprietaire, et pas quelqu'un restreint a une borne : les
 * salons sont l'affaire du compte, comme le catalogue.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!peutConfigurer(u) || estRestreint(u)) return versPage(req, "/messages");
  const f = await req.formData();
  const nom = String(f.get("nom") ?? "").trim().slice(0, NOM_MAX);
  const sujet = String(f.get("sujet") ?? "").trim().slice(0, 120) || null;
  if (!nom) return versPage(req, "/messages?e=nom");
  const id = await creerSalon(u.compte_id, nom, sujet);
  return versPage(req, id ? `/messages/${id}` : "/messages?e=pris");
}
