import { q } from "@/db";
import { peutConfigurer, utilisateurDe, versPage } from "@/lib/auth";
import { reveillerLeCompte } from "@/lib/borne";
import { normaliserTel, telPlausible, TEXTE_MAX } from "@/lib/sav";

export const dynamic = "force-dynamic";

const RETOUR = "/reglages/sav";

/**
 * POST /api/sav — le numero d'assistance affiche sur les bornes.
 *
 * Un numero vide EFFACE : c'est la seule facon de retirer l'affichage, et il
 * faut qu'elle existe. On ne peut pas obliger quelqu'un a garder pour toujours
 * un numero qu'il n'a plus.
 */
export async function POST(req: Request) {
  const u = await utilisateurDe(req);
  if (!u) return versPage(req, "/connexion");
  if (!peutConfigurer(u)) return versPage(req, "/reglages");

  const f = await req.formData();
  const tel = normaliserTel(String(f.get("tel") ?? ""));
  const texte = String(f.get("texte") ?? "").trim().slice(0, TEXTE_MAX);

  // Un numero saisi doit pouvoir servir. Un champ vide, lui, est une intention
  // claire : ne rien afficher.
  if (tel && !telPlausible(tel)) return versPage(req, `${RETOUR}?e=tel`);

  await q("UPDATE compte SET sav_tel = $2, sav_texte = $3 WHERE id = $1",
          [u.compte_id, tel || null, texte || null]);

  await reveillerLeCompte(u.compte_id, "assistance modifiée");
  return versPage(req, `${RETOUR}?fait=enregistre`);
}
